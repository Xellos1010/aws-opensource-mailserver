#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';

type CliOptions = {
  appPath?: string;
  domain?: string;
  region?: string;
  profile?: string;
  repair?: boolean;
  strict?: boolean;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

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
      case '--domain': {
        if (nextArg && !nextArg.startsWith('--')) {
          options.domain = nextArg;
          i++;
        }
        break;
      }
      case '--region': {
        if (nextArg && !nextArg.startsWith('--')) {
          options.region = nextArg;
          i++;
        }
        break;
      }
      case '--profile': {
        if (nextArg && !nextArg.startsWith('--')) {
          options.profile = nextArg;
          i++;
        }
        break;
      }
      case '--repair': {
        options.repair = true;
        break;
      }
      case '--strict': {
        options.strict = true;
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
Usage: check-mailbox-root-permissions.cli.ts [OPTIONS]

Checks (and optionally repairs) Mail-in-a-Box mailbox root ownership/permissions:
  /home/user-data/mail/mailboxes/<domain>

Options:
  --app-path PATH          App path used for stack resolution (default: apps/cdk-emc-notary/instance)
  --domain DOMAIN          Domain name (default: derived from app path; fallback emcnotary.com)
  --region REGION          AWS region (default: us-east-1)
  --profile PROFILE        AWS profile (default: hepe-admin-mfa)
  --repair                 Repair drift to mail:mail 755 if detected
  --strict                 Exit non-zero when drift is detected
  --help, -h               Show this help message

Environment Variables:
  APP_PATH                 Same as --app-path
  DOMAIN                   Same as --domain
  AWS_REGION               Same as --region
  AWS_PROFILE              Same as --profile
`);
}

function shellEscapeSingleQuoted(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

function parseProbeOutput(output: string): {
  root?: string;
  owner?: string;
  perm?: string;
  writable?: string;
} {
  const rootMatch = output.match(/ROOT=([^\s]+)/);
  const ownerMatch = output.match(/OWNER=([^\s]+)/);
  const permMatch = output.match(/PERM=([0-9]{3,4})/);
  const writableMatch = output.match(/WRITABLE=([^\s]+)/);

  return {
    root: rootMatch?.[1],
    owner: ownerMatch?.[1],
    perm: permMatch?.[1],
    writable: writableMatch?.[1],
  };
}

async function sshCommand(
  keyPath: string,
  host: string,
  command: string
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const sshArgs = [
      '-i',
      keyPath,
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'LogLevel=ERROR',
      `ubuntu@${host}`,
      command,
    ];

    let output = '';
    let error = '';

    const ssh = spawn('ssh', sshArgs);

    ssh.stdout.on('data', (data) => {
      output += data.toString();
    });

    ssh.stderr.on('data', (data) => {
      error += data.toString();
    });

    ssh.on('close', (code) => {
      resolve({
        success: code === 0,
        output: output.trim(),
        error: error.trim() || undefined,
      });
    });

    ssh.on('error', (err) => {
      resolve({
        success: false,
        output: '',
        error: err.message,
      });
    });
  });
}

function isHealthyOwnershipState(state: {
  owner?: string;
  perm?: string;
  writable?: string;
}): boolean {
  return state.owner === 'mail:mail' && state.perm === '755' && state.writable === 'yes';
}

async function main(): Promise<void> {
  const cli = parseArgs();
  const appPath = cli.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const region =
    cli.region || process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'us-east-1';
  const profile = cli.profile || process.env.AWS_PROFILE || process.env.PROFILE || 'hepe-admin-mfa';
  const domain = cli.domain || process.env.DOMAIN;
  const repair = cli.repair || false;
  const strict = cli.strict || false;

  console.log('🔐 Mailbox Root Permission Check');
  console.log(`   App Path: ${appPath}`);
  console.log(`   Domain: ${domain ?? '(derived)'}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}`);
  console.log(`   Repair Mode: ${repair ? 'ENABLED' : 'DISABLED'}`);

  const stackInfo = await getStackInfoFromApp(appPath, {
    domain,
    region,
    profile,
  });

  const instanceIp = stackInfo.instancePublicIp;
  const resolvedDomain = stackInfo.domain;
  if (!instanceIp) {
    throw new Error('Instance public IP not found in stack outputs');
  }

  const keyPath = await getSshKeyPath({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
    ensureSetup: true,
  });

  const mailboxRoot = `/home/user-data/mail/mailboxes/${resolvedDomain}`;
  const escapedRoot = shellEscapeSingleQuoted(mailboxRoot);

  console.log(`   Instance: ${instanceIp}`);
  console.log(`   Mailbox Root: ${mailboxRoot}\n`);

  const probeCommand =
    `set -e; ROOT='${escapedRoot}'; ` +
    `if [ ! -d "$ROOT" ]; then echo "MISSING ROOT=$ROOT"; exit 3; fi; ` +
    `OWNER=$(stat -c '%U:%G' "$ROOT" 2>/dev/null || echo unknown); ` +
    `PERM=$(stat -c '%a' "$ROOT" 2>/dev/null || echo 000); ` +
    `WRITABLE=$(sudo -u mail test -w "$ROOT" && echo yes || echo no); ` +
    `echo "ROOT=$ROOT OWNER=$OWNER PERM=$PERM WRITABLE=$WRITABLE"`;

  const probe = await sshCommand(keyPath, instanceIp, probeCommand);
  if (!probe.success) {
    throw new Error(`Failed to probe mailbox root permissions: ${probe.error || 'unknown error'}`);
  }

  if (probe.output.startsWith('MISSING ')) {
    throw new Error(`Mailbox root directory missing: ${mailboxRoot}`);
  }

  const state = parseProbeOutput(probe.output);
  const healthy = isHealthyOwnershipState(state);

  if (healthy) {
    console.log('✅ Mailbox root permissions are healthy');
    console.log(`   Owner: ${state.owner}`);
    console.log(`   Mode: ${state.perm}`);
    console.log(`   Writable by mail user: ${state.writable}`);
    return;
  }

  console.log('⚠️  Mailbox root permission drift detected');
  console.log(`   Current Owner: ${state.owner || 'unknown'}`);
  console.log(`   Current Mode: ${state.perm || 'unknown'}`);
  console.log(`   Writable by mail user: ${state.writable || 'unknown'}`);
  console.log('   Expected: owner=mail:mail mode=755 writable=yes');

  if (!repair) {
    if (strict) {
      process.exit(2);
    }
    return;
  }

  console.log('\n🔧 Repairing mailbox root ownership/permissions...');
  const repairCommand =
    `set -e; ROOT='${escapedRoot}'; ` +
    `if [ ! -d "$ROOT" ]; then echo "MISSING ROOT=$ROOT"; exit 3; fi; ` +
    `sudo chown mail:mail "$ROOT"; sudo chmod 755 "$ROOT"; ` +
    `OWNER=$(stat -c '%U:%G' "$ROOT" 2>/dev/null || echo unknown); ` +
    `PERM=$(stat -c '%a' "$ROOT" 2>/dev/null || echo 000); ` +
    `WRITABLE=$(sudo -u mail test -w "$ROOT" && echo yes || echo no); ` +
    `echo "ROOT=$ROOT OWNER=$OWNER PERM=$PERM WRITABLE=$WRITABLE"`;

  const repaired = await sshCommand(keyPath, instanceIp, repairCommand);
  if (!repaired.success) {
    throw new Error(`Failed to repair mailbox root permissions: ${repaired.error || 'unknown error'}`);
  }

  if (repaired.output.startsWith('MISSING ')) {
    throw new Error(`Mailbox root directory missing during repair: ${mailboxRoot}`);
  }

  const repairedState = parseProbeOutput(repaired.output);
  if (!isHealthyOwnershipState(repairedState)) {
    throw new Error(
      `Repair did not converge. Current owner=${repairedState.owner} mode=${repairedState.perm} writable=${repairedState.writable}`
    );
  }

  console.log('✅ Mailbox root permissions repaired successfully');
  console.log(`   Owner: ${repairedState.owner}`);
  console.log(`   Mode: ${repairedState.perm}`);
  console.log(`   Writable by mail user: ${repairedState.writable}`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('\n❌ Mailbox root permission check failed:');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

