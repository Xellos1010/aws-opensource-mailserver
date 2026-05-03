import { CmsState } from './state';

export type CmsStoreBackend = 'json' | 'postgres';

export interface CmsStateStore {
  readonly backend: CmsStoreBackend;
  read(): Promise<CmsState>;
  mutate<T>(mutator: (state: CmsState) => T | Promise<T>): Promise<T>;
}
