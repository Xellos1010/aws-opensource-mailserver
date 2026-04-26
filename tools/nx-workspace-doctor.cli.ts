#!/usr/bin/env ts-node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

interface DoctorOptions {
  fix: boolean;
  json: boolean;
  resetCache: boolean;
  pinVersion?: string;
}

interface CheckResult {
  id: string;
  ok: boolean;
  message: string;
  details?: string[];
}

interface ExtensionInfo {
  editor: 'cursor' | 'vscode';
  path: string;
  version: string;
  commandDeclared: boolean;
  engine?: string;
}

interface JsonSummary {
  workspaceRoot: string;
  checks: CheckResult[];
  extensions: ExtensionInfo[];
}

const NX_CONSOLE_EXTENSION_ID = 'nrwl.angular-console';
const NX_REFRESH_COMMAND = 'nxConsole.refreshWorkspace';
const CURSOR_SETTINGS_RELATIVE = '.cursor/settings.json';

function runCommand(command: string, args: string[], cwd?: string): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
  };
}

function parseArgs(argv: string[]): DoctorOptions {
  const pinArg = argv.find((arg) => arg.startsWith('--pin-version='));
  const pinVersion = pinArg ? pinArg.split('=')[1] : undefined;
  return {
    fix: argv.includes('--fix'),
    json: argv.includes('--json'),
    resetCache: argv.includes('--reset-cache'),
    pinVersion,
  };
}

function findExtensionFolders(baseDir: string): string[] {
  const ls = runCommand('ls', ['-1', baseDir]);
  if (!ls.ok) {
    return [];
  }

  return ls.stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(`${NX_CONSOLE_EXTENSION_ID}-`))
    .map((entry) => join(baseDir, entry));
}

