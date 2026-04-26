import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { ExtractorConfig } from './types';

type LoadedConfigModule = {
  extractorConfig?: ExtractorConfig;
  default?: ExtractorConfig;
};

/** Reads `--key=value` style CLI args (first match wins). */
export function readCliArg(argv: string[], key: string): string | undefined {
  const prefix = `--${key}=`;
  for (const arg of argv) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
}

export function readConfigPathFromArgs(argv: string[]): string {
  return readCliArg(argv, 'config') ?? 'tools/code-extractor/extractor.config.ts';
}

export async function loadExtractorConfig(configPath: string): Promise<ExtractorConfig> {
  const absPath = resolve(process.cwd(), configPath);
  const href = pathToFileURL(absPath).href;

  const mod = (await import(href)) as LoadedConfigModule;
  const cfg = mod.extractorConfig ?? mod.default;
  if (!cfg) {
    throw new Error(`Failed to load extractor config from ${configPath}. Expected default export or extractorConfig named export.`);
  }

  return cfg;
}

