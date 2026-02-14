import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CmsService } from './service';
import { JsonStateStore } from './state-store';

describe('CmsService', () => {
  const baseConfig = {
    jwtSecret: 'test-secret',
    passwordSalt: 'test-salt',
    accessTokenTtlSeconds: 1800,
    refreshTokenTtlSeconds: 604800,
  };

  function createService() {
    const dir = mkdtempSync(join(tmpdir(), 'cms-core-'));
    const store = new JsonStateStore({
      filePath: join(dir, 'state.json'),
      passwordSalt: baseConfig.passwordSalt,
      ownerPassword: 'ChangeMe123!',
    });
    const service = new CmsService(store, baseConfig);
    return { service, dir };
  }

  afterEach(() => {
    // no-op; each test owns cleanup
  });

  it('authenticates default owner', () => {
    const { service, dir } = createService();
    const session = service.login('owner@emcnotary.com', 'ChangeMe123!');
    expect(session.user.email).toBe('owner@emcnotary.com');
    expect(session.tokens.accessToken.length).toBeGreaterThan(20);
    rmSync(dir, { recursive: true, force: true });
  });

  it('blocks invalid stage transition', () => {
    const { service, dir } = createService();
    const session = service.login('owner@emcnotary.com', 'ChangeMe123!');
    const actor = service.authenticate(`Bearer ${session.tokens.accessToken}`);
    const contact = service.listContacts()[0];
    expect(() => service.transitionStage(actor, contact.id, 'won')).toThrow('Invalid stage transition');
    rmSync(dir, { recursive: true, force: true });
  });

  it('hard-blocks sms by default', () => {
    const { service, dir } = createService();
    const session = service.login('owner@emcnotary.com', 'ChangeMe123!');
    const actor = service.authenticate(`Bearer ${session.tokens.accessToken}`);
    expect(() =>
      service.sendSms(actor, {
        from: '+15550000000',
        to: '+15550000001',
        body: 'test',
      })
    ).toThrow('SMS sending is disabled');
    rmSync(dir, { recursive: true, force: true });
  });
});
