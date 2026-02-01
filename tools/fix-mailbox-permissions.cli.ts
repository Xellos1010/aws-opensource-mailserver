#!/usr/bin/env npx tsx
/**
 * Fix Mailbox Directory Permissions CLI
 *
 * Fixes ownership and permissions on /home/user-data/mail/mailboxes
 * to ensure dovecot can write to mailbox directories.
 *
 * Root cause: If mailbox directories are owned by root:root instead of mail:mail,
 * dovecot (which runs as mail:mail) cannot create user mailbox directories,
 * causing "Permission denied" errors on mail delivery.
 *
 * Fix: chown -R mail:mail /home/user-data/mail/mailboxes
 *      chmod -R 2770 (setgid bit ensures new files inherit group ownership)
 *
 * Usage:
 *   pnpm nx run cdk-k3frame-instance:admin:fix:mailbox-permissions
 *   DRY_RUN=1 pnpm nx run cdk-k3frame-instance:admin:fix:mailbox-permissions
 */

import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { getStackInfo } from '../libs/tools/admin-stack-info/src/lib/admin-stack-info';

const DOMAIN = process.env['DOMAIN'] || 'k3frame.com';
const AWS_REGION = process.env['AWS_REGION'] || 'us-east-1';
const APP_PATH = process.env['APP_PATH'] || 'apps/cdk-k3frame/instance';
const DRY_RUN = process.env['DRY_RUN'] === '1' || process.argv.includes('--dry-run');

interface FixResult {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  output?: string;
}

async function executeSSMCommand(
  ssmClient: SSMClient,
  instanceId: string,
  command: string
): Promise<{ success: boolean; output: string }> {
  try {
    const sendCommand = new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [command],
      },
      TimeoutSeconds: 60,
    });

    const response = await ssmClient.send(sendCommand);
    const commandId = response.Command?.CommandId;

    if (!commandId) {
      return { success: false, output: 'No command ID returned' };
    }

    // Wait for command to complete
    let attempts = 0;
    const maxAttempts = 30;
    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        const invocation = await ssmClient.send(
          new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId,
          })
        );

        if (invocation.Status === 'Success') {
          return {
            success: true,
            output: invocation.StandardOutputContent || '',
          };
        } else if (invocation.Status === 'Failed' || invocation.Status === 'Cancelled' || invocation.Status === 'TimedOut') {
          return {
            success: false,
            output: invocation.StandardErrorContent || invocation.StandardOutputContent || `Command ${invocation.Status}`,
          };
        }
      } catch (e) {
        // Command not ready yet
      }

      attempts++;
    }

    return { success: false, output: 'Command timed out waiting for response' };
  } catch (error) {
    return { success: false, output: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📁 Fix Mailbox Directory Permissions - ${DOMAIN}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  const results: FixResult[] = [];

  // Get stack info
  console.log('📋 Getting stack info...');
  const stackInfo = await getStackInfo({ appPath: APP_PATH, domain: DOMAIN });

  if (!stackInfo.instanceId) {
    console.error('❌ Could not find instance ID from stack outputs');
    process.exit(1);
  }

  console.log(`   Instance ID: ${stackInfo.instanceId}`);
  console.log(`   Instance IP: ${stackInfo.instanceIp}\n`);

  const ssmClient = new SSMClient({ region: AWS_REGION });
  const instanceId = stackInfo.instanceId;

  // Step 1: Check current permissions
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 1: Check Current Permissions');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const checkCommand = `
    echo "=== Mailbox Directory Status ==="
    if [ -d /home/user-data/mail/mailboxes ]; then
      stat -c "Owner: %U:%G  Mode: %a  Path: %n" /home/user-data/mail/mailboxes
      echo ""
      echo "=== Per-domain directories ==="
      find /home/user-data/mail/mailboxes -maxdepth 1 -type d -exec stat -c "Owner: %U:%G  Mode: %a  Path: %n" {} \\; 2>/dev/null || echo "No domain directories found"
    else
      echo "Directory does not exist: /home/user-data/mail/mailboxes"
    fi
  `;

  const checkResult = await executeSSMCommand(ssmClient, instanceId, checkCommand);
  console.log(checkResult.output);

  if (!checkResult.success) {
    results.push({
      step: 'Check permissions',
      status: 'failed',
      message: 'Could not check current permissions',
      output: checkResult.output,
    });
    console.log('❌ Failed to check current permissions\n');
  } else {
    results.push({
      step: 'Check permissions',
      status: 'success',
      message: 'Retrieved current permissions',
      output: checkResult.output,
    });
  }

  // Determine if fix is needed
  const needsFix = checkResult.output.includes('root:root') ||
                   !checkResult.output.includes('mail:mail') ||
                   checkResult.output.includes('0755');

  if (!needsFix) {
    console.log('✅ Mailbox permissions already correct (mail:mail with proper mode)\n');
    results.push({
      step: 'Fix permissions',
      status: 'skipped',
      message: 'Permissions already correct',
    });
  } else {
    // Step 2: Fix permissions
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Step 2: Fix Mailbox Directory Permissions');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (DRY_RUN) {
      console.log('   Would run:');
      console.log('   chown -R mail:mail /home/user-data/mail/mailboxes');
      console.log('   find /home/user-data/mail/mailboxes -type d -exec chmod 2770 {} \\;');
      console.log('   find /home/user-data/mail/mailboxes -type f -exec chmod 660 {} \\;\n');
      results.push({
        step: 'Fix permissions',
        status: 'skipped',
        message: 'Dry run - no changes made',
      });
    } else {
      const fixCommand = `
        echo "Fixing mailbox permissions..."
        chown -R mail:mail /home/user-data/mail/mailboxes 2>&1 && \\
        find /home/user-data/mail/mailboxes -type d -exec chmod 2770 {} \\; 2>&1 && \\
        find /home/user-data/mail/mailboxes -type f -exec chmod 660 {} \\; 2>&1 && \\
        echo "PERMISSIONS_FIXED"
      `;

      const fixResult = await executeSSMCommand(ssmClient, instanceId, fixCommand);

      if (fixResult.success && fixResult.output.includes('PERMISSIONS_FIXED')) {
        console.log('✅ Mailbox permissions fixed successfully\n');
        results.push({
          step: 'Fix permissions',
          status: 'success',
          message: 'Permissions fixed: mail:mail ownership with 2770 mode on directories',
          output: fixResult.output,
        });
      } else {
        console.log('❌ Failed to fix permissions\n');
        console.log(fixResult.output);
        results.push({
          step: 'Fix permissions',
          status: 'failed',
          message: 'Could not fix permissions',
          output: fixResult.output,
        });
      }
    }
  }

  // Step 3: Verify permissions after fix
  if (!DRY_RUN && needsFix) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Step 3: Verify Fixed Permissions');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const verifyResult = await executeSSMCommand(ssmClient, instanceId, checkCommand);
    console.log(verifyResult.output);

    const isFixed = verifyResult.output.includes('mail:mail') && !verifyResult.output.includes('root:root');
    results.push({
      step: 'Verify permissions',
      status: isFixed ? 'success' : 'failed',
      message: isFixed ? 'Permissions verified correct' : 'Permissions still incorrect',
      output: verifyResult.output,
    });
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const successCount = results.filter((r) => r.status === 'success').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;

  console.log(`Total: ${results.length}  ✅ Success: ${successCount}  ❌ Failed: ${failedCount}  ⏭️  Skipped: ${skippedCount}\n`);

  for (const result of results) {
    const icon = result.status === 'success' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
    console.log(`${icon} ${result.step}: ${result.message}`);
  }

  console.log('');

  // Exit with error if any failures
  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
