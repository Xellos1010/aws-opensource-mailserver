import {
  CmsState,
  CmsStateStore,
  DbUnavailableError,
  InitialUserConfig,
  createDefaultState,
} from '@mm/cms-core';
import { CmsRepositories } from './repositories/cms-repositories';
import { PostgresClientConfig, createSqlPool, mapDbError, withTransaction } from './postgres-client';
import { SqlPool } from './sql-client';

export interface PostgresStateStoreOptions extends InitialUserConfig {
  connectionString: string;
  maxPoolSize?: number;
  pool?: SqlPool;
  useTableLock?: boolean;
}

export class PostgresStateStore implements CmsStateStore {
  readonly backend = 'postgres' as const;

  private readonly pool: SqlPool;
  private readonly repositories = new CmsRepositories();
  private readonly initialUserConfig: InitialUserConfig;
  private readonly useTableLock: boolean;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(options: PostgresStateStoreOptions) {
    this.pool =
      options.pool ??
      createSqlPool({
        connectionString: options.connectionString,
        maxPoolSize: options.maxPoolSize,
      } as PostgresClientConfig);

    this.initialUserConfig = {
      passwordSalt: options.passwordSalt,
      ownerEmail: options.ownerEmail,
      ownerName: options.ownerName,
      ownerPassword: options.ownerPassword,
    };

    this.useTableLock = options.useTableLock ?? true;
  }

  async read(): Promise<CmsState> {
    try {
      return await withTransaction(this.pool, async (db) => {
        const state = await this.repositories.readState(db);
        if (state) {
          return state;
        }

        const initialized = createDefaultState(this.initialUserConfig);
        await this.repositories.replaceState(db, initialized);
        return initialized;
      });
    } catch (error) {
      throw this.toDbUnavailable(error);
    }
  }

  async mutate<T>(mutator: (state: CmsState) => T | Promise<T>): Promise<T> {
    try {
      if (!this.useTableLock) {
        return await this.withLocalMutationLock(async () => this.runMutation(mutator, false));
      }

      return await this.runMutation(mutator, true);
    } catch (error) {
      throw this.toDbUnavailable(error);
    }
  }

  async writeState(state: CmsState): Promise<void> {
    try {
      await withTransaction(this.pool, async (db) => {
        await this.repositories.replaceState(db, state);
      });
    } catch (error) {
      throw this.toDbUnavailable(error);
    }
  }

  async close(): Promise<void> {
    await this.pool.end?.();
  }

  private async runMutation<T>(
    mutator: (state: CmsState) => T | Promise<T>,
    useDbLock: boolean
  ): Promise<T> {
    return withTransaction(this.pool, async (db) => {
      if (useDbLock) {
        await db.query('LOCK TABLE cms_meta IN EXCLUSIVE MODE');
      }
      const existing = await this.repositories.readState(db);
      const state = existing ?? createDefaultState(this.initialUserConfig);
      const result = await mutator(state);
      state.meta.updatedAt = new Date().toISOString();
      await this.repositories.replaceState(db, state);
      return result;
    });
  }

  private async withLocalMutationLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release: (() => void) | null = null;
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await fn();
    } finally {
      release?.();
    }
  }

  private toDbUnavailable(error: unknown): Error {
    const mapped = mapDbError(error);
    if (mapped instanceof DbUnavailableError) {
      return mapped;
    }

    if (mapped instanceof Error) {
      return mapped;
    }

    return new DbUnavailableError('Database unavailable');
  }
}
