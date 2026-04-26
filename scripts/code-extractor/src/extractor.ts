import { readFileSync, readdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, relative, dirname, normalize, resolve, isAbsolute } from 'node:path';
import type { ExtractorConfig } from './types';
import { createFileFilter } from './fileFilter';
import { createBlockStore, upsertBlock } from './dedupe';
import { transformForSnapshot } from './transform';
import { parseImportSpecifiers } from './parseImports';
import { createTsConfigPathResolver } from './tsconfigPaths';
import { resolveRelativeImport, resolveTsPathAlias } from './resolveImport';
import { writeSnapshot } from './snapshotWriter';
import type { ExtractionModel, FileNode } from './model';
import { computeExternalDependencies } from './externalDeps';

type GroupRoot = {
  groupId: string;
  label: string;
  rootRel: string;
  rootAbs: string;
};

function toGroupId(rootRel: string): string {
  return rootRel.replace(/[^a-zA-Z0-9_]/g, '_');
}

function findGroupForAbsPath(absPath: string, groups: GroupRoot[]): string {
  const normalized = normalize(absPath);
  for (const g of groups) {
    const root = normalize(g.rootAbs);
    if (normalized === root) return g.groupId;
    const prefix = root.endsWith('/') ? root : `${root}/`;
    if (normalized.startsWith(prefix)) return g.groupId;
  }
  return 'shared_libs';
}

function isTsOrJsFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  );
}

function shouldSkipDir(absDir: string, config: ExtractorConfig): boolean {
  const parts = absDir.split(/[/\\]/);
  for (const part of parts) {
    if (config.excludeDirs.includes(part)) return true;
  }
  return false;
}

type NxProjectLookup = {
  projectName: string;
  projectRootAbs: string;
};

function createNxProjectLookup(workspaceRootAbs: string): (fileAbsPath: string) => NxProjectLookup | null {
  const cache = new Map<string, NxProjectLookup | null>();

  return (fileAbsPath: string): NxProjectLookup | null => {
    let currentDir = normalize(dirname(fileAbsPath));
    while (true) {
      if (cache.has(currentDir)) return cache.get(currentDir) ?? null;

      const projectJsonPath = join(currentDir, 'project.json');
      if (existsSync(projectJsonPath)) {
        try {
          const raw = readFileSync(projectJsonPath, 'utf8');
          const parsed = JSON.parse(raw) as { name?: string };
          if (typeof parsed.name === 'string' && parsed.name.trim().length > 0) {
            const result = { projectName: parsed.name, projectRootAbs: currentDir };
            cache.set(currentDir, result);
            return result;
          }
        } catch {
          // Ignore malformed project.json and continue walking upwards.
        }
      }

      if (currentDir === workspaceRootAbs) {
        cache.set(currentDir, null);
        return null;
      }

      const parent = dirname(currentDir);
      if (parent === currentDir) return null;
      currentDir = parent;
    }
  };
}

function walkAndCollectFiles(
  rootAbs: string,
  workspaceRoot: string,
  config: ExtractorConfig
): string[] {
  const out: string[] = [];
  const filter = createFileFilter(config);

  function walk(dirAbs: string): void {
    if (shouldSkipDir(dirAbs, config)) return;
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryAbs = join(dirAbs, entry.name);
      const relPath = relative(workspaceRoot, entryAbs);
      if (entry.isDirectory()) {
        walk(entryAbs);
        continue;
      }

      if (entry.isFile()) {
        if (filter.isIncluded(entryAbs, relPath)) out.push(entryAbs);
      }
    }
  }

  if (existsSync(rootAbs)) {
    walk(rootAbs);
  }

  return out;
}

function resolveInternalImport(
  fromFileAbs: string,
  specifier: string,
  config: ExtractorConfig,
  tsResolver: ReturnType<typeof createTsConfigPathResolver>
): { resolvedAbs: string | null; external: boolean } {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const resolved = resolveRelativeImport(fromFileAbs, specifier, config);
    return { resolvedAbs: resolved, external: !resolved };
  }

  const resolvedAlias = resolveTsPathAlias(specifier, config, tsResolver);
  return { resolvedAbs: resolvedAlias, external: !resolvedAlias };
}

