import type { BlockStore } from './dedupe';
import type { ExtractorConfig } from './types';

export type ProjectGroup = {
  groupId: string;
  label: string;
  rootRel: string;
};

export type FileNode = {
  absPath: string;
  relPath: string;
  /**
   * Nearest Nx project name from ancestor `project.json`, when available.
   */
  nxProjectName?: string;
  /**
   * File path relative to the detected Nx project root.
   */
  nxProjectRelPath?: string;
  groupId: string;
  contentHash: string;
  internalImportsRel: string[]; // relative paths (only included/internal imports)
  externalImports: string[]; // bare module specifiers as written
};

export type ExternalDependency = {
  name: string;
  version: string;
};

export type ExtractionModel = {
  config: ExtractorConfig;
  generatedAtISO: string;
  workspaceRoot: string;

  groups: ProjectGroup[];
  fileNodes: FileNode[];

  /**
   * Project-level import edges (groupId -> groupId).
   */
  projectEdges: Record<string, string[]>;

  /**
   * Unique transformed blocks keyed by sha256.
   * Snapshot writer renders these once, referenced by each file node.
   */
  blockStore: BlockStore;

  externalDepsGlobal: ExternalDependency[];
  externalDepsByGroup: Record<string, ExternalDependency[]>;
};

