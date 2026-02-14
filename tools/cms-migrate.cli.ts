#!/usr/bin/env tsx

import { hashPassword } from '@mm/cms-core';
import {
  PostgresStateStore,
  applyMigrations,
  createSqlPool,
  resolveMigrationDir,
} from '@mm/cms-persistence';

interface Args {
  migrationDir?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--migration-dir') {
      args.migrationDir = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = env('CMS_DATABASE_URL');
  const passwordSalt = env('CMS_PASSWORD_SALT', 'cms-local-password-salt');
  const ownerEmail = env('CMS_OWNER_EMAIL', 'owner@emcnotary.com');
  const ownerName = env('CMS_OWNER_NAME', 'Owner User');
  const ownerPassword = env('CMS_OWNER_PASSWORD', 'ChangeMe123!');

  const migrationDir = resolveMigrationDir(args.migrationDir);
  const pool = createSqlPool({ connectionString: databaseUrl });

  const applied = await applyMigrations(pool, migrationDir);

  const store = new PostgresStateStore({
    connectionString: databaseUrl,
    passwordSalt,
    ownerEmail,
    ownerName,
    ownerPassword,
  });

  // Ensure seeded owner aligns with current runtime credentials.
  await store.mutate((state) => {
    const owner = state.users.find((candidate) => candidate.roles.includes('owner'));
    if (!owner) {
      return;
    }

    owner.email = ownerEmail;
    owner.displayName = ownerName;
    owner.passwordHash = hashPassword(ownerPassword, passwordSalt);
    owner.updatedAt = new Date().toISOString();
  });

  await store.close();
  await pool.end?.();

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        migrationDir,
        applied,
        appliedCount: applied.length,
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