export async function buildExtractionModel(input: { config: ExtractorConfig }): Promise<ExtractionModel> {
  const runCwd = process.cwd();
  const config = input.config;
  const contentRoot = normalize(resolve(runCwd, config.extractionRoot ?? '.'));

  const groups: GroupRoot[] = config.includedRoots.map((rootRel) => {
    const rootAbs = isAbsolute(rootRel) ? normalize(rootRel) : join(contentRoot, rootRel);
    return {
      groupId: toGroupId(rootRel),
      label: rootRel,
      rootRel,
      rootAbs,
    };
  });

  const tsResolver = createTsConfigPathResolver(contentRoot);
  const resolveNxProjectForFile = createNxProjectLookup(contentRoot);

  const fileFilter = createFileFilter(config);

  const includedFilesAbs = new Set<string>();
  const queue: string[] = [];

  // Seed with configured roots only; imported internal files are auto-included later.
  for (const root of groups) {
    const files = walkAndCollectFiles(root.rootAbs, contentRoot, config);
    for (const fileAbs of files) {
      if (includedFilesAbs.has(fileAbs)) continue;
      includedFilesAbs.add(fileAbs);
      queue.push(fileAbs);
    }
  }

  // Seed with explicit standalone files (workspace-relative).
  for (const fileRel of config.includedFiles ?? []) {
    const fileAbs = join(contentRoot, fileRel);
    if (!existsSync(fileAbs)) continue;
    if (includedFilesAbs.has(fileAbs)) continue;
    includedFilesAbs.add(fileAbs);
    queue.push(fileAbs);
  }

  // shared_libs group for internal imports outside configured roots.
  const groupShared: ExtractionModel['groups'][number] = { groupId: 'shared_libs', label: 'shared_libs', rootRel: '<imports>' };

  const fileNodesByAbs = new Map<string, FileNode>();
  const blockStore = createBlockStore();

  while (queue.length > 0) {
    const fileAbs = queue.pop()!;
    const relPath = relative(contentRoot, fileAbs);

    let rawContent = '';
    try {
      rawContent = readFileSync(fileAbs, 'utf8');
    } catch {
      continue;
    }

    if (!fileFilter.isIncluded(fileAbs, relPath)) {
      // File was discovered via import but no longer matches current filter.
      continue;
    }

    const groupId = findGroupForAbsPath(fileAbs, groups);

    const transformed = transformForSnapshot(rawContent, fileAbs);
    const { hash } = upsertBlock(blockStore, transformed);

    const fileNode: FileNode = {
      absPath: fileAbs,
      relPath,
      groupId,
      contentHash: hash,
      internalImportsRel: [],
      externalImports: [],
    };

    const nxProject = resolveNxProjectForFile(fileAbs);
    if (nxProject) {
      fileNode.nxProjectName = nxProject.projectName;
      fileNode.nxProjectRelPath = relative(nxProject.projectRootAbs, fileAbs);
    }

    // Only TS/JS files produce import edges.
    if (isTsOrJsFile(fileAbs)) {
      const { specifiers } = parseImportSpecifiers(fileAbs, rawContent);

      for (const specifier of specifiers) {
        const { resolvedAbs } = resolveInternalImport(fileAbs, specifier, config, tsResolver);
        if (resolvedAbs) {
          const resolvedRel = relative(contentRoot, resolvedAbs);
          if (fileFilter.isIncluded(resolvedAbs, resolvedRel)) {
            fileNode.internalImportsRel.push(resolvedRel);
            if (!includedFilesAbs.has(resolvedAbs)) {
              includedFilesAbs.add(resolvedAbs);
              queue.push(resolvedAbs);
            }
          } else {
            // If it resolves but doesn't match included-file constraints, treat as external-like.
            fileNode.externalImports.push(specifier);
          }
        } else {
          fileNode.externalImports.push(specifier);
        }
      }
    }

    fileNodesByAbs.set(fileAbs, fileNode);
  }

  const fileNodes = Array.from(fileNodesByAbs.values()).sort((a, b) => a.relPath.localeCompare(b.relPath));

  const groupSet = new Set<string>(fileNodes.map((n) => n.groupId));
  const finalGroups: ExtractionModel['groups'] = [
    ...groups.map((g) => ({ groupId: g.groupId, label: g.label, rootRel: g.rootRel })),
  ];
  if (groupSet.has('shared_libs')) finalGroups.push(groupShared);

  // Project-level edges.
  const projectEdges: Record<string, Set<string>> = {};
  for (const g of finalGroups) projectEdges[g.groupId] = new Set<string>();

  for (const file of fileNodes) {
    const from = file.groupId;
    for (const depRel of file.internalImportsRel) {
      const depAbs = join(contentRoot, depRel);
      const to = findGroupForAbsPath(depAbs, groups);
      if (to !== from && projectEdges[from]) {
        projectEdges[from].add(to);
      }
    }
  }

  const edgesFinal: ExtractionModel['projectEdges'] = {};
  for (const [from, toSet] of Object.entries(projectEdges)) {
    edgesFinal[from] = Array.from(toSet).sort((a, b) => a.localeCompare(b));
  }

  const modelBase: ExtractionModel = {
    config,
    generatedAtISO: new Date().toISOString(),
    workspaceRoot: contentRoot,
    groups: finalGroups,
    fileNodes,
    projectEdges: edgesFinal,
    blockStore,
    externalDepsGlobal: [],
    externalDepsByGroup: {},
  };

  const external = computeExternalDependencies({ model: modelBase, workspaceRoot: contentRoot });
  return {
    ...modelBase,
    externalDepsGlobal: external.externalDepsGlobal,
    externalDepsByGroup: external.externalDepsByGroup,
  };
}

export async function runExtraction(input: { config: ExtractorConfig; outputPath: string }): Promise<void> {
  const model = await buildExtractionModel({ config: input.config });
  await writeSnapshot(input.outputPath, model);
}


