import { join } from 'node:path';
import { newDb } from 'pg-mem';
import { CmsService, createDefaultState } from '@mm/cms-core';
import { applyMigrations } from './migrations';
import { PostgresStateStore } from './postgres-state-store';

function migrationDir(): string {
  return join(process.cwd(), 'libs/cms/persistence/migrations');
}

describe('PostgresStateStore', () => {
  async function teardown(store: PostgresStateStore, pool: { end?: () => Promise<void> }) {
    await store.close();
    await pool.end?.();
  }

  async function setup() {
    const db = newDb();
    const adapter = db.adapters.createPg();
    const pool = new adapter.Pool();
    const applied = await applyMigrations(pool as any, migrationDir());

    const store = new PostgresStateStore({
      connectionString: 'postgres://unused',
      passwordSalt: 'cms-local-password-salt',
      ownerPassword: 'ChangeMe123!',
      ownerEmail: 'owner@emcnotary.com',
      ownerName: 'Owner User',
      pool: pool as any,
      useTableLock: false,
    });

    const service = new CmsService(store, {
      jwtSecret: 'test-jwt-secret',
      passwordSalt: 'cms-local-password-salt',
      accessTokenTtlSeconds: 1800,
      refreshTokenTtlSeconds: 604800,
    });

    return { db, pool, store, service, applied };
  }

  it('applies migrations idempotently', async () => {
    const db = newDb();
    const adapter = db.adapters.createPg();
    const pool = new adapter.Pool();

    const first = await applyMigrations(pool as any, migrationDir());
    const second = await applyMigrations(pool as any, migrationDir());

    expect(first).toContain('001_init_schema.sql');
    expect(first).toContain('002_seed_defaults.sql');
    expect(second).toEqual([]);
    await pool.end?.();
  });

  it('supports contact and message CRUD flows', async () => {
    const { service, store, pool } = await setup();
    const session = await service.login('owner@emcnotary.com', 'ChangeMe123!');
    const actor = service.authenticate(`Bearer ${session.tokens.accessToken}`);

    const contact = await service.createContact(actor, {
      firstName: 'Taylor',
      lastName: 'Brooks',
      email: 'taylor@example.com',
      phone: '+15555550101',
    });

    await service.addContactNote(actor, contact.id, 'Reached out on Tuesday.');

    const queuedEmail = await service.sendEmail(actor, {
      to: 'taylor@example.com',
      from: 'CertifiedLSA@emcnotary.com',
      subject: 'Follow-up',
      body: 'Thanks for connecting today.',
      contactId: contact.id,
    });

    expect(contact.id).toMatch(/^con_/);
    expect(queuedEmail.status).toBe('queued');

    const flags = await service.getFeatureFlags();
    expect(flags.smsEnabled).toBe(false);
    await teardown(store, pool as any);
  });

  it('deduplicates concurrent duplicate webhook events', async () => {
    const { service, store, pool } = await setup();

    const session = await service.login('owner@emcnotary.com', 'ChangeMe123!');
    const actor = service.authenticate(`Bearer ${session.tokens.accessToken}`);

    const call = await service.createOutboundCallIntent(actor, {
      contactId: 'con_1',
      fromNumber: '+15550000000',
      toNumber: '+15550000001',
      provider: 'twilio',
    });

    await service.bindProviderCall(call.id, {
      provider: 'twilio',
      providerCallId: 'TWILIO_CALL_123',
    });

    const payload = {
      providerCallId: 'TWILIO_CALL_123',
      eventType: 'completed',
    };

    const requests = Array.from({ length: 8 }).map(() =>
      service.ingestTelephonyEvents('twilio', [
        {
          providerCallId: 'TWILIO_CALL_123',
          eventId: 'evt-race-1',
          eventType: 'completed',
          eventAt: new Date().toISOString(),
          payload,
          mappedStatus: 'completed',
        },
      ])
    );

    const results = await Promise.all(requests);
    const accepted = results.reduce((total, current) => total + current.accepted, 0);
    const ignored = results.reduce((total, current) => total + current.ignored, 0);

    expect(accepted).toBe(1);
    expect(ignored).toBe(7);
    await teardown(store, pool as any);
  });

  it('handles retention purge and job requeue flows', async () => {
    const { service, store, pool } = await setup();

    const session = await service.login('owner@emcnotary.com', 'ChangeMe123!');
    const actor = service.authenticate(`Bearer ${session.tokens.accessToken}`);

    const message = await service.sendEmail(actor, {
      from: 'CertifiedLSA@emcnotary.com',
      to: 'ops@example.com',
      subject: 'Queue Test',
      body: 'hello',
    });

    const claimed = await service.claimDueJobs(10);
    expect(claimed.claimed.length).toBeGreaterThan(0);

    await service.requeueJob(claimed.claimed[0], 0);
    const claimedAgain = await service.claimDueJobs(10);
    expect(claimedAgain.claimed.length).toBeGreaterThan(0);

    await service.setMessageStatus(message.id, 'sent', { provider: 'mock' });

    const purgeResult = await service.runRetentionPurge(0);
    expect(typeof purgeResult.purgedRecordings).toBe('number');
    expect(typeof purgeResult.purgedTranscripts).toBe('number');
    await teardown(store, pool as any);
  });

  it('imports a JSON CmsState snapshot correctly', async () => {
    const { store, pool } = await setup();
    const snapshot = createDefaultState({
      passwordSalt: 'cms-local-password-salt',
      ownerEmail: 'owner@emcnotary.com',
      ownerName: 'Owner User',
      ownerPassword: 'ChangeMe123!',
    });

    snapshot.contacts.push({
      id: 'con_99',
      accountId: 'acc_1',
      firstName: 'Import',
      lastName: 'Check',
      stageId: 'new',
      ownerUserId: 'usr_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      email: 'import.check@example.com',
      phone: '+15555550999',
    });
    snapshot.counters.contact = Math.max(snapshot.counters.contact, 99);

    await store.writeState(snapshot);
    const loaded = await store.read();

    expect(loaded.contacts.some((item) => item.id === 'con_99')).toBe(true);
    expect(loaded.counters.contact).toBeGreaterThanOrEqual(99);
    await teardown(store, pool as any);
  });
});
