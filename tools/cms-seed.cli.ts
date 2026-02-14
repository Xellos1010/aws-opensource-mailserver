#!/usr/bin/env tsx

interface SessionPayload {
  tokens: {
    accessToken: string;
  };
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }
  return value;
}

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: env('CMS_OWNER_EMAIL', 'owner@emcnotary.com'),
      password: env('CMS_OWNER_PASSWORD', 'ChangeMe123!'),
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`);
  }

  const payload = (await response.json()) as SessionPayload;
  return payload.tokens.accessToken;
}

async function createContact(
  baseUrl: string,
  token: string,
  input: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    jobTitle: string;
  }
): Promise<void> {
  const response = await fetch(`${baseUrl}/contacts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`createContact failed: ${response.status} ${detail}`);
  }
}

async function run(): Promise<void> {
  const baseUrl = env('CMS_API_BASE_URL', 'http://localhost:4010');
  const token = await login(baseUrl);

  const contacts = [
    {
      firstName: 'Taylor',
      lastName: 'Brooks',
      email: 'taylor.brooks@agency-example.com',
      phone: '+15555550101',
      jobTitle: 'Title Manager',
    },
    {
      firstName: 'Alex',
      lastName: 'Diaz',
      email: 'alex.diaz@agency-example.com',
      phone: '+15555550102',
      jobTitle: 'Escrow Assistant',
    },
    {
      firstName: 'Morgan',
      lastName: 'Chen',
      email: 'morgan.chen@agency-example.com',
      phone: '+15555550103',
      jobTitle: 'Operations Director',
    },
  ];

  for (const contact of contacts) {
    await createContact(baseUrl, token, contact);
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${contacts.length} contacts into ${baseUrl}`);
}

void run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
