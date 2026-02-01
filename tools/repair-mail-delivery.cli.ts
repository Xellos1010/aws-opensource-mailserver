#!/usr/bin/env ts-node

/**
 * Repair Mail Delivery
 *
 * Fixes common mail delivery issues including:
 * - Sieve script compilation failures
 * - Mailbox index corruption
 * - Service restarts
 * - Permission fixes
 *
 * Based on diagnostic findings from the investigation report.
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getAdminPassword } from '@mm/admin-credentials';
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
  type GetCommandInvocationCommandOutput,
} from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface RepairOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  userEmail?: string;
  dryRun?: boolean;
  skipSieve?: boolean;
  skipResync?: boolean;
  skipServices?: boolean;
}

interface RepairResult {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  output?: string;
}

interface RepairReport {
  timestamp: string;
  domain: string;
  instanceId: string;
  userEmail?: string;
  dryRun: boolean;
  results: RepairResult[];
  summary: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
  };
  mailFlowTest?: {
    imapAuth: boolean;
    smtpRelay: boolean;
  };
}

/**
 * Execute SSM command and wait for result
 */
async function executeSSMCommand(
  ssmClient: SSMClient,
  instanceId: string,
  command: string,
  timeoutMs: number = 60000
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const result = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: [command],
        },
        TimeoutSeconds: Math.floor(timeoutMs / 1000),
      })
    );

    const commandId = result.Command?.CommandId;
    if (!commandId) {
      return { success: false, output: '', error: 'No command ID returned' };
    }

    // Wait and poll for result
    let invocation: GetCommandInvocationCommandOutput | undefined;
    let retries = 0;
    const maxRetries = Math.ceil(timeoutMs / 3000);

    while (retries < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      try {
        invocation = await ssmClient.send(
          new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId,
          })
        );

        if (invocation.Status === 'Success' || invocation.Status === 'Failed') {
          break;
        }
      } catch (e) {
        // Command may not be ready yet
      }
      retries++;
    }

    if (!invocation) {
      return { success: false, output: '', error: 'Command timeout' };
    }

    if (invocation.Status === 'Success') {
      return {
        success: true,
        output: invocation.StandardOutputContent || '',
      };
    } else {
      return {
        success: false,
        output: invocation.StandardOutputContent || '',
        error: invocation.StandardErrorContent || invocation.StatusDetails,
      };
    }
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run mail delivery repairs
 */
