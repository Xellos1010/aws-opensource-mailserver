import type { ExtractorConfig } from './src/types';

const defaultExcludeDirs = [
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nx',
  '.turbo',
  '.cache',
  'coverage',
  'cdk.out',
  '.git',
  '.idea',
  '.vscode',
  'tmp',
  'temp',
  'reports',
];

export const extractorConfig: ExtractorConfig = {
  version: '1.0.0',
  includedRoots: [
    'infra/emc-notary/emc-notary-cdk',
    'infra/emc-notary/outbound-dialer-cdk',
    'infra/emc-notary/email-service-cdk',
    'apps/modernized-emcnotary',
    'apps/modernized-emcnotary-api',
    'apps/dashboard-domain-dashboard',
  ],
  outputPath: 'exports/emcnotary-ai-snapshot.txt',
  includeExtensions: [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.md',
    '.mdx',
    '.sh',
    '.bash',
    '.sql',
    '.graphql',
    '.gql',
  ],
  includeFileNames: [
    'Dockerfile',
    '.env.example',
  ],
  includeFilePathRegexSources: [
    // Some config files don't follow extensions consistently across toolchains.
    // Use regex sources so the extractor can match them exactly.
    '^.*\\/pnpm-workspace\\.yaml$',
    '^.*\\/nx\\.json$',
    '^.*\\/package\\.json$',
  ],
  excludeDirs: defaultExcludeDirs,
  excludeFilePathRegexSources: [
    '\\.map$',
    '\\.min\\.',
    '\\.chunk\\.',
    // Lockfiles
    '(^|\\/)(pnpm-lock\\.yaml|yarn\\.lock|package-lock\\.json|bun\\.lockb)($|\\/)',
    // Hidden directories (defensive; directory-level excludes are primary)
    '(^|\\/)(\\.[^\\/]+)($|\\/)',
    // Heuristic: skip snapshot/output artifacts if they exist under exports/
    '(^|\\/)exports\\/',
  ],
};

export default extractorConfig;

