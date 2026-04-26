import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { ExtractionModel } from './model';
import { basename } from 'node:path';

function formatFileLabel(
  relPath: string,
  nxProjectName?: string,
  nxProjectRelPath?: string
): string {
  if (nxProjectName && nxProjectRelPath) {
    return `${nxProjectName}:${nxProjectRelPath}`;
  }
  if (nxProjectName) return nxProjectName;
  return relPath;
}

export async function writeSnapshot(outputPath: string, model: ExtractionModel): Promise<void> {
  const toolVersion = '1.0.0';
  const workspacePkgPath = resolve(model.workspaceRoot, 'package.json');
  let workspacePkgVersion = 'unknown';
  try {
    const raw = readFileSync(workspacePkgPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    workspacePkgVersion = parsed.version ?? 'unknown';
  } catch {
    // Ignore
  }

  const uniqueBlocksCount = model.blockStore.blocksByHash.size;

  const groupsById = new Map(model.groups.map((g) => [g.groupId, g]));
  const groupOrder = model.groups.map((g) => g.groupId);

  const mermaidLines: string[] = [];
  mermaidLines.push('graph LR');
  for (const gId of groupOrder) {
    const g = groupsById.get(gId);
    if (!g) continue;
    const label = g.label.replace(/"/g, '');
    mermaidLines.push(`  ${gId}["${label}"]`);
  }

  const seenEdges = new Set<string>();
  for (const [from, toList] of Object.entries(model.projectEdges)) {
    for (const to of toList) {
      const key = `${from}__${to}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      // Mermaid edge: A --> B
      mermaidLines.push(`  ${from} --> ${to}`);
    }
  }

  const externalGlobalLines = model.externalDepsGlobal.map((d) => `${d.name}@${d.version}`);
  const externalPerGroupLines = model.groups.flatMap((g) => {
    const deps = model.externalDepsByGroup[g.groupId] ?? [];
    const lines: string[] = [];
    lines.push(`[${g.groupId}] count=${deps.length}`);
    for (const d of deps) lines.push(`  - ${d.name}@${d.version}`);
    return lines;
  });

  const printedBlocks = new Set<string>();

  const sortedFiles = [...model.fileNodes].sort((a, b) => a.relPath.localeCompare(b.relPath));
  const filesByGroup: Record<string, typeof sortedFiles> = {};
  for (const node of sortedFiles) {
    if (!filesByGroup[node.groupId]) filesByGroup[node.groupId] = [];
    filesByGroup[node.groupId].push(node);
  }

  const buffer: string[] = [];
  buffer.push('# EMC Notary - code-extractor snapshot');
  buffer.push(`toolVersion=${toolVersion}`);
  buffer.push(`workspaceVersion=${workspacePkgVersion}`);
  buffer.push(`generatedAtISO=${model.generatedAtISO}`);
  buffer.push(`configVersion=${model.config.version}`);
  buffer.push(`workspaceRoot=${model.workspaceRoot}`);
  buffer.push(`includedRoots=${model.config.includedRoots.join(',')}`);
  buffer.push(`fileNodes=${model.fileNodes.length}`);
  buffer.push(`uniqueBlocks=${uniqueBlocksCount}`);
  buffer.push('');
  buffer.push('---');
  buffer.push('## SYSTEM_HIERARCHY');
  buffer.push('Architecture Overview (high level):');
  buffer.push('- Build a file-level internal import graph for first-party code/config found under configured roots.');
  buffer.push('- Auto-include internal workspace files discovered via those imports.');
  buffer.push('- Emit per-group adjacency lists and a de-duplicated snapshot of transformed (minified + redacted) code.');
  buffer.push('');
  buffer.push('mermaid:');
  buffer.push('```mermaid');
  buffer.push(...mermaidLines);
  buffer.push('```');
  buffer.push('---');
  buffer.push('## EXTERNAL_DEPENDENCIES_GLOBAL');
  if (externalGlobalLines.length) {
    for (const line of externalGlobalLines) buffer.push(line);
  } else {
    buffer.push('(none)');
  }
  buffer.push('---');
  buffer.push('## EXTERNAL_DEPENDENCIES_PER_GROUP');
  if (externalPerGroupLines.length) buffer.push(...externalPerGroupLines);
  buffer.push('---');

  buffer.push('## INTERNAL_ADJACENCY_PER_GROUP');
  for (const g of model.groups) {
    buffer.push(`GROUP=${g.groupId} rootRel=${g.rootRel}`);
    const nodes = filesByGroup[g.groupId] ?? [];
    const nodesSorted = [...nodes].sort((a, b) => a.relPath.localeCompare(b.relPath));
    for (const n of nodesSorted) {
      const imports = Array.from(new Set(n.internalImportsRel)).sort((a, b) => a.localeCompare(b));
      buffer.push(`FILE=${formatFileLabel(n.relPath, n.nxProjectName, n.nxProjectRelPath)}`);
      buffer.push(`IMPORTS_INTERNAL=[${imports.join(',')}]`);
    }
  }
  buffer.push('---');

  buffer.push('## CODE_SNAPSHOT (minified + redacted, de-duplicated blocks)');

  for (const g of model.groups) {
    buffer.push(`GROUP=${g.groupId} rootRel=${g.rootRel}`);

    const nodes = filesByGroup[g.groupId] ?? [];
    const nodesSorted = [...nodes].sort((a, b) => a.relPath.localeCompare(b.relPath));

    // Group by directory (first path segment).
    const byDir: Record<string, typeof nodesSorted> = {};
    for (const n of nodesSorted) {
      const dir = dirname(n.relPath);
      byDir[dir] = byDir[dir] ?? [];
      byDir[dir].push(n);
    }

    const dirNames = Object.keys(byDir).sort((a, b) => a.localeCompare(b));
    for (const dir of dirNames) {
      buffer.push(`DIR=${dir === '.' ? '(root)' : dir}`);
      const files = byDir[dir] ?? [];
      for (const n of [...files].sort((a, b) => basename(a.relPath).localeCompare(basename(b.relPath)))) {
        buffer.push(`FILE=${formatFileLabel(n.relPath, n.nxProjectName, n.nxProjectRelPath)}`);
        buffer.push(`contentHash=${n.contentHash}`);

        const firstRef = !printedBlocks.has(n.contentHash);
        if (firstRef) {
          printedBlocks.add(n.contentHash);
          const block = model.blockStore.blocksByHash.get(n.contentHash);
          if (block) {
            buffer.push('<<<BEGIN_BLOCK');
            buffer.push(`hash=${block.hash}`);
            buffer.push('>>>');
            buffer.push(block.content);
            buffer.push('<<<END_BLOCK');
          } else {
            buffer.push('<<<BEGIN_BLOCK');
            buffer.push(`hash=${n.contentHash}`);
            buffer.push('(missing block content)');
            buffer.push('<<<END_BLOCK');
          }
        }
      }
    }
  }

  const finalText = `${buffer.join('\n')}\n`;
  await writeFile(outputPath, finalText, 'utf8');
}