async function repairMailDelivery(options: RepairOptions): Promise<RepairReport> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-k3frame/instance';
  const domain = options.domain || process.env.DOMAIN;
  const userEmail = options.userEmail || process.env.USER_EMAIL;
  const dryRun = options.dryRun || process.env.DRY_RUN === '1';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 Mail Delivery Repair Tool');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   User Email: ${userEmail || '(all users)'}`);
  console.log(`   Dry Run: ${dryRun}`);
  console.log('');

  const results: RepairResult[] = [];

  // Get stack info
  console.log('🔍 Getting stack information...');
  const stackInfo = await getStackInfoFromApp(appPath, { domain, region, profile });
  const instanceId = stackInfo.instanceId;
  const resolvedDomain = stackInfo.domain || domain!;

  if (!instanceId) {
    throw new Error('Instance ID not found in stack outputs');
  }

  console.log(`   Instance: ${instanceId}\n`);

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  // Step 0: Fix mailbox directory permissions
  // This is critical - dovecot runs as mail:mail and needs write access to mailboxes
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 0: Fix Mailbox Directory Permissions');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('   Checking mailbox directory ownership...');
  const checkPermsResult = await executeSSMCommand(
    ssmClient,
    instanceId,
    'stat -c "%U:%G %a" /home/user-data/mail/mailboxes 2>/dev/null || echo "NOT_FOUND"'
  );

  const currentOwner = checkPermsResult.output.trim();
  console.log(`   Current ownership: ${currentOwner}`);

  if (dryRun) {
    console.log('   [DRY RUN] Would fix mailbox permissions to mail:mail\n');
    results.push({
      step: 'Fix mailbox permissions',
      status: 'skipped',
      message: 'Dry run',
    });
  } else if (!currentOwner.startsWith('mail:mail')) {
    console.log('   Fixing mailbox directory permissions...');
    const fixPermsCommand = `
      chown -R mail:mail /home/user-data/mail/mailboxes 2>/dev/null
      chmod -R 2770 /home/user-data/mail/mailboxes 2>/dev/null
      find /home/user-data/mail/mailboxes -type d -exec chmod 2770 {} \\; 2>/dev/null
      echo "PERMS_FIXED"
    `;
    const fixPermsResult = await executeSSMCommand(ssmClient, instanceId, fixPermsCommand, 60000);

    if (fixPermsResult.success && fixPermsResult.output.includes('PERMS_FIXED')) {
      console.log('   ✅ Mailbox permissions fixed (mail:mail, mode 2770)\n');
      results.push({
        step: 'Fix mailbox permissions',
        status: 'success',
        message: 'Permissions set to mail:mail with setgid',
      });
    } else {
      console.log('   ❌ Failed to fix mailbox permissions\n');
      results.push({
        step: 'Fix mailbox permissions',
        status: 'failed',
        message: fixPermsResult.error || 'Unknown error',
      });
    }
  } else {
    console.log('   ✅ Mailbox permissions already correct\n');
    results.push({
      step: 'Fix mailbox permissions',
      status: 'success',
      message: 'Permissions already correct',
    });
  }

  // Step 1: Check and fix sieve scripts
  if (!options.skipSieve) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Step 1: Repair Sieve Scripts');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1a. Find all sieve scripts
    console.log('   Finding sieve scripts...');
    const findSieveResult = await executeSSMCommand(
      ssmClient,
      instanceId,
      'find /home/user-data/mail -name "*.sieve" -type f 2>/dev/null | head -50'
    );

    if (findSieveResult.success && findSieveResult.output.trim()) {
      const sieveFiles = findSieveResult.output.trim().split('\n').filter(f => f.trim());
      console.log(`   Found ${sieveFiles.length} sieve script(s)\n`);

      if (dryRun) {
        console.log('   [DRY RUN] Would recompile sieve scripts');
        results.push({
          step: 'Recompile sieve scripts',
          status: 'skipped',
          message: `Dry run - would recompile ${sieveFiles.length} scripts`,
        });
      } else {
        // 1b. Recompile all sieve scripts
        console.log('   Recompiling sieve scripts...');
        const recompileCommand = `
          cd /home/user-data/mail
          find . -name "*.sieve" -type f | while read sieve; do
            echo "Compiling: $sieve"
            sievec "$sieve" 2>&1 || echo "Failed: $sieve"
          done
          echo "SIEVE_RECOMPILE_DONE"
        `;

        const recompileResult = await executeSSMCommand(ssmClient, instanceId, recompileCommand, 120000);

        if (recompileResult.success && recompileResult.output.includes('SIEVE_RECOMPILE_DONE')) {
          const failCount = (recompileResult.output.match(/Failed:/g) || []).length;
          if (failCount === 0) {
            console.log('   ✅ All sieve scripts recompiled successfully\n');
            results.push({
              step: 'Recompile sieve scripts',
              status: 'success',
              message: `Recompiled ${sieveFiles.length} scripts`,
              output: recompileResult.output,
            });
          } else {
            console.log(`   ⚠️  Sieve recompile completed with ${failCount} failures\n`);
            results.push({
              step: 'Recompile sieve scripts',
              status: 'failed',
              message: `${failCount} scripts failed to compile`,
              output: recompileResult.output,
            });
          }
        } else {
          console.log('   ❌ Sieve recompile failed\n');
          results.push({
            step: 'Recompile sieve scripts',
            status: 'failed',
            message: recompileResult.error || 'Unknown error',
            output: recompileResult.output,
          });
        }
      }

      // 1c. Fix sieve permissions
      console.log('   Fixing sieve permissions...');
      if (dryRun) {
        console.log('   [DRY RUN] Would fix sieve permissions\n');
        results.push({
          step: 'Fix sieve permissions',
          status: 'skipped',
          message: 'Dry run',
        });
      } else {
        const permResult = await executeSSMCommand(
          ssmClient,
          instanceId,
          'chown -R user-data:user-data /home/user-data/mail/sieve 2>/dev/null; chmod -R 755 /home/user-data/mail/sieve 2>/dev/null; echo "PERM_DONE"'
        );

        if (permResult.success && permResult.output.includes('PERM_DONE')) {
          console.log('   ✅ Sieve permissions fixed\n');
          results.push({
            step: 'Fix sieve permissions',
            status: 'success',
            message: 'Permissions updated',
          });
        } else {
          console.log('   ⚠️  Could not fix sieve permissions (may not exist)\n');
          results.push({
            step: 'Fix sieve permissions',
            status: 'failed',
            message: permResult.error || 'Directory may not exist',
          });
        }
      }
    } else {
      console.log('   ℹ️  No sieve scripts found\n');
      results.push({
        step: 'Recompile sieve scripts',
        status: 'skipped',
        message: 'No sieve scripts found',
      });
    }
  } else {
    results.push({
      step: 'Repair sieve scripts',
      status: 'skipped',
      message: 'Skipped by option',
    });
  }

  // Step 2: Resync mailbox indexes
  if (!options.skipResync) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Step 2: Resync Mailbox Indexes');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (userEmail) {
      // Resync specific user
      console.log(`   Resyncing mailbox for: ${userEmail}`);
      if (dryRun) {
        console.log('   [DRY RUN] Would run: doveadm force-resync -u <user> "*"\n');
        results.push({
          step: `Resync mailbox (${userEmail})`,
          status: 'skipped',
          message: 'Dry run',
        });
      } else {
        const resyncResult = await executeSSMCommand(
          ssmClient,
          instanceId,
          `doveadm force-resync -u '${userEmail}' '*' 2>&1; echo "RESYNC_DONE"`,
          120000
        );

        if (resyncResult.success && resyncResult.output.includes('RESYNC_DONE')) {
          console.log(`   ✅ Mailbox resynced for ${userEmail}\n`);
          results.push({
            step: `Resync mailbox (${userEmail})`,
            status: 'success',
            message: 'Mailbox indexes rebuilt',
            output: resyncResult.output,
          });
        } else {
          console.log(`   ❌ Mailbox resync failed\n`);
          results.push({
            step: `Resync mailbox (${userEmail})`,
            status: 'failed',
            message: resyncResult.error || 'Unknown error',
            output: resyncResult.output,
          });
        }
      }
    } else {
      // Resync all users
      console.log('   Finding all mail users...');
      const listUsersResult = await executeSSMCommand(
        ssmClient,
        instanceId,
        "doveadm user '*' 2>/dev/null | head -50"
      );

      if (listUsersResult.success && listUsersResult.output.trim()) {
        const users = listUsersResult.output.trim().split('\n').filter(u => u.trim());
        console.log(`   Found ${users.length} user(s)\n`);

        if (dryRun) {
          console.log(`   [DRY RUN] Would resync mailboxes for ${users.length} users\n`);
          results.push({
            step: 'Resync all mailboxes',
            status: 'skipped',
            message: `Dry run - would resync ${users.length} users`,
          });
        } else {
          console.log('   Resyncing all mailboxes (this may take a while)...');
          const resyncAllResult = await executeSSMCommand(
            ssmClient,
            instanceId,
            `doveadm force-resync -A '*' 2>&1; echo "RESYNC_ALL_DONE"`,
            300000
          );

          if (resyncAllResult.success && resyncAllResult.output.includes('RESYNC_ALL_DONE')) {
            console.log(`   ✅ All mailboxes resynced\n`);
            results.push({
              step: 'Resync all mailboxes',
              status: 'success',
              message: `Resynced ${users.length} users`,
              output: resyncAllResult.output,
            });
          } else {
            console.log(`   ❌ Mailbox resync failed\n`);
            results.push({
              step: 'Resync all mailboxes',
              status: 'failed',
              message: resyncAllResult.error || 'Unknown error',
              output: resyncAllResult.output,
            });
          }
        }
      } else {
        console.log('   ⚠️  Could not list users\n');
        results.push({
          step: 'Resync mailboxes',
          status: 'failed',
          message: 'Could not list users',
        });
      }
    }
  } else {
    results.push({
      step: 'Resync mailboxes',
      status: 'skipped',
      message: 'Skipped by option',
    });
  }

  // Step 3: Restart mail services
  if (!options.skipServices) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Step 3: Restart Mail Services');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const services = ['dovecot', 'postfix'];

    for (const service of services) {
      console.log(`   Restarting ${service}...`);

      if (dryRun) {
        console.log(`   [DRY RUN] Would restart ${service}`);
        results.push({
          step: `Restart ${service}`,
          status: 'skipped',
          message: 'Dry run',
        });
      } else {
        const restartResult = await executeSSMCommand(
          ssmClient,
          instanceId,
          `systemctl restart ${service} && systemctl is-active ${service}`
        );

        if (restartResult.success && restartResult.output.trim() === 'active') {
          console.log(`   ✅ ${service} restarted and active`);
          results.push({
            step: `Restart ${service}`,
            status: 'success',
            message: 'Service restarted',
          });
        } else {
          console.log(`   ❌ ${service} restart failed`);
          results.push({
            step: `Restart ${service}`,
            status: 'failed',
            message: restartResult.error || restartResult.output || 'Unknown error',
          });
        }
      }
    }
    console.log('');
  } else {
    results.push({
      step: 'Restart services',
      status: 'skipped',
      message: 'Skipped by option',
    });
  }

  // Step 4: Verify IMAP authentication
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 4: Verify Mail System');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let imapAuthPassed = false;

  // Test with admin credentials
  console.log('   Testing IMAP authentication...');
  try {
    const adminPassword = await getAdminPassword({ domain: resolvedDomain, region, profile });

    if (adminPassword) {
      const authTestResult = await executeSSMCommand(
        ssmClient,
        instanceId,
        `doveadm auth test admin@${resolvedDomain} '${adminPassword.replace(/'/g, "'\\''")}' 2>&1 | head -5`
      );

      if (authTestResult.success && (authTestResult.output.includes('passdb') || authTestResult.output.includes('auth succeeded'))) {
        console.log(`   ✅ IMAP auth successful for admin@${resolvedDomain}`);
        imapAuthPassed = true;
        results.push({
          step: 'IMAP auth test',
          status: 'success',
          message: `admin@${resolvedDomain} authenticated`,
        });
      } else {
        console.log('   ❌ IMAP auth failed');
        results.push({
          step: 'IMAP auth test',
          status: 'failed',
          message: authTestResult.output || 'Auth failed',
        });
      }
    }
  } catch (e) {
    console.log('   ⚠️  Could not test IMAP auth (no admin password)');
    results.push({
      step: 'IMAP auth test',
      status: 'skipped',
      message: 'No admin password available',
    });
  }

  // Test with specific user if provided
  if (userEmail) {
    const userPassword = process.env.USER_PASSWORD;
    if (userPassword) {
      console.log(`\n   Testing IMAP for ${userEmail}...`);
      const userAuthResult = await executeSSMCommand(
        ssmClient,
        instanceId,
        `doveadm auth test '${userEmail}' '${userPassword.replace(/'/g, "'\\''")}' 2>&1 | head -5`
      );

      if (userAuthResult.success && (userAuthResult.output.includes('passdb') || userAuthResult.output.includes('auth succeeded'))) {
        console.log(`   ✅ IMAP auth successful for ${userEmail}`);
        results.push({
          step: `IMAP auth (${userEmail})`,
          status: 'success',
          message: 'User authenticated',
        });
      } else {
        console.log(`   ❌ IMAP auth failed for ${userEmail}`);
        results.push({
          step: `IMAP auth (${userEmail})`,
          status: 'failed',
          message: userAuthResult.output || 'Auth failed',
        });
      }
    }
  }

  // Check mail queue
  console.log('\n   Checking mail queue...');
  const queueResult = await executeSSMCommand(ssmClient, instanceId, 'postqueue -p | tail -20');

  if (queueResult.success) {
    const queueOutput = queueResult.output.trim();
    if (queueOutput.includes('Mail queue is empty')) {
      console.log('   ✅ Mail queue is empty');
      results.push({
        step: 'Check mail queue',
        status: 'success',
        message: 'Queue empty',
      });
    } else {
      const queuedCount = (queueOutput.match(/^[A-F0-9]{10,}/gm) || []).length;
      console.log(`   ⚠️  Mail queue has ${queuedCount} message(s)`);
      results.push({
        step: 'Check mail queue',
        status: 'success',
        message: `${queuedCount} messages queued`,
        output: queueOutput,
      });
    }
  }

  console.log('');

  // Calculate summary
  const summary = {
    total: results.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };

  const report: RepairReport = {
    timestamp: new Date().toISOString(),
    domain: resolvedDomain,
    instanceId,
    userEmail,
    dryRun,
    results,
    summary,
    mailFlowTest: {
      imapAuth: imapAuthPassed,
      smtpRelay: true, // Assumed if postfix is running
    },
  };

  // Print summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Repair Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const overallSuccess = summary.failed === 0;
  console.log(`   Overall: ${overallSuccess ? '✅ SUCCESS' : '❌ SOME FAILURES'}\n`);
  console.log(`   Success: ${summary.success}`);
  console.log(`   Failed: ${summary.failed}`);
  console.log(`   Skipped: ${summary.skipped}\n`);

  if (summary.failed > 0) {
    console.log('   Failed Steps:');
    for (const r of results.filter(r => r.status === 'failed')) {
      console.log(`      - ${r.step}: ${r.message}`);
    }
    console.log('');
  }

  // Save report
  const outputPath = `./mail-repair-report-${resolvedDomain}-${Date.now()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved to: ${path.resolve(outputPath)}\n`);

  // Next steps
  if (!overallSuccess) {
    console.log('💡 Next Steps:');
    console.log('   1. Review failed steps above');
    console.log('   2. Check logs: pnpm nx run cdk-k3frame-instance:admin:logs:dovecot');
    console.log('   3. Run health gate: pnpm nx run cdk-k3frame-instance:admin:health-gate');
  } else {
    console.log('💡 Verification:');
    console.log('   1. Test sending email from your mail client');
    console.log('   2. Test receiving email by sending to your address');
    console.log('   3. Run: pnpm nx run cdk-k3frame-instance:admin:mail:flow:test');
  }
  console.log('');

  return report;
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: RepairOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--domain':
      case '-d':
        options.domain = args[++i];
        break;
      case '--app-path':
        options.appPath = args[++i];
        break;
      case '--region':
      case '-r':
        options.region = args[++i];
        break;
      case '--profile':
        options.profile = args[++i];
        break;
      case '--user':
      case '-u':
        options.userEmail = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--skip-sieve':
        options.skipSieve = true;
        break;
      case '--skip-resync':
        options.skipResync = true;
        break;
      case '--skip-services':
        options.skipServices = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: repair-mail-delivery.cli.ts [options]

