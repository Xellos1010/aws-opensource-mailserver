import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqlQueryable } from './sql-client';
import { withTransaction } from './postgres-client';
import { SqlPool } from './sql-client';

export interface MigrationRecord {
  name: string;
  appliedAt: string;
}

export function resolveMigrationDir(customDir?: string): string {
  if (customDir) {
    return customDir;
  }
  return join(process.cwd(), 'libs/cms/persistence/migrations');
}

export function listMigrationFiles(migrationDir: string): string[] {
  return readdirSync(migrationDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}

export async function ensureMigrationTable(db: SqlQueryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS cms_schema_migrations (
      name TEXT,
      applied_at TEXT
    );
  `);
}

export async function getAppliedMigrations(db: SqlQueryable): Promise<MigrationRecord[]> {
  const result = await db.query<{ name: string; applied_at: string }>(
    'SELECT name, applied_at FROM cms_schema_migrations ORDER BY name ASC'
  );
  return result.rows.map((row) => ({
    name: row.name,
    appliedAt: row.applied_at,
  }));
}

export async function applyMigrations(pool: SqlPool, migrationDir: string): Promise<string[]> {
  return withTransaction(pool, async (db) => {
    await ensureMigrationTable(db);

    const files = listMigrationFiles(migrationDir);
    const applied = await getAppliedMigrations(db);
    const appliedSet = new Set(applied.map((item) => item.name));
    const executed: string[] = [];

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      const sql = readFileSync(join(migrationDir, file), 'utf8');
      await db.query(sql);
      await db.query('INSERT INTO cms_schema_migrations (name, applied_at) VALUES ($1, $2)', [
        file,
        new Date().toISOString(),
      ]);
      executed.push(file);
    }

    return executed;
  });
}
