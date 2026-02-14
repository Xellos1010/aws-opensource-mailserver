import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AddressInfo } from 'node:net';
import { createCmsApiServer } from './server';
import { JsonStateStore } from '@mm/cms-core';
import { newDb } from 'pg-mem';
import { applyMigrations, PostgresStateStore } from '@mm/cms-persistence';

describe('cms-api integration', () => {
  function sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  async function login(baseUrl: string): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@emcnotary.com',
        password: 'ChangeMe123!',
      }),
    });
    const payload = (await response.json()) as any;
    return payload.tokens.accessToken as string;
  }

  it('deduplicates twilio webhook events', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cms-api-'));
    const secret = 'local-twilio-secret';
    const stateStore = new JsonStateStore({
      filePath: join(tmp, 'state.json'),
      passwordSalt: 'salt',
      ownerEmail: 'owner@emcnotary.com',
      ownerName: 'Owner User',
      ownerPassword: 'ChangeMe123!',
    });
    const { server } = createCmsApiServer({
      stateStore,
      jwtSecret: 'jwt-secret',
      passwordSalt: 'salt',
      twilioWebhookSecret: secret,
      accessTokenTtlSeconds: 1800,
      refreshTokenTtlSeconds: 604800,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const token = await login(baseUrl);

    const callResponse = await fetch(`${baseUrl}/calls/start`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        contactId: 'con_1',
        fromNumber: '+15550000000',
        toNumber: '+15550000001',
      }),
    });
    const callPayload = (await callResponse.json()) as any;
    const providerCallId = callPayload.call.providerCallId as string;

    const webhookBody = JSON.stringify({
      eventId: 'evt_1',
      CallSid: providerCallId,
      CallStatus: 'completed',
    });
    const signature = sign(webhookBody, secret);

    const first = await fetch(`${baseUrl}/webhooks/telephony/twilio`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-twilio-signature': signature,
      },
      body: webhookBody,
    });
    const firstPayload = (await first.json()) as any;

    const second = await fetch(`${baseUrl}/webhooks/telephony/twilio`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-twilio-signature': signature,
      },
      body: webhookBody,
    });
    const secondPayload = (await second.json()) as any;

    expect(firstPayload.accepted).toBe(1);
    expect(secondPayload.ignored).toBe(1);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    rmSync(tmp, { recursive: true, force: true });
  });

  it('hard-blocks sms endpoint by default policy', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cms-api-'));
    const secret = 'local-twilio-secret';
    const stateStore = new JsonStateStore({
      filePath: join(tmp, 'state.json'),
      passwordSalt: 'salt',
      ownerEmail: 'owner@emcnotary.com',
      ownerName: 'Owner User',
      ownerPassword: 'ChangeMe123!',
    });
    const { server } = createCmsApiServer({
      stateStore,
      jwtSecret: 'jwt-secret',
      passwordSalt: 'salt',
      twilioWebhookSecret: secret,
      accessTokenTtlSeconds: 1800,
      refreshTokenTtlSeconds: 604800,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const token = await login(baseUrl);

    const smsResponse = await fetch(`${baseUrl}/messages/sms/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: '+15550000001',
        from: '+15550000000',
        body: 'hello',
      }),
    });
    const payload = (await smsResponse.json()) as any;

    expect(smsResponse.status).toBe(403);
    expect(payload.error.code).toBe('POLICY_BLOCKED');

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('cms-api postgres integration', () => {
  function sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  async function setupPostgresServer() {
    const secret = 'local-twilio-secret';
    const db = newDb();
    const adapter = db.adapters.createPg();
    const pool = new adapter.Pool();
    await applyMigrations(
      pool as any,
      join(process.cwd(), 'libs/cms/persistence/migrations')
    );

    const stateStore = new PostgresStateStore({
      connectionString: 'postgres://unused',
      passwordSalt: 'cms-local-password-salt',
      ownerEmail: 'owner@emcnotary.com',
      ownerName: 'Owner User',
      ownerPassword: 'ChangeMe123!',
      pool: pool as any,
      useTableLock: false,
    });

    const { server } = createCmsApiServer({
      stateStore,
      jwtSecret: 'jwt-secret',
      passwordSalt: 'cms-local-password-salt',
      twilioWebhookSecret: secret,
      accessTokenTtlSeconds: 1800,
      refreshTokenTtlSeconds: 604800,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    return { server, baseUrl, secret };
  }

  async function login(baseUrl: string): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@emcnotary.com',
        password: 'ChangeMe123!',
      }),
    });
    const payload = (await response.json()) as any;
    return payload.tokens.accessToken as string;
  }

  it('runs existing route flow in postgres backend mode', async () => {
    const { server, baseUrl } = await setupPostgresServer();

    const token = await login(baseUrl);
    const contactsResponse = await fetch(`${baseUrl}/contacts`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const contactsPayload = (await contactsResponse.json()) as any;

    expect(contactsResponse.status).toBe(200);
    expect(Array.isArray(contactsPayload.contacts)).toBe(true);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('deduplicates duplicate webhook race in postgres backend mode', async () => {
    const { server, baseUrl, secret } = await setupPostgresServer();
    const token = await login(baseUrl);

    const callResponse = await fetch(`${baseUrl}/calls/start`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        contactId: 'con_1',
        fromNumber: '+15550000000',
        toNumber: '+15550000001',
      }),
    });
    const callPayload = (await callResponse.json()) as any;
    const providerCallId = callPayload.call.providerCallId as string;

    const webhookBody = JSON.stringify({
      eventId: 'evt_pg_race_1',
      CallSid: providerCallId,
      CallStatus: 'completed',
    });
    const signature = sign(webhookBody, secret);

    const responses = await Promise.all(
      Array.from({ length: 6 }).map(() =>
        fetch(`${baseUrl}/webhooks/telephony/twilio`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-twilio-signature': signature,
          },
          body: webhookBody,
        }).then((response) => response.json() as Promise<any>)
      )
    );

    const totalAccepted = responses.reduce(
      (total, payload) => total + Number(payload.accepted ?? 0),
      0
    );
    const totalIgnored = responses.reduce(
      (total, payload) => total + Number(payload.ignored ?? 0),
      0
    );

    expect(totalAccepted).toBe(1);
    expect(totalIgnored).toBe(5);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