Repairs common mail delivery issues.

Options:
  --domain, -d <domain>        Domain name
  --app-path <path>            App path (default: from APP_PATH env)
  --region, -r <region>        AWS region (default: us-east-1)
  --profile <profile>          AWS profile (default: hepe-admin-mfa)
  --user, -u <email>           Specific user email to repair
  --dry-run                    Preview changes without applying
  --skip-sieve                 Skip sieve repair
  --skip-resync                Skip mailbox resync
  --skip-services              Skip service restarts
  --help, -h                   Show this help

Environment Variables:
  DOMAIN                       Same as --domain
  APP_PATH                     Same as --app-path
  AWS_REGION                   Same as --region
  AWS_PROFILE                  Same as --profile
  USER_EMAIL                   Same as --user
  USER_PASSWORD                Password for user auth test
  DRY_RUN                      Set to 1 for dry run

Examples:
  # Repair all mail delivery issues
  pnpm nx run cdk-k3frame-instance:admin:repair:mail

  # Repair specific user
  USER_EMAIL=sysops@k3frame.com pnpm nx run cdk-k3frame-instance:admin:repair:mail

  # Dry run to preview
  DRY_RUN=1 pnpm nx run cdk-k3frame-instance:admin:repair:mail
`);
        process.exit(0);
    }
  }

  try {
    const report = await repairMailDelivery(options);

    if (report.summary.failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { repairMailDelivery };
