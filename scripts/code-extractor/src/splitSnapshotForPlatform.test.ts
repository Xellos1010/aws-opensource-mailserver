import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSplitPlatformLabel,
  normalizeTargetAiPlatform,
  resolveSplitMaxChunkBytes,
  splitSnapshotOutputFile,
} from './splitSnapshotForPlatform';

describe('splitSnapshotForPlatform', () => {
  it('resolveSplitMaxChunkBytes prefers explicit cap over platform tier', () => {
    assert.equal(
      resolveSplitMaxChunkBytes({
        platform: 'chatgpt',
        accountLevel: 'business',
        explicitMaxChunkBytes: 500,
      }),
      500
    );
  });

  it('resolveSplitMaxChunkBytes maps chatgpt business to 8MiB', () => {
    assert.equal(
      resolveSplitMaxChunkBytes({
        platform: 'chatgpt',
        accountLevel: 'business',
      }),
      8 * 1024 * 1024
    );
  });

  it('resolveSplitMaxChunkBytes returns null for none without explicit', () => {
    assert.equal(resolveSplitMaxChunkBytes({ platform: 'none' }), null);
  });

  it('normalizeTargetAiPlatform handles common variants', () => {
    assert.equal(normalizeTargetAiPlatform(undefined), 'none');
    assert.equal(normalizeTargetAiPlatform('none'), 'none');
    assert.equal(normalizeTargetAiPlatform('ChatGPT'), 'chatgpt');
  });

  it('buildSplitPlatformLabel includes account level for chatgpt', () => {
    const label = buildSplitPlatformLabel({
      platform: 'chatgpt',
      accountLevel: 'business',
      maxChunkBytes: 8 * 1024 * 1024,
    });
    assert.match(label, /chatgpt/);
    assert.match(label, /business/);
  });

  it('splitSnapshotOutputFile splits on newlines and removes the original', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'code-extractor-split-'));
    const inputPath = join(dir, 'snapshot.txt');
    const lines = Array.from({ length: 1500 }, (_, i) => `LINE_${String(i).padStart(4, '0')}_${'x'.repeat(120)}`);
    await writeFile(inputPath, `${lines.join('\n')}\n`, 'utf8');

    const parts = await splitSnapshotOutputFile({
      outputPath: inputPath,
      maxChunkBytes: 64 * 1024,
      platformLabel: 'test',
    });

    assert.ok(parts.length >= 2);
    for (const p of parts) {
      const body = await readFile(p, 'utf8');
      assert.ok(body.length > 0);
    }
  });
});
