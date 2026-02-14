import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDefaultState } from './default-state';
import { CmsState } from './state';

export interface JsonStateStoreOptions {
  filePath: string;
  passwordSalt: string;
  ownerEmail?: string;
  ownerName?: string;
  ownerPassword?: string;
}

export class JsonStateStore {
  private readonly filePath: string;
  private readonly passwordSalt: string;
  private readonly ownerEmail?: string;
  private readonly ownerName?: string;
  private readonly ownerPassword?: string;

  constructor(options: JsonStateStoreOptions) {
    this.filePath = options.filePath;
    this.passwordSalt = options.passwordSalt;
    this.ownerEmail = options.ownerEmail;
    this.ownerName = options.ownerName;
    this.ownerPassword = options.ownerPassword;
    this.ensureStateFile();
  }

  read(): CmsState {
    return this.loadState();
  }

  mutate<T>(mutator: (state: CmsState) => T): T {
    const state = this.loadState();
    const result = mutator(state);
    state.meta.updatedAt = new Date().toISOString();
    this.writeState(state);
    return result;
  }

  private ensureStateFile(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.filePath)) {
      const initial = createDefaultState({
        passwordSalt: this.passwordSalt,
        ownerEmail: this.ownerEmail,
        ownerName: this.ownerName,
        ownerPassword: this.ownerPassword,
      });
      this.writeState(initial);
    }
  }

  private loadState(): CmsState {
    const raw = readFileSync(this.filePath, 'utf8');
    return JSON.parse(raw) as CmsState;
  }

  private writeState(state: CmsState): void {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf8');
  }
}
