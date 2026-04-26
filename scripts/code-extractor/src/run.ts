import { dirname, resolve } from 'node:path';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { loadExtractorConfig, readCliArg, readConfigPathFromArgs } from './loadConfig';
import { runExtraction } from './extractor';
import {
  buildSplitPlatformLabel,
  normalizeTargetAiPlatform,
  resolveSplitMaxChunkBytes,
  splitSnapshotOutputFile,
} from './splitSnapshotForPlatform';

function parseRootsOverride(argv: string[]): string[] | null {
  const raw = readCliArg(argv, 'roots');
  if (!raw) return null;

  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseSplitMaxMb(argv: string[]): number | undefined {
  const raw = readCliArg(argv, 'split-max-mb');
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid --split-max-mb=${raw} (expected a positive number)`);
  }
  return Math.round(n * 1024 * 1024);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const configPath = readConfigPathFromArgs(argv);
  const outputOverride = readCliArg(argv, 'output');

  const config = await loadExtractorConfig(configPath);
  const rootsOverride = parseRootsOverride(argv);
  const effectiveConfig = rootsOverride ? { ...config, includedRoots: rootsOverride } : config;

  const outputPath = outputOverride
    ? resolve(process.cwd(), outputOverride)
    : resolve(process.cwd(), effectiveConfig.outputPath);

  const platformRaw = readCliArg(argv, 'platform') ?? effectiveConfig.targetAiPlatform;
  const accountLevelRaw =
    readCliArg(argv, 'account-level') ?? effectiveConfig.targetAiAccountLevel ?? 'business';
  const platform = normalizeTargetAiPlatform(platformRaw);
  const explicitFromCli = parseSplitMaxMb(argv);
  const explicitBytes = explicitFromCli ?? effectiveConfig.splitMaxChunkBytes;
  const maxChunk = resolveSplitMaxChunkBytes({
    platform,
    accountLevel: accountLevelRaw,
    explicitMaxChunkBytes: explicitBytes,
  });

  // Ensure output directory exists early so failures are easier to diagnose.
  await mkdir(dirname(outputPath), { recursive: true });

  const runStartPath = `${outputPath}.run-start`;
  await writeFile(
    runStartPath,
    `Starting extractor: config=${configPath} output=${outputPath}\n` +
      `platform=${platform} account-level=${accountLevelRaw}\n` +
      `split=${maxChunk == null ? 'no' : `yes (~${Math.round(maxChunk / (1024 * 1024))}MiB UTF-8 per part)`}\n`,
    'utf8'
  );

  await runExtraction({ config: effectiveConfig, outputPath });

  if (maxChunk != null) {
    const platformLabel = buildSplitPlatformLabel({
      platform,
      accountLevel: accountLevelRaw,
      maxChunkBytes: maxChunk,
    });
    const parts = await splitSnapshotOutputFile({
      outputPath,
      maxChunkBytes: maxChunk,
      platformLabel,
    });
    await appendFile(
      runStartPath,
      `splitDone: parts=${parts.length}\n${parts.map((p) => `  ${p}`).join('\n')}\n`
    );
    // eslint-disable-next-line no-console
    console.log(`Completed extraction; split into ${parts.length} part(s) for ${platformLabel}`);
    for (const p of parts) {
      // eslint-disable-next-line no-console
      console.log(`  ${p}`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(`Completed extraction for ${outputPath}`);
  }
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
