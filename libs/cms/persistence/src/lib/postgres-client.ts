import { Pool } from 'pg';
import { DbUnavailableError } from '@mm/cms-core';
import { SqlClient, SqlPool, SqlQueryable, SqlQueryResult } from './sql-client';

export interface PostgresClientConfig {
  connectionString: string;
  maxPoolSize?: number;
  idleTimeoutMs?: number;
  statementTimeoutMs?: number;
}

export function createSqlPool(config: PostgresClientConfig): SqlPool {
  return new Pool({
    connectionString: config.connectionString,
    max: config.maxPoolSize ?? 10,
    idleTimeoutMillis: config.idleTimeoutMs ?? 10000,
    statement_timeout: config.statementTimeoutMs ?? 30000,
  }) as unknown as SqlPool;
}

export async function withClient<T>(pool: SqlPool, fn: (client: SqlClient) => Promise<T>): Promise<T> {
  let client: SqlClient | null = null;
  try {
    client = await pool.connect();
    return await fn(client);
  } catch (error) {
    throw mapDbError(error);
  } finally {
    client?.release();
  }
}

export async function withTransaction<T>(
  pool: SqlPool,
  fn: (client: SqlQueryable) => Promise<T>
): Promise<T> {
  return withClient(pool, async (client) => {
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw mapDbError(error);
    }
  });
}

export function mapDbError(error: unknown): Error {
  if (error instanceof DbUnavailableError) {
    return error;
  }

  if (error && typeof error === 'object') {
    const maybe = error as { code?: string; message?: string };
    const retriableCodes = new Set(['ECONNREFUSED', 'ECONNRESET', '57P01', '57P02', '57P03', '08006']);
    if (maybe.code && retriableCodes.has(maybe.code)) {
      return new DbUnavailableError(maybe.message ?? 'Database unavailable', {
        pgCode: maybe.code,
      });
    }
    if (maybe.message?.toLowerCase().includes('connect')) {
      return new DbUnavailableError(maybe.message, {
        pgCode: maybe.code,
      });
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Unknown database error');
}

export async function pingSqlPool(pool: SqlPool): Promise<boolean> {
  try {
    const result = await pool.query<{ ok: number }>('SELECT 1::int AS ok');
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

export function toSqlJsonb(value: unknown): string {
  return JSON.stringify(value);
}

export function fromSqlJsonb<T>(result: SqlQueryResult<{ data: T }>): T[] {
  return result.rows.map((row) => row.data);
}
