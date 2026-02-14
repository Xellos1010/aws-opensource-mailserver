import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AddressInfo } from 'node:net';
import { createCmsApiServer } from './server';

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
    const { server } = createCmsApiServer({
      stateFilePath: join(tmp, 'state.json'),
      jwtSecret: 'jwt-secret',
      passwordSalt: 'salt',
      ownerEmail: 'owner@emcnotary.com',
      ownerName: 'Owner User',
      ownerPassword: 'ChangeMe123!',
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
    const { server } = createCmsApiServer({
      stateFilePath: join(tmp, 'state.json'),
      jwtSecret: 'jwt-secret',
      passwordSalt: 'salt',
      ownerEmail: 'owner@emcnotary.com',
      ownerName: 'Owner User',
      ownerPassword: 'ChangeMe123!',
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
