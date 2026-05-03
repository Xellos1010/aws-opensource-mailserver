import { writeFile, readFile, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

export type TargetAiPlatform = 'none' | 'chatgpt';

export type AccountLevel = 'business' | 'team' | 'plus' | 'free' | 'enterprise' | 'consumer';

/**
 * Resolves max UTF-8 byte size per output part.
 * Precedence: explicit bytes → `--split-max-mb` (caller) → tier defaults for `chatgpt` → no split.
 */
export function resolveSplitMaxChunkBytes(input: {
  platform: TargetAiPlatform;
  accountLevel?: string;
  explicitMaxChunkBytes?: number;
}): number | null {
  if (input.explicitMaxChunkBytes != null && input.explicitMaxChunkBytes > 0) {
    return Math.floor(input.explicitMaxChunkBytes);
  }
  if (input.platform === 'none') return null;

  if (input.platform === 'chatgpt') {
    const level = (input.accountLevel ?? 'business').toLowerCase();
    // Conservative sizes for ChatGPT project / knowledge uploads (stay well under common ~25MiB soft limits).
    if (level === 'business' || level === 'team' || level === 'enterprise') {
      return 8 * 1024 * 1024;
    }
    if (level === 'plus') {
      return 12 * 1024 * 1024;
    }
    return 8 * 1024 * 1024;
  }

  return null;
}

export function normalizeTargetAiPlatform(raw: string | undefined): TargetAiPlatform {
  if (!raw) return 'none';
  const v = raw.trim().toLowerCase();
  if (v === 'none' || v === 'off' || v === 'false') return 'none';
  if (v === 'chatgpt') return 'chatgpt';
  return 'none';
}

export function buildSplitPlatformLabel(input: {
  platform: TargetAiPlatform;
  accountLevel: string;
  maxChunkBytes: number;
}): string {
  const mb = Math.max(1, Math.round(input.maxChunkBytes / (1024 * 1024)));
  if (input.platform === 'chatgpt') {
    return `chatgpt; account-level=${input.accountLevel}; ~${mb}MiB UTF-8 per part`;
  }
  return `line-split snapshot; ~${mb}MiB UTF-8 per part`;
}

function deriveStemAndExt(outputPath: string): { dir: string; stem: string; ext: string } {
  const dir = dirname(outputPath);
  const base = basename(outputPath);
  const ext = extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  return { dir, stem, ext: ext || '.txt' };
}

/**
 * Splits a snapshot text file into `stem-part-NNN.ext` parts at newline boundaries.
 * Removes the original `outputPath` after successful split (only parts remain).
 */
export async function splitSnapshotOutputFile(input: {
  outputPath: string;
  maxChunkBytes: number;
  platformLabel: string;
}): Promise<string[]> {
  const { outputPath, maxChunkBytes, platformLabel } = input;
  if (maxChunkBytes < 64 * 1024) {
    throw new Error(`split max chunk too small (${maxChunkBytes}); use at least 64KiB`);
  }

  const { dir, stem, ext } = deriveStemAndExt(outputPath);
  const written: string[] = [];
  const full = await readFile(outputPath, 'utf8');
  const normalized = full.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  let part = 0;
  let currentLines: string[] = [];
  let partBytes = 0;

  const flushPart = async (): Promise<void> => {
    part += 1;
    const currentPath = join(dir, `${stem}-part-${String(part).padStart(3, '0')}${ext}`);
    const body = `${currentLines.join('\n')}\n`;
    await writeFile(currentPath, body, 'utf8');
    written.push(currentPath);
  };

  for (const line of lines) {
    const withNl = `${line}\n`;
    const lineBytes = Buffer.byteLength(withNl, 'utf8');

    if (partBytes + lineBytes > maxChunkBytes && currentLines.length > 0) {
      await flushPart();
      currentLines = [];
      partBytes = 0;
    }

    if (part > 0 && currentLines.length === 0) {
      const header =
        `# code-extractor snapshot (continuation)\n` +
        `# split for: ${platformLabel}\n` +
        `# part: ${part + 1} (see ${basename(outputPath)} metadata in part 1)\n` +
        `---`;
      currentLines.push(header);
      partBytes += Buffer.byteLength(`${header}\n`, 'utf8');
    }

    currentLines.push(line);
    partBytes += lineBytes;
  }

  if (currentLines.length > 0) {
    await flushPart();
  }

  await unlink(outputPath);
  return written;
}