function readJsonFile<T>(filePath: string): T | undefined {
  try {
    if (!existsSync(filePath)) {
      return undefined;
    }
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function detectNxExtensions(): ExtensionInfo[] {
  const candidates: Array<{ editor: 'cursor' | 'vscode'; dir: string }> = [
    { editor: 'cursor', dir: join(homedir(), '.cursor', 'extensions') },
    { editor: 'vscode', dir: join(homedir(), '.vscode', 'extensions') },
  ];

  const discovered: ExtensionInfo[] = [];

  for (const candidate of candidates) {
    if (!existsSync(candidate.dir)) {
      continue;
    }

    for (const folder of findExtensionFolders(candidate.dir)) {
      const pkgPath = join(folder, 'package.json');
      const pkg = readJsonFile<{
        version?: string;
        engines?: { vscode?: string };
        contributes?: { commands?: Array<{ command?: string }> };
      }>(pkgPath);

      const commands = pkg?.contributes?.commands ?? [];
      const commandDeclared = commands.some((command) => command.command === NX_REFRESH_COMMAND);

      discovered.push({
        editor: candidate.editor,
        path: folder,
        version: pkg?.version ?? 'unknown',
        commandDeclared,
        engine: pkg?.engines?.vscode,
      });
    }
  }

  return discovered;
}

function findLatestCursorExthostLogPath(): string | undefined {
  const logsRoot = join(homedir(), 'Library', 'Application Support', 'Cursor', 'logs');
  if (!existsSync(logsRoot)) {
    return undefined;
  }

  const sessions = runCommand('ls', ['-1', logsRoot]);
  if (!sessions.ok || !sessions.stdout) {
    return undefined;
  }

  const ordered = sessions.stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .sort()
    .reverse();

  for (const session of ordered) {
    const sessionDir = join(logsRoot, session);
    const windows = runCommand('ls', ['-1', sessionDir]);
    if (!windows.ok || !windows.stdout) {
      continue;
    }

    for (const windowDirName of windows.stdout.split('\n').map((entry) => entry.trim())) {
      if (!windowDirName.startsWith('window')) {
        continue;
      }
      const exthostLogPath = join(sessionDir, windowDirName, 'exthost', 'exthost.log');
      if (existsSync(exthostLogPath)) {
        return exthostLogPath;
      }
    }
  }

  return undefined;
}

function inspectNxConsoleActivationFailure(): CheckResult {
  const logPath = findLatestCursorExthostLogPath();
  if (!logPath) {
    return {
      id: 'editor.nx-console-activation',
      ok: true,
      message: 'Could not locate Cursor exthost log; skipping activation check',
    };
  }

  const content = readFileSync(logPath, 'utf8');
  const packageJsonCrash = content.includes("Cannot find module '../../../package.json'");
  const activationFailure =
    content.includes('Extension activation failure: nrwl.angular-console') ||
    content.includes('Activating extension nrwl.angular-console failed due to an error');

  if (!activationFailure) {
    return {
      id: 'editor.nx-console-activation',
      ok: true,
      message: 'No Nx Console activation failures found in exthost logs',
      details: [logPath],
    };
  }

  return {
    id: 'editor.nx-console-activation',
    ok: false,
    message: packageJsonCrash
      ? "Historical Nx Console crash found in logs: Cannot find module '../../../package.json'"
      : 'Historical Nx Console activation failure found in exthost logs',
    details: [logPath],
  };
}

function checkWorkspace(cwd: string): CheckResult[] {
  const checks: CheckResult[] = [];
  const packageJsonPath = join(cwd, 'package.json');
  const nxJsonPath = join(cwd, 'nx.json');

  checks.push({
    id: 'workspace.nx-json',
    ok: existsSync(nxJsonPath),
    message: existsSync(nxJsonPath) ? 'nx.json found' : 'nx.json is missing',
  });

  const pkg = readJsonFile<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(packageJsonPath);

  const nxVersion = pkg?.devDependencies?.nx ?? pkg?.dependencies?.nx;
  checks.push({
    id: 'workspace.nx-dependency',
    ok: Boolean(nxVersion),
    message: nxVersion ? `nx dependency found (${nxVersion})` : 'nx dependency is missing from package.json',
  });

  const nxVersionResult = runCommand('pnpm', ['nx', '--version'], cwd);
  checks.push({
    id: 'workspace.nx-cli',
    ok: nxVersionResult.ok,
    message: nxVersionResult.ok ? `pnpm nx --version succeeded (${nxVersionResult.stdout})` : 'pnpm nx --version failed',
    details: nxVersionResult.ok ? undefined : [nxVersionResult.stderr || 'No stderr output'],
  });

  const showProjectsResult = runCommand('pnpm', ['nx', 'show', 'projects', '--json'], cwd);
  checks.push({
    id: 'workspace.nx-show-projects',
    ok: showProjectsResult.ok,
    message: showProjectsResult.ok
      ? 'pnpm nx show projects --json succeeded'
      : 'pnpm nx show projects --json failed',
    details: showProjectsResult.ok ? undefined : [showProjectsResult.stderr || 'No stderr output'],
  });

  return checks;
}

function checkCursorBinary(): CheckResult {
  const version = runCommand('cursor', ['--version']);
  return {
    id: 'editor.cursor-binary',
    ok: version.ok,
    message: version.ok ? `cursor --version succeeded (${version.stdout.split('\n')[0]})` : 'cursor CLI not available in PATH',
    details: version.ok ? undefined : [version.stderr || 'No stderr output'],
  };
}

function ensureCursorSettings(workspaceRoot: string): void {
  const settingsPath = join(workspaceRoot, CURSOR_SETTINGS_RELATIVE);
  const current = readJsonFile<Record<string, unknown>>(settingsPath) ?? {};
  const next: Record<string, unknown> = {
    ...current,
    'nxConsole.disableFileWatching': true,
    'nxConsole.enableDebugLogging': true,
    'nxConsole.refreshOnBranchSwitch': true,
  };

  const parentDir = join(workspaceRoot, '.cursor');
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

function reinstallCursorNxConsole(): { ok: boolean; details: string[] } {
  const uninstall = runCommand('cursor', ['--uninstall-extension', NX_CONSOLE_EXTENSION_ID]);
  const install = runCommand('cursor', ['--install-extension', NX_CONSOLE_EXTENSION_ID]);
  const details = [
    uninstall.ok ? 'Uninstall command completed.' : `Uninstall failed: ${uninstall.stderr || uninstall.stdout}`,
    install.ok ? 'Install command completed.' : `Install failed: ${install.stderr || install.stdout}`,
  ];
  return { ok: uninstall.ok && install.ok, details };
}

function pinCursorNxConsoleVersion(version: string): { ok: boolean; details: string[] } {
  const uninstall = runCommand('cursor', ['--uninstall-extension', NX_CONSOLE_EXTENSION_ID]);
  const install = runCommand('cursor', ['--install-extension', `${NX_CONSOLE_EXTENSION_ID}@${version}`]);
  const removeBroken = runCommand('rm', ['-rf', join(homedir(), '.cursor', 'extensions', 'nrwl.angular-console-18.93.0-universal')]);
  const details = [
    uninstall.ok ? 'Uninstall command completed.' : `Uninstall failed: ${uninstall.stderr || uninstall.stdout}`,
    install.ok ? `Installed pinned version ${version}.` : `Pinned install failed: ${install.stderr || install.stdout}`,
    removeBroken.ok
      ? 'Removed known-bad 18.93.0 extension folder if present.'
      : `Could not remove known-bad folder: ${removeBroken.stderr || removeBroken.stdout}`,
  ];
  return { ok: uninstall.ok && install.ok && removeBroken.ok, details };
}

function clearCursorGlobalStorage(): void {
  const dir = join(homedir(), '.cursor', 'User', 'globalStorage', NX_CONSOLE_EXTENSION_ID);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runFixes(workspaceRoot: string, options: DoctorOptions): CheckResult[] {
  const fixResults: CheckResult[] = [];

  ensureCursorSettings(workspaceRoot);
  fixResults.push({
    id: 'fix.cursor-settings',
    ok: true,
    message: `Updated ${CURSOR_SETTINGS_RELATIVE} with Nx Console stability settings`,
  });

  if (options.resetCache || options.fix) {
    const reset = runCommand('pnpm', ['nx', 'reset'], workspaceRoot);
    fixResults.push({
      id: 'fix.nx-reset',
      ok: reset.ok,
      message: reset.ok ? 'Executed pnpm nx reset' : 'Failed to execute pnpm nx reset',
      details: reset.ok ? undefined : [reset.stderr || 'No stderr output'],
    });
  }

  clearCursorGlobalStorage();
  fixResults.push({
    id: 'fix.cursor-global-storage',
    ok: true,
    message: 'Cleared Cursor global storage for Nx Console',
  });

  const pinVersion = options.pinVersion ?? '18.39.0';
  const pin = pinCursorNxConsoleVersion(pinVersion);
  if (pin.ok) {
    fixResults.push({
      id: 'fix.cursor-extension-pin',
      ok: true,
      message: `Pinned Nx Console extension to ${pinVersion}`,
      details: pin.details,
    });
  } else {
    const reinstall = reinstallCursorNxConsole();
    fixResults.push({
      id: 'fix.cursor-extension-reinstall',
      ok: reinstall.ok,
      message: reinstall.ok
        ? 'Reinstalled Nx Console extension in Cursor'
        : 'Could not reinstall Nx Console via Cursor CLI',
      details: [...pin.details, ...reinstall.details],
    });
  }

  return fixResults;
}

function printReport(summary: JsonSummary): void {
  console.log('Nx Workspace Doctor');
  console.log(`Workspace: ${summary.workspaceRoot}`);
  console.log('');

  for (const check of summary.checks) {
    const status = check.ok ? 'OK' : 'FAIL';
    console.log(`[${status}] ${check.id}: ${check.message}`);
    if (check.details?.length) {
      for (const line of check.details) {
        console.log(`  - ${line}`);
      }
    }
  }

  console.log('');
  if (summary.extensions.length === 0) {
    console.log('[FAIL] extension.detect: No Nx Console extension found in Cursor or VS Code.');
  } else {
    for (const extension of summary.extensions) {
      const status = extension.commandDeclared ? 'OK' : 'FAIL';
      console.log(
        `[${status}] extension.${extension.editor}: ${basename(extension.path)} (v${extension.version}) commandDeclared=${extension.commandDeclared} engine=${extension.engine ?? 'unknown'}`
      );
    }
  }

  const failing = summary.checks.filter((check) => {
    if (check.ok) {
      return false;
    }
    if (check.id === 'editor.nx-console-activation' && check.message.startsWith('Historical Nx Console')) {
      return false;
    }
    return true;
  }).length +
    summary.extensions.filter((ext) => !ext.commandDeclared).length;
  console.log('');
  console.log(failing === 0 ? 'Result: healthy' : `Result: ${failing} issue(s) detected`);
  console.log('If command issues persist, run: Developer: Reload Window');
}

function printHelp(): void {
  console.log(`Usage: pnpm exec tsx --tsconfig tools/tsconfig.json tools/nx-workspace-doctor.cli.ts [options]

Options:
  --fix          Apply repeatable remediation steps
  --reset-cache  Run "pnpm nx reset" as part of checks/fixes
  --pin-version  Pin Nx Console version (use --pin-version=X.Y.Z)
  --json         Output report as JSON
  --help, -h     Show this help
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const options = parseArgs(args);
  const workspaceRoot = resolve(process.cwd());
  const checks = [...checkWorkspace(workspaceRoot), checkCursorBinary(), inspectNxConsoleActivationFailure()];
  const extensions = detectNxExtensions();

  let allChecks = [...checks];
  if (options.fix) {
    allChecks = [...allChecks, ...runFixes(workspaceRoot, options)];
  }

  const summary: JsonSummary = {
    workspaceRoot,
    checks: allChecks,
    extensions,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printReport(summary);
  }

  const hasFailures =
    summary.checks.some((check) => !check.ok && !(options.fix && check.id === 'editor.nx-console-activation')) ||
    summary.extensions.some((extension) => !extension.commandDeclared);

  process.exit(hasFailures ? 1 : 0);
}

void main();
