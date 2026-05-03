import { SqlQueryable } from '../sql-client';
import { fromSqlJsonb, toSqlJsonb } from '../postgres-client';

export class JsonTableRepository<T extends { id: string }> {
  constructor(private readonly tableName: string) {}

  async list(db: SqlQueryable): Promise<T[]> {
    const result = await db.query<{ data: T }>(`SELECT data FROM ${this.tableName}`);
    return fromSqlJsonb<T>(result);
  }

  async replaceAll(db: SqlQueryable, items: T[]): Promise<void> {
    await db.query(`TRUNCATE TABLE ${this.tableName}`);
    for (const item of items) {
      await db.query(`INSERT INTO ${this.tableName} (id, data) VALUES ($1, $2::jsonb)`, [
        item.id,
        toSqlJsonb(item),
      ]);
    }
  }

  async upsert(db: SqlQueryable, item: T): Promise<void> {
    await db.query(
      `INSERT INTO ${this.tableName} (id, data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [item.id, toSqlJsonb(item)]
    );
  }
}

export class SingletonJsonRepository<T> {
  constructor(private readonly tableName: string, private readonly keyColumn = 'key') {}

  async get(db: SqlQueryable, key = 'default'): Promise<T | null> {
    const result = await db.query<{ data: T }>(
      `SELECT data FROM ${this.tableName} WHERE ${this.keyColumn} = $1 LIMIT 1`,
      [key]
    );
    return result.rows[0]?.data ?? null;
  }

  async set(db: SqlQueryable, value: T, key = 'default'): Promise<void> {
    await db.query(
      `INSERT INTO ${this.tableName} (${this.keyColumn}, data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (${this.keyColumn}) DO UPDATE SET data = EXCLUDED.data`,
      [key, toSqlJsonb(value)]
    );
  }
}

export class CounterRepository {
  async list(db: SqlQueryable): Promise<Record<string, number>> {
    const result = await db.query<{ counter_name: string; value: number }>(
      'SELECT counter_name, value FROM id_counters'
    );
    return Object.fromEntries(result.rows.map((row) => [row.counter_name, Number(row.value)]));
  }

  async replaceAll(db: SqlQueryable, counters: Record<string, number>): Promise<void> {
    await db.query('TRUNCATE TABLE id_counters');
    for (const [counterName, value] of Object.entries(counters)) {
      await db.query('INSERT INTO id_counters (counter_name, value) VALUES ($1, $2)', [
        counterName,
        value,
      ]);
    }
  }
}
