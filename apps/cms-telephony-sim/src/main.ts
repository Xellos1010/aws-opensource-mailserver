import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }
  return value;
}

const config = {
  port: Number(env('CMS_TWILIO_SIM_PORT', '4050')),
  cmsApiBaseUrl: env('CMS_API_BASE_URL', 'http://localhost:4010'),
  twilioSecret: env('TWILIO_WEBHOOK_SECRET', 'local-twilio-secret'),
};

function sign(body: string): string {
  return createHmac('sha256', config.twilioSecret).update(body).digest('hex');
}

async function postWebhook(payload: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const raw = JSON.stringify(payload);
  const response = await fetch(`${config.cmsApiBaseUrl}/webhooks/telephony/twilio`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-twilio-signature': sign(raw),
    },
    body: raw,
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

const server = createServer(async (req, res) => {
  try {
    if ((req.method ?? 'GET') === 'GET' && (req.url ?? '/') === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'cms-telephony-sim',
          at: new Date().toISOString(),
        })
      );
      return;
    }

    if ((req.method ?? 'GET') === 'POST' && (req.url ?? '/') === '/replay') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks).toString('utf8') || '{}';
      const body = JSON.parse(rawBody) as Record<string, unknown>;

      const providerCallId = String(body.providerCallId ?? body.CallSid ?? `TWILIO_${randomUUID()}`);
      const eventIdBase = String(body.eventId ?? `evt_${randomUUID()}`);

      const events: Array<Record<string, unknown>> = [
        {
          eventId: `${eventIdBase}_ringing`,
          CallSid: providerCallId,
          CallStatus: 'ringing',
          Timestamp: new Date().toISOString(),
        },
        {
          eventId: `${eventIdBase}_inprogress`,
          CallSid: providerCallId,
          CallStatus: 'in-progress',
          Timestamp: new Date().toISOString(),
        },
        {
          eventId: `${eventIdBase}_completed`,
          CallSid: providerCallId,
          CallStatus: 'completed',
          RecordingSid: `${providerCallId}_recording`,
          RecordingUrl: `https://mock.local/recording/${providerCallId}.mp3`,
          Timestamp: new Date().toISOString(),
        },
      ];

      const results = [];
      for (const event of events) {
        results.push(await postWebhook(event));
      }

      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          providerCallId,
          results,
        })
      );
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
        },
      })
    );
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'unknown error',
        },
      })
    );
  }
});

server.listen(config.port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`cms-telephony-sim listening on ${config.port}`);
});
