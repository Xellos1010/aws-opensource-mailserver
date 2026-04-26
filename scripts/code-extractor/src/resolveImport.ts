import { existsSync } from 'node:fs';
import { dirname, resolve, join, extname, basename } from 'node:path';
import type { ExtractorConfig } from './types';
import type { TsPathResolver } from './tsconfigPaths';

function uniqueList<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function fileExists(absPath: string): boolean {
  try {
    return existsSync(absPath);
  } catch {
    return false;
  }
}

function resolveWithExtensions(candidateBase: string, config: ExtractorConfig): string | null {
  const ext = extname(candidateBase).toLowerCase();
  if (ext.length > 0) {
    // If it already looks like a file with extension, respect it.
    if (fileExists(candidateBase)) return candidateBase;
  }

  const possibleExts = uniqueList(config.includeExtensions.map((e) => e.toLowerCase()));

  // Try direct base+ext (e.g. ./foo + .ts)
  for (const e of possibleExts) {
    const candidate = `${candidateBase}${e}`;
    if (fileExists(candidate)) return candidate;
  }

  // Try index files if candidateBase is a folder.
  for (const e of possibleExts) {
    const candidate = join(candidateBase, `index${e}`);
    if (fileExists(candidate)) return candidate;
  }

  return null;
}

export function resolveRelativeImport(
  fromFilePath: string,
  specifier: string,
  config: ExtractorConfig
): string | null {
  const fromDir = dirname(fromFilePath);
  const absTargetBase = resolve(fromDir, specifier);
  return resolveWithExtensions(absTargetBase, config);
}

export function resolveTsPathAlias(
  specifier: string,
  config: ExtractorConfig,
  tsResolver: TsPathResolver
): string | null {
  const absTarget = tsResolver.resolveAlias(specifier);
  if (!absTarget) return null;
  return resolveWithExtensions(absTarget, config) ?? absTarget;
}

export function isLikelyInternalModuleSpecifier(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('@');
}

