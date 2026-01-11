#!/usr/bin/env ts-node

import * as fs from 'node:fs';
import * as path from 'node:path';

type Category = {
  id: string;
  name: string;
  match: (targetName: string) => boolean;
};

type TargetInfo = {
  name: string;
  description?: string;
  dependsOn?: unknown;
  executor?: string;
};

type ProjectInfo = {
  name: string;
  projectJsonPath: string;
  targets: TargetInfo[];
};

type CliOptions = {
  appPath: string;
  category?: string;
  json?: boolean;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    appPath: 'apps/cdk-emc-notary',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--app-path': {
        if (nextArg && !nextArg.startsWith('--')) {
          options.appPath = nextArg;
          i++;
        }
        break;
      }
      case '--category': {
        if (nextArg && !nextArg.startsWith('--')) {
          options.category = nextArg;
          i++;
        }
        break;
      }
      case '--json': {
        options.json = true;
        break;
      }
      case '--help':
      case '-h': {
        printHelp();
        process.exit(0);
      }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Usage: rollout-menu.cli.ts [OPTIONS]

Prints a categorized “rollout menu” of Nx targets for a given app directory.

Options:
  --app-path PATH        App path to scan (default: apps/cdk-emc-notary)
  --category ID          Filter to a single category (e.g., cdk-stack, bootstrap, ssh)
  --json                 Output machine-readable JSON
  --help, -h             Show this help message

Examples:
  pnpm exec tsx --tsconfig tools/tsconfig.json tools/rollout-menu.cli.ts
  pnpm exec tsx --tsconfig tools/tsconfig.json tools/rollout-menu.cli.ts --category cdk-stack
  pnpm exec tsx --tsconfig tools/tsconfig.json tools/rollout-menu.cli.ts --json
`);
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function findProjectJsonPaths(appPath: string): string[] {
  const projectJsons: string[] = [];

  const direct = path.join(appPath, 'project.json');
  if (fs.existsSync(direct)) projectJsons.push(direct);

  const entries = fs.readdirSync(appPath, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = path.join(appPath, e.name, 'project.json');
    if (fs.existsSync(candidate)) projectJsons.push(candidate);
  }

  return projectJsons;
}

function loadProjects(appPath: string): ProjectInfo[] {
  const projectJsonPaths = findProjectJsonPaths(appPath);

  const projects: ProjectInfo[] = [];
  for (const pjPath of projectJsonPaths) {
    const pj = readJsonFile<{
      name?: string;
      targets?: Record<string, { description?: string; dependsOn?: unknown; executor?: string }>;
    }>(pjPath);

    const projectName = pj.name;
    if (!projectName) continue;

    const targets = Object.entries(pj.targets ?? {}).map(([name, cfg]): TargetInfo => {
      return {
        name,
        description: cfg.description,
        dependsOn: cfg.dependsOn,
        executor: cfg.executor,
      };
    });

    targets.sort((a, b) => a.name.localeCompare(b.name));

    projects.push({
      name: projectName,
      projectJsonPath: pjPath,
      targets,
    });
  }

  projects.sort((a, b) => a.name.localeCompare(b.name));
  return projects;
}

function getCategories(): Category[] {
  const startsWith = (prefix: string) => (t: string) => t.startsWith(prefix);
  const equals = (exact: string) => (t: string) => t === exact;
  const anyOf = (...preds: Array<(t: string) => boolean>) => (t: string) =>
    preds.some((p) => p(t));

  return [
    {
      id: 'cdk-stack',
      name: 'CDK Stack Operations',
      match: anyOf(equals('synth'), equals('deploy'), equals('diff'), equals('destroy'), startsWith('emergency-monitoring-legacy:')),
    },
    {
      id: 'build-test',
      name: 'Build & Test',
      match: anyOf(equals('build'), equals('lint'), startsWith('test')),
    },
    {
      id: 'stack-info',
      name: 'Stack Information',
      match: anyOf(equals('admin:info'), startsWith('admin:events')),
    },
    {
      id: 'ssh',
      name: 'SSH Operations',
      match: startsWith('admin:ssh:'),
    },
    {
      id: 'bootstrap',
      name: 'Bootstrap Operations',
      match: anyOf(
        equals('admin:bootstrap-miab-ec2-instance'),
        startsWith('admin:bootstrap:'),
        equals('admin:test:instance-deployed'),
        equals('admin:test:bootstrap-complete'),
        equals('admin:test:core-deployed'),
        equals('admin:fix-ssm-agent')
      ),
    },
    {
      id: 'provisioning',
      name: 'Provisioning',
      match: anyOf(startsWith('admin:provision:'), startsWith('admin:ses-dns')),
    },
    {
      id: 'ssl',
      name: 'SSL Management',
      match: startsWith('admin:ssl:'),
    },
    {
      id: 'credentials',
      name: 'Credentials',
      match: startsWith('admin:credentials'),
    },
    {
      id: 'users-mailboxes',
      name: 'Users & Mailboxes',
      match: anyOf(
        startsWith('admin:users:'),
        startsWith('admin:mailboxes:'),
        startsWith('admin:restore:')
      ),
    },
    {
      id: 'dns',
      name: 'DNS Management',
      match: anyOf(startsWith('admin:dns:'), equals('admin:reverse-dns')),
    },
    {
      id: 'miab',
      name: 'MIAB Maintenance',
      match: anyOf(
        startsWith('admin:miab:'),
        startsWith('admin:cleanup:'),
        equals('admin:s3-empty'),
        equals('admin:s3-empty:dry-run')
      ),
    },
  ];
}

function buildMenu(projects: ProjectInfo[], categories: Category[]): Record<string, unknown> {
  const categoryMap: Record<
    string,
    {
      id: string;
      name: string;
      projects: Array<{ name: string; projectJsonPath: string; targets: TargetInfo[] }>;
    }
  > = {};

  for (const c of categories) {
    categoryMap[c.id] = { id: c.id, name: c.name, projects: [] };
  }

  for (const p of projects) {
    for (const c of categories) {
      const matched = p.targets.filter((t) => c.match(t.name));
      if (matched.length === 0) continue;
      categoryMap[c.id]?.projects.push({
        name: p.name,
        projectJsonPath: p.projectJsonPath,
        targets: matched,
      });
    }
  }

  return categoryMap;
}

function printTextMenu(
  appPath: string,
  categories: Category[],
  menu: Record<string, { id: string; name: string; projects: Array<{ name: string; targets: TargetInfo[] }> }>,
  categoryFilter?: string
): void {
  console.log(`📋 Rollout Menu (${appPath})\n`);

  for (const c of categories) {
    if (categoryFilter && c.id !== categoryFilter) continue;
    const section = menu[c.id];
    if (!section || section.projects.length === 0) continue;

    console.log(`${c.name} (${c.id})`);
    for (const p of section.projects) {
      console.log(`  - ${p.name}`);
      for (const t of p.targets) {
        console.log(`    - ${t.name}${t.description ? ` — ${t.description}` : ''}`);
      }
    }
    console.log('');
  }
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const categories = getCategories();
  const projects = loadProjects(opts.appPath);
  const menu = buildMenu(projects, categories);

  if (opts.json) {
    const payload = {
      appPath: opts.appPath,
      generatedAt: new Date().toISOString(),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        projects: (menu as any)[c.id]?.projects ?? [],
      })),
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  printTextMenu(opts.appPath, categories, menu as any, opts.category);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('\n❌ Rollout menu failed:');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}


