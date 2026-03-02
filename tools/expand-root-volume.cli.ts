#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVolumesCommand,
  DescribeVolumesModificationsCommand,
  ModifyVolumeCommand,
} from '@aws-sdk/client-ec2';
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
  type GetCommandInvocationCommandOutput,
} from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface ExpandRootVolumeOptions {
  domain?: string;
  appPath: string;
  region: string;
  profile: string;
  targetSizeGb: number;
  execute: boolean;
  waitForComplete: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseArgs(argv: string[]): ExpandRootVolumeOptions {
  let domain: string | undefined;
  let appPath = process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const region = process.env.AWS_REGION || 'us-east-1';
  const profile = process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const dryRunEnv = parseBooleanEnv(process.env.DRY_RUN);

  let targetSizeGb: number | undefined = process.env.TARGET_SIZE_GB
    ? parseInt(process.env.TARGET_SIZE_GB, 10)
    : undefined;
  let execute = false;
  let waitForComplete = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--domain' && argv[i + 1]) {
      domain = argv[++i];
    } else if (arg === '--app-path' && argv[i + 1]) {
      appPath = argv[++i];
    } else if (arg === '--target-size-gb' && argv[i + 1]) {
      targetSizeGb = parseInt(argv[++i], 10);
    } else if (arg === '--execute') {
      execute = true;
    } else if (arg === '--dry-run') {
      execute = false;
    } else if (arg === '--wait') {
      waitForComplete = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:\n  pnpm exec tsx --tsconfig tools/tsconfig.json tools/expand-root-volume.cli.ts --target-size-gb <size> [--execute] [--wait] [--domain <domain>] [--app-path <path>]\n\nBehavior:\n  - Defaults to dry-run mode.\n  - Requires --execute to mutate AWS resources.\n  - --wait waits for modification state=completed before filesystem resize (otherwise waits for optimizing/completed).\n`);
      process.exit(0);
    }
  }

  if (dryRunEnv) {
    execute = false;
  }

  if (!targetSizeGb || Number.isNaN(targetSizeGb) || targetSizeGb <= 0) {
    throw new Error('Missing or invalid --target-size-gb <positive integer>');
  }

  return {
    domain,
    appPath,
    region,
    profile,
    targetSizeGb,
    execute,
    waitForComplete,
  };
}

async function resolveRootVolume(
  ec2Client: EC2Client,
  instanceId: string
): Promise<{ rootDeviceName: string; rootVolumeId: string; currentSizeGb: number }> {
  const instanceResp = await ec2Client.send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] })
  );

  const instance = instanceResp.Reservations?.[0]?.Instances?.[0];
  if (!instance) {
    throw new Error(`Instance ${instanceId} not found`);
  }

  const rootDeviceName = instance.RootDeviceName;
  const mappings = instance.BlockDeviceMappings || [];

  let rootVolumeId = mappings.find((m) => m.DeviceName === rootDeviceName)?.Ebs?.VolumeId;
  if (!rootVolumeId) {
    rootVolumeId = mappings.find((m) => Boolean(m.Ebs?.VolumeId))?.Ebs?.VolumeId;
  }

  if (!rootVolumeId) {
    throw new Error('Unable to identify root EBS volume from instance block device mappings');
  }

  const volumeResp = await ec2Client.send(
    new DescribeVolumesCommand({ VolumeIds: [rootVolumeId] })
  );
  const volume = volumeResp.Volumes?.[0];
  if (!volume?.Size) {
    throw new Error(`Unable to describe root volume ${rootVolumeId}`);
  }

  return {
    rootDeviceName: rootDeviceName || 'unknown',
    rootVolumeId,
    currentSizeGb: volume.Size,
  };
}

async function waitForVolumeModificationState(
  ec2Client: EC2Client,
  volumeId: string,
  waitForComplete: boolean
): Promise<void> {
  const maxAttempts = 120;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const resp = await ec2Client.send(
      new DescribeVolumesModificationsCommand({ VolumeIds: [volumeId] })
    );
    const modification = resp.VolumesModifications?.[0];
    const state = modification?.ModificationState || 'unknown';
    const progress = modification?.Progress ?? 0;

    console.log(`Volume modification state: ${state} (${progress}%)`);

    if (state === 'failed') {
      throw new Error(`Volume modification failed: ${modification?.StatusMessage || 'unknown reason'}`);
    }

    if (waitForComplete && state === 'completed') {
      return;
    }

    if (!waitForComplete && (state === 'optimizing' || state === 'completed')) {
      return;
    }

    await sleep(10000);
  }

  throw new Error('Timed out waiting for EBS volume modification state transition');
}

function buildFilesystemExpandScript(): string {
  return [
    'set -eu',
    'echo "=== Root Filesystem Expansion ==="',
    'ROOT_SOURCE=$(findmnt -n -o SOURCE /)',
    'ROOT_FS_TYPE=$(findmnt -n -o FSTYPE /)',
    'echo "Root source: ${ROOT_SOURCE}"',
    'echo "Filesystem type: ${ROOT_FS_TYPE}"',
    '',
    'case "${ROOT_SOURCE}" in',
    '  /dev/nvme*n*p[0-9]*)',
    '    DISK_DEVICE="${ROOT_SOURCE%p*}"',
    '    PART_NUM="${ROOT_SOURCE##*p}"',
    '    ;;',
    '  /dev/xvd[a-z][0-9]*|/dev/sd[a-z][0-9]*)',
    '    DISK_DEVICE="${ROOT_SOURCE%%[0-9]*}"',
    '    PART_NUM="${ROOT_SOURCE##*[!0-9]}"',
    '    ;;',
    '  *)',
    '    PKNAME=$(lsblk -no PKNAME "${ROOT_SOURCE}" 2>/dev/null || true)',
    '    if [ -n "${PKNAME}" ]; then',
    '      DISK_DEVICE="/dev/${PKNAME}"',
    '      PART_NUM=$(echo "${ROOT_SOURCE}" | grep -o "[0-9]*$")',
    '    fi',
    '    ;;',
    'esac',
    '',
    'if [ -z "${DISK_DEVICE:-}" ] || [ -z "${PART_NUM:-}" ]; then',
    '  echo "Failed to resolve root disk/partition from ${ROOT_SOURCE}"',
    '  exit 1',
    'fi',
    '',
    'echo "Resolved disk: ${DISK_DEVICE}"',
    'echo "Resolved partition: ${PART_NUM}"',
    '',
    'if ! command -v growpart >/dev/null 2>&1; then',
    '  sudo apt-get update -y >/dev/null 2>&1 || true',
    '  sudo apt-get install -y cloud-guest-utils >/dev/null 2>&1 || true',
    'fi',
    '',
    'sudo growpart "${DISK_DEVICE}" "${PART_NUM}"',
    '',
    'if [ "${ROOT_FS_TYPE}" = "xfs" ]; then',
    '  sudo xfs_growfs /',
    'elif [ "${ROOT_FS_TYPE}" = "ext4" ] || [ "${ROOT_FS_TYPE}" = "ext3" ] || [ "${ROOT_FS_TYPE}" = "ext2" ]; then',
    '  sudo resize2fs "${ROOT_SOURCE}"',
    'else',
    '  echo "Unsupported root filesystem: ${ROOT_FS_TYPE}"',
    '  exit 1',
    'fi',
    '',
    'echo "=== Post Expansion State ==="',
    'lsblk -f',
    'df -h /',
  ].join('\n');
}

async function waitForSsmCommand(
  ssmClient: SSMClient,
  commandId: string,
  instanceId: string
): Promise<GetCommandInvocationCommandOutput> {
  const maxAttempts = 180;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(5000);
    const invocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      })
    );

    const status = invocation.Status || 'Unknown';
    if (['Success', 'Failed', 'TimedOut', 'Cancelled'].includes(status)) {
      return invocation;
    }
  }

  throw new Error('Timed out waiting for SSM filesystem expansion command to complete');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const credentials = fromIni({ profile: options.profile });

  const ec2Client = new EC2Client({ region: options.region, credentials });
  const ssmClient = new SSMClient({ region: options.region, credentials });

  console.log('EBS Root Expansion');
  console.log(`  App Path: ${options.appPath}`);
  console.log(`  Domain: ${options.domain || '(resolved from app path)'}`);
  console.log(`  Region: ${options.region}`);
  console.log(`  Profile: ${options.profile}`);
  console.log(`  Target Size: ${options.targetSizeGb} GB`);
  console.log(`  Mode: ${options.execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

  const stackInfo = await getStackInfoFromApp(options.appPath, {
    domain: options.domain,
    region: options.region,
    profile: options.profile,
  });

  if (!stackInfo.instanceId) {
    throw new Error('Could not resolve instance ID from stack outputs');
  }

  const instanceId = stackInfo.instanceId;
  const root = await resolveRootVolume(ec2Client, instanceId);

  console.log(`Resolved instance: ${instanceId}`);
  console.log(`Root device: ${root.rootDeviceName}`);
  console.log(`Root volume: ${root.rootVolumeId}`);
  console.log(`Current size: ${root.currentSizeGb} GB`);

  if (options.targetSizeGb < root.currentSizeGb) {
    throw new Error(
      `Target size (${options.targetSizeGb} GB) must be greater than current root volume size (${root.currentSizeGb} GB)`
    );
  }

  const skipVolumeModify = options.targetSizeGb === root.currentSizeGb;

  if (!options.execute) {
    console.log('\nDry-run only. Planned actions:');
    if (skipVolumeModify) {
      console.log(`  1. Skip EBS modify (already at ${root.currentSizeGb} GB)`);
      console.log('  2. Run growpart + filesystem resize over SSM');
      console.log('  3. Verify final root filesystem size\n');
    } else {
      console.log(`  1. Modify volume ${root.rootVolumeId} to ${options.targetSizeGb} GB`);
      console.log('  2. Wait for EBS modification readiness');
      console.log('  3. Run growpart + filesystem resize over SSM');
      console.log('  4. Verify final root filesystem size\n');
    }
    return;
  }

  if (skipVolumeModify) {
    console.log(`\nSkipping EBS modification because volume is already ${root.currentSizeGb} GB.`);
  } else {
    console.log('\nModifying EBS volume size...');
    await ec2Client.send(
      new ModifyVolumeCommand({
        VolumeId: root.rootVolumeId,
        Size: options.targetSizeGb,
      })
    );

    await waitForVolumeModificationState(ec2Client, root.rootVolumeId, options.waitForComplete);
  }

  console.log('Running filesystem expansion via SSM...');
  const expandScript = buildFilesystemExpandScript();
  const sendResp = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [expandScript],
      },
      TimeoutSeconds: 900,
    })
  );

  const commandId = sendResp.Command?.CommandId;
  if (!commandId) {
    throw new Error('SSM command did not return CommandId');
  }

  const invocation = await waitForSsmCommand(ssmClient, commandId, instanceId);
  const stdout = invocation.StandardOutputContent || '';
  const stderr = invocation.StandardErrorContent || '';

  if (stdout) {
    console.log('\nSSM stdout:\n' + stdout);
  }
  if (stderr) {
    console.log('\nSSM stderr:\n' + stderr);
  }

  if (invocation.Status !== 'Success') {
    throw new Error(`Filesystem expansion command failed with status ${invocation.Status || 'Unknown'}`);
  }

  const finalVolumeResp = await ec2Client.send(
    new DescribeVolumesCommand({ VolumeIds: [root.rootVolumeId] })
  );
  const finalVolumeSize = finalVolumeResp.Volumes?.[0]?.Size;

  console.log('\nExpansion complete.');
  console.log(`  Volume: ${root.rootVolumeId}`);
  console.log(`  Final EBS size: ${finalVolumeSize || 'unknown'} GB`);
  console.log('  Filesystem output shown above from SSM command.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Error:', message);
  process.exit(1);
});
