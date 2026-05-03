import { extname, basename } from 'node:path';
import type { ExtractorConfig } from './types';

function compileSources(sources: string[]): RegExp[] {
  return sources
    .filter((s) => s.trim().length > 0)
    .map((source) => new RegExp(source, 'i'));
}

export function createFileFilter(config: ExtractorConfig) {
  const includeExts = new Set(config.includeExtensions.map((e) => e.toLowerCase()));
  const includeNames = new Set(config.includeFileNames.map((n) => n));

  const includePathRegexes = compileSources(config.includeFilePathRegexSources);
  const excludePathRegexes = compileSources(config.excludeFilePathRegexSources);
  const excludeDirs = new Set(config.excludeDirs);

  function isExcludedByDir(absPath: string): boolean {
    const parts = absPath.split(/[/\\]/);
    for (const part of parts) {
      if (excludeDirs.has(part)) return true;
    }
    return false;
  }

  function isExcludedByPathRegex(relPath: string): boolean {
    for (const rx of excludePathRegexes) {
      if (rx.test(relPath)) return true;
    }
    return false;
  }

  function isIncludedByNameOrExt(absPath: string): boolean {
    const base = basename(absPath);
    if (includeNames.has(base)) return true;

    const ext = extname(absPath).toLowerCase();
    if (includeExts.has(ext)) return true;

    for (const rx of includePathRegexes) {
      if (rx.test(absPath)) return true;
    }

    return false;
  }

  return {
    isIncluded(absPath: string, relPath: string): boolean {
      if (isExcludedByDir(absPath)) return false;
      if (isExcludedByPathRegex(relPath)) return false;
      return isIncludedByNameOrExt(absPath);
    },
  };
}

