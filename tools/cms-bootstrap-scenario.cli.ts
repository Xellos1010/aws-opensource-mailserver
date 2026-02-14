#!/usr/bin/env tsx

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }
  return value;
}

async function run(): Promise<void> {
  const apiBase = env('CMS_API_BASE_URL', 'http://localhost:4010');
  const simBase = env('CMS_TWILIO_SIM_BASE_URL', 'http://localhost:4050');
  const ownerEmail = env('CMS_OWNER_EMAIL', 'owner@emcnotary.com');
  const ownerPassword = env('CMS_OWNER_PASSWORD', 'ChangeMe123!');

  const loginResponse = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
  });
  const loginPayload = await loginResponse.json();
  const token = loginPayload.tokens.accessToken as string;

  const contactResponse = await fetch(`${apiBase}/contacts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      firstName: 'Local',
      lastName: 'Scenario',
      email: 'local.scenario@example.com',
      phone: '+15555550125',
      jobTitle: 'Title Contact',
    }),
  });
  const contactPayload = await contactResponse.json();
  const contactId = contactPayload.contact.id as string;

  const callResponse = await fetch(`${apiBase}/calls/start`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      contactId,
      fromNumber: '+15550000000',
      toNumber: '+15555550125',
    }),
  });
  const callPayload = await callResponse.json();
  const providerCallId = callPayload.call.providerCallId as string;

  await fetch(`${simBase}/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ providerCallId }),
  });

  const emailResponse = await fetch(`${apiBase}/messages/email/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      from: 'CertifiedLSA@emcnotary.com',
      to: 'local.scenario@example.com',
      subject: 'Scenario Email',
      body: 'This is a local scenario email.',
      contactId,
    }),
  });
  const emailPayload = await emailResponse.json();

  const smsResponse = await fetch(`${apiBase}/messages/sms/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      from: '+15550000000',
      to: '+15555550125',
      body: 'This should be policy blocked.',
      contactId,
    }),
  });
  const smsPayload = await smsResponse.json();

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        contactId,
        providerCallId,
        emailMessageId: emailPayload.message?.id,
        smsStatus: smsResponse.status,
        smsCode: smsPayload.error?.code,
      },
      null,
      2
    )
  );
}

void run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
