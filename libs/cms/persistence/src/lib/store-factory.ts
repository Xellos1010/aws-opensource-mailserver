import { CmsStateStore, JsonStateStore } from '@mm/cms-core';
import { PostgresStateStore } from './postgres-state-store';

export interface CmsStoreFactoryConfig {
  backend: 'json' | 'postgres';
  passwordSalt: string;
  ownerEmail?: string;
  ownerName?: string;
  ownerPassword?: string;
  stateFilePath?: string;
  databaseUrl?: string;
}

export function createCmsStateStore(config: CmsStoreFactoryConfig): CmsStateStore {
  if (config.backend === 'postgres') {
    if (!config.databaseUrl) {
      throw new Error('CMS_DATABASE_URL is required when CMS_STATE_BACKEND=postgres');
    }

    return new PostgresStateStore({
      connectionString: config.databaseUrl,
      passwordSalt: config.passwordSalt,
      ownerEmail: config.ownerEmail,
      ownerName: config.ownerName,
      ownerPassword: config.ownerPassword,
    });
  }

  return new JsonStateStore({
    filePath: config.stateFilePath ?? 'tmp/cms/data/state.json',
    passwordSalt: config.passwordSalt,
    ownerEmail: config.ownerEmail,
    ownerName: config.ownerName,
    ownerPassword: config.ownerPassword,
  });
}
