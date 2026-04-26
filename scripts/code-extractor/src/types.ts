export type ExtractorConfig = {
  version: string;
  /**
   * Base directory for `includedRoots`, `includedFiles`, import graph `relPath`, and TS path resolution.
   * Absolute paths are used as-is; relative paths are resolved from `process.cwd()` (the Nx workspace root).
   * Omit to use the current working directory (default monorepo extraction).
   */
  extractionRoot?: string;
  includedRoots: string[];
  /**
   * Optional explicit files to seed extraction, relative to `extractionRoot` when set,
   * otherwise relative to `process.cwd()`.
   */
  includedFiles?: string[];
  outputPath: string;

  /**
   * File types/extensions to include.
   * Keep this intentionally conservative to avoid pulling in large/binary artifacts.
   */
  includeExtensions: string[];

  /**
   * Exact file names to include (extensionless or special-name files like `Dockerfile`).
   */
  includeFileNames: string[];

  /**
   * Directory names to exclude (checked by path segment match).
   */
  excludeDirs: string[];

  /**
   * Regex strings (as regex sources, no surrounding `/` required) for including file paths.
   * If empty, only `includeExtensions` + `includeFileNames` apply.
   */
  includeFilePathRegexSources: string[];

  /**
   * Regex strings (as regex sources, no surrounding `/` required) for excluding file paths.
   * Examples:
   * - '^.*\\/node_modules\\/'
   * - '\\.map$'
   */
  excludeFilePathRegexSources: string[];

  /**
   * After the snapshot is written, optionally split it for AI platform upload limits.
   * CLI `--platform` / `--account-level` / `--split-max-mb` override these defaults.
   */
  targetAiPlatform?: 'none' | 'chatgpt';

  /**
   * Used with `targetAiPlatform=chatgpt` to pick a conservative default chunk size.
   * Mirrors foundry-context-export / `export-cleaned-context.sh` (`--account-level business`).
   */
  targetAiAccountLevel?: 'business' | 'team' | 'plus' | 'free' | 'enterprise';

  /**
   * Hard cap on each output part (bytes). When set, overrides tier defaults from `targetAiPlatform`.
   */
  splitMaxChunkBytes?: number;
};

