import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ExternalDependency, ExtractionModel } from './model';

function loadPackageVersions(packageJsonPath: string): Record<string, string> {
  try {
    if (!existsSync(packageJsonPath)) return {};
    const raw = readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return {
      ...(parsed.dependencies ?? {}),
      ...(parsed.devDependencies ?? {}),
    };
  } catch {
    return {};
  }
}

function getBarePackageName(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (!specifier || specifier.includes(' ')) return null;

  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }

  return specifier.split('/')[0] ?? null;
}

function dedupeAndSortDeps(deps: ExternalDependency[]): ExternalDependency[] {
  const seen = new Map<string, ExternalDependency>();
  for (const d of deps) {
    const prev = seen.get(d.name);
    if (!prev) {
      seen.set(d.name, d);
      continue;
    }
    // Prefer known version over unknown.
    if (prev.version === 'unknown' && d.version !== 'unknown') {
      seen.set(d.name, d);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function computeExternalDependencies(input: { model: ExtractionModel; workspaceRoot: string }): {
  externalDepsGlobal: ExternalDependency[];
  externalDepsByGroup: Record<string, ExternalDependency[]>;
} {
  const { model, workspaceRoot } = input;

  const rootPkgJsonPath = join(workspaceRoot, 'package.json');
  const rootVersions = loadPackageVersions(rootPkgJsonPath);

  const versionsByGroup: Record<string, Record<string, string>> = {};
  for (const group of model.groups) {
    if (group.rootRel === '<imports>') continue;
    const groupPkg = join(workspaceRoot, group.rootRel, 'package.json');
    versionsByGroup[group.groupId] = loadPackageVersions(groupPkg);
  }

  const depsByGroupNames: Record<string, Set<string>> = {};
  for (const group of model.groups) {
    depsByGroupNames[group.groupId] = new Set<string>();
  }

  for (const file of model.fileNodes) {
    const groupId = file.groupId;
    if (!depsByGroupNames[groupId]) depsByGroupNames[groupId] = new Set<string>();

    for (const specifier of file.externalImports) {
      const pkgName = getBarePackageName(specifier);
      if (!pkgName) continue;
      depsByGroupNames[groupId].add(pkgName);
    }
  }

  const externalDepsByGroup: Record<string, ExternalDependency[]> = {};
  const globalNames = new Set<string>();

  for (const [groupId, namesSet] of Object.entries(depsByGroupNames)) {
    const versionsForGroup = versionsByGroup[groupId] ?? {};
    const deps: ExternalDependency[] = [];

    for (const name of namesSet) {
      globalNames.add(name);
      const version = versionsForGroup[name] ?? rootVersions[name] ?? 'unknown';
      deps.push({ name, version });
    }

    externalDepsByGroup[groupId] = dedupeAndSortDeps(deps);
  }

  const globalDeps: ExternalDependency[] = [];
  for (const name of globalNames) {
    const version = rootVersions[name] ?? 'unknown';
    globalDeps.push({ name, version });
  }

  return {
    externalDepsGlobal: dedupeAndSortDeps(globalDeps),
    externalDepsByGroup,
  };
}

