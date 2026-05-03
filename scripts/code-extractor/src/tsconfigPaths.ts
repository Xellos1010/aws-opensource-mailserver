import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

type TsConfigBase = {
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
};

export type TsPathResolver = {
  resolveAlias(specifier: string): string | null;
};

function tryResolveAliasWithStar(key: string, targetPattern: string, specifier: string): string | null {
  if (!key.includes('*') || !targetPattern.includes('*')) return null;

  // key: "@mm/*" => regex /^@mm\/(.+)$/
  const escaped = key.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`^${escaped[0]}(.+)$${escaped[1] ?? ''}`);
  const match = specifier.match(regex);
  if (!match || !match[1]) return null;

  const captured = match[1];
  return targetPattern.replace('*', captured);
}

export function createTsConfigPathResolver(workspaceRoot: string): TsPathResolver {
  const basePath = resolve(workspaceRoot, 'tsconfig.base.json');
  const rootPath = resolve(workspaceRoot, 'tsconfig.json');
  const tsconfigPath = existsSync(basePath) ? basePath : rootPath;
  if (!existsSync(tsconfigPath)) {
    return {
      resolveAlias: () => null,
    };
  }

  const raw = readFileSync(tsconfigPath, 'utf8');
  const parsedJson = ts.parseConfigFileTextToJson(tsconfigPath, raw);
  if (parsedJson.error) {
    throw new Error(ts.flattenDiagnosticMessageText(parsedJson.error.messageText, '\n'));
  }
  const parsed = (parsedJson.config ?? {}) as TsConfigBase;

  const paths = parsed.compilerOptions?.paths;
  if (!paths) {
    return {
      resolveAlias: () => null,
    };
  }

  const entries = Object.entries(paths);

  function resolveAlias(specifier: string): string | null {
    for (const [aliasKey, targetPatterns] of entries) {
      for (const targetPattern of targetPatterns) {
        if (aliasKey.includes('*')) {
          const resolvedTarget = tryResolveAliasWithStar(aliasKey, targetPattern, specifier);
          if (resolvedTarget) return resolve(workspaceRoot, resolvedTarget);
        } else {
          if (aliasKey === specifier) {
            // targetPattern is expected to be a concrete file path
            return resolve(workspaceRoot, targetPattern);
          }
        }
      }
    }
    return null;
  }

  return { resolveAlias };
}

