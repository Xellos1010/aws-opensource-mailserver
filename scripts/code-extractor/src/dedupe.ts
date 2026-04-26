import { createHash } from 'node:crypto';

export type Block = {
  hash: string;
  content: string;
};

export type BlockStore = {
  /**
   * Unique transformed blocks keyed by their structural hash.
   */
  blocksByHash: Map<string, Block>;
};

export function createBlockStore(): BlockStore {
  return {
    blocksByHash: new Map<string, Block>(),
  };
}

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Adds a new content blob to the store if it hasn't been seen.
 * @returns hash and whether the block was newly added.
 */
export function upsertBlock(store: BlockStore, content: string): { hash: string; isNew: boolean } {
  const hash = sha256Hex(content);
  const existing = store.blocksByHash.get(hash);
  if (existing) {
    return { hash, isNew: false };
  }

  store.blocksByHash.set(hash, { hash, content });
  return { hash, isNew: true };
}

