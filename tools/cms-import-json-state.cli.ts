#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { CmsState } from '@mm/cms-core';
import { PostgresStateStore, applyMigrations, createSqlPool, resolveMigrationDir } from '@mm/cms-persistence';

interface Args {
  stateFile: string;
  migrationDir?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    stateFile: 'tmp/cms/data/state.json',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--state-file') {
      args.stateFile = argv[i + 1];
      i += 1;
    }
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

function parseState(path: string): CmsState {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as CmsState;
  if (!parsed.meta || !parsed.users || !parsed.contacts || !parsed.featureFlags || !parsed.counters) {
    throw new Error(`Input file does not look like CmsState: ${path}`);
  }
  return parsed;
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const state = parseState(args.stateFile);
  const databaseUrl = env('CMS_DATABASE_URL');
  const passwordSalt = env('CMS_PASSWORD_SALT', 'cms-local-password-salt');

  const pool = createSqlPool({ connectionString: databaseUrl });
  await applyMigrations(pool, resolveMigrationDir(args.migrationDir));

  const store = new PostgresStateStore({
    connectionString: databaseUrl,
    passwordSalt,
  });

  await store.writeState(state);
  await store.close();
  await pool.end?.();

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        importedFrom: args.stateFile,
        users: state.users.length,
        contacts: state.contacts.length,
        calls: state.calls.length,
        messages: state.messages.length,
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
