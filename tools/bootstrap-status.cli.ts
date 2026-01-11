#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import {
  SSMClient,
  ListCommandsCommand,
  GetCommandInvocationCommand,
  DescribeInstanceInformationCommand,
} from '@aws-sdk/client-ssm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';

interface StatusOptions {
  commandId?: string;
  instanceId?: string;
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  follow?: boolean;
  tail?: number;
}

/**
 * Get latest SSM command ID for instance
 */
async function getLatestCommandId(
  ssm: SSMClient,
  instanceId: string
): Promise<string | null> {
  try {
    const response = await ssm.send(
      new ListCommandsCommand({
        InstanceId: instanceId,
        MaxResults: 1,
      })
    );
    return response.Commands?.[0]?.CommandId || null;
  } catch (error) {
    console.error(`Failed to list commands: ${error}`);
    return null;
  }
}

/**
 * Check SSM agent status
 */
async function checkSsmAgentStatus(
  ssm: SSMClient,
  instanceId: string
): Promise<{ online: boolean; pingStatus?: string; lastPing?: Date }> {
  try {
    const response = await ssm.send(
      new DescribeInstanceInformationCommand({
        Filters: [{ Key: 'InstanceIds', Values: [instanceId] }],
      })
    );

    const instanceInfo = response.InstanceInformationList?.[0];
    if (!instanceInfo) {
      return { online: false };
    }

    return {
      online: instanceInfo.PingStatus === 'Online',
      pingStatus: instanceInfo.PingStatus,
      lastPing: instanceInfo.LastPingDateTime,
    };
  } catch (error) {
    return { online: false };
  }
}

/**
 * Check instance status
 */
async function checkInstanceStatus(
  ec2: EC2Client,
  instanceId: string
): Promise<{ running: boolean; state?: string; publicIp?: string }> {
  try {
    const response = await ec2.send(
      new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      })
    );

    const instance = response.Reservations?.[0]?.Instances?.[0];
    if (!instance) {
      return { running: false };
    }

    return {
      running: instance.State?.Name === 'running',
      state: instance.State?.Name,
      publicIp: instance.PublicIpAddress,
    };
  } catch (error) {
    return { running: false };
  }
}

/**
 * Get command status
 */
async function getCommandStatus(
  ssm: SSMClient,
  commandId: string,
  instanceId: string
): Promise<{
  status: string;
  statusDetails?: string;
  output?: string;
  error?: string;
  requestedDateTime?: Date;
  completedDateTime?: Date;
}> {
  try {
    const response = await ssm.send(
      new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      })
    );

    return {
      status: response.Status || 'Unknown',
      statusDetails: response.StatusDetails,
      output: response.StandardOutputContent,
      error: response.StandardErrorContent,
      requestedDateTime: response.RequestedDateTime,
      completedDateTime: response.CompletedDateTime,
    };
  } catch (error) {
    throw new Error(`Failed to get command status: ${error}`);
  }
}

/**
 * Main status check function
 */
async function checkBootstrapStatus(options: StatusOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('📋 Bootstrap Status Check');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

  // Create AWS clients
  const credentials = fromIni({ profile });
  const ssm = new SSMClient({ region, credentials });
  const ec2 = new EC2Client({ region, credentials });

  try {
    // Get stack info (prerequisite check)
    console.log('🔍 Step 1: Getting stack information...');
    const stackInfo = await getStackInfoFromApp(appPath, {
      domain,
      region,
      profile,
    });

    if (!stackInfo.instanceId) {
      throw new Error('Instance ID not found in stack outputs');
    }

    const instanceId = options.instanceId || stackInfo.instanceId;
    console.log(`✅ Found instance: ${instanceId}`);
    console.log(`   IP: ${stackInfo.instancePublicIp || 'N/A'}\n`);

    // Check instance status (prerequisite check)
    console.log('🔍 Step 2: Checking instance status...');
    const instanceStatus = await checkInstanceStatus(ec2, instanceId);
    if (!instanceStatus.running) {
      console.log(`⚠️  Instance is not running (state: ${instanceStatus.state})`);
      console.log(`   Instance must be running to check bootstrap status\n`);
      return;
    }
    console.log(`✅ Instance is running (state: ${instanceStatus.state})\n`);

    // Check SSM agent status (prerequisite check)
    console.log('🔍 Step 3: Checking SSM agent status...');
    const ssmStatus = await checkSsmAgentStatus(ssm, instanceId);
    if (!ssmStatus.online) {
      console.log(`⚠️  SSM agent is not online (status: ${ssmStatus.pingStatus || 'Unknown'})`);
      console.log(`   Run: pnpm nx run cdk-emcnotary-instance:admin:fix-ssm-agent\n`);
      return;
    }
    console.log(`✅ SSM agent is online (PingStatus: ${ssmStatus.pingStatus})`);
    if (ssmStatus.lastPing) {
      const lastPingAgo = Math.floor((Date.now() - ssmStatus.lastPing.getTime()) / 1000);
      console.log(`   Last ping: ${lastPingAgo} seconds ago\n`);
    }

    // Get command status
    console.log('🔍 Step 4: Checking bootstrap command status...');
    let commandId = options.commandId;
    
    if (!commandId) {
      console.log('   Getting latest command ID...');
      commandId = await getLatestCommandId(ssm, instanceId);
      if (!commandId) {
        console.log('⚠️  No SSM commands found for this instance');
        console.log(`   Bootstrap may not have been run yet\n`);
        return;
      }
      console.log(`   Latest command ID: ${commandId}\n`);
    } else {
      console.log(`   Using provided command ID: ${commandId}\n`);
    }

    const commandStatus = await getCommandStatus(ssm, commandId, instanceId);
    
    console.log('📊 Command Status:');
    console.log(`   Status: ${commandStatus.status}`);
    if (commandStatus.statusDetails) {
      console.log(`   Details: ${commandStatus.statusDetails}`);
    }
    if (commandStatus.requestedDateTime) {
      const requestedAgo = Math.floor(
        (Date.now() - commandStatus.requestedDateTime.getTime()) / 1000
      );
      console.log(`   Requested: ${requestedAgo} seconds ago`);
    }
    if (commandStatus.completedDateTime) {
      const duration = Math.floor(
        (commandStatus.completedDateTime.getTime() -
          (commandStatus.requestedDateTime?.getTime() || Date.now())) /
          1000
      );
      console.log(`   Completed: ${duration} seconds after start`);
    }

    // Show output/error
    if (commandStatus.output) {
      const outputLines = commandStatus.output.split('\n');
      const tailLines = options.tail || 20;
      const displayLines = outputLines.slice(-tailLines);
      
      console.log(`\n📝 Output (last ${displayLines.length} lines):`);
      displayLines.forEach((line) => console.log(`   ${line}`));
    }

    if (commandStatus.error) {
      const errorLines = commandStatus.error.split('\n');
      const tailLines = options.tail || 30;
      const displayLines = errorLines.slice(-tailLines);
      
      console.log(`\n❌ Error Output (last ${displayLines.length} lines):`);
      displayLines.forEach((line) => console.log(`   ${line}`));
    }

    // Status summary
    console.log('\n📋 Summary:');
    if (commandStatus.status === 'Success') {
      console.log('✅ Bootstrap completed successfully');
      console.log(`\n💡 View full logs:`);
      console.log(`   ssh -i ~/.ssh/${stackInfo.instanceKeyName || 'key'}.pem ubuntu@${stackInfo.instancePublicIp} "tail -f /var/log/mailinabox_setup.log"`);
    } else if (commandStatus.status === 'Failed') {
      console.log('❌ Bootstrap failed');
      console.log(`\n💡 Troubleshooting:`);
      console.log(`   1. Check error output above`);
      console.log(`   2. View instance logs: ssh -i ~/.ssh/${stackInfo.instanceKeyName || 'key'}.pem ubuntu@${stackInfo.instancePublicIp} "tail -50 /var/log/mailinabox_setup.log"`);
      console.log(`   3. Check SSM agent: pnpm nx run cdk-emcnotary-instance:admin:fix-ssm-agent`);
    } else if (commandStatus.status === 'InProgress' || commandStatus.status === 'Pending') {
      console.log('⏳ Bootstrap is still running...');
      console.log(`\n💡 Monitor progress:`);
      console.log(`   ssh -i ~/.ssh/${stackInfo.instanceKeyName || 'key'}.pem ubuntu@${stackInfo.instancePublicIp} "tail -f /var/log/mailinabox_setup.log"`);
      if (options.follow) {
        console.log(`\n🔄 Following command status (will update every 10 seconds)...`);
        // Follow mode would poll and update
      }
    } else {
      console.log(`⚠️  Bootstrap status: ${commandStatus.status}`);
    }
  } catch (error) {
    console.error('\n❌ Status check failed:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

/**
 * List recent SSM commands for instance
 */
async function listCommands(options: StatusOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const credentials = fromIni({ profile });
  const ssm = new SSMClient({ region, credentials });

  try {
    // Get stack info
    const stackInfo = await getStackInfoFromApp(appPath, {
      domain,
      region,
      profile,
    });

    if (!stackInfo.instanceId) {
      throw new Error('Instance ID not found in stack outputs');
    }

    const instanceId = options.instanceId || stackInfo.instanceId;
    const maxItems = parseInt(process.env.MAX_ITEMS || '10', 10);

    console.log(`📋 Recent SSM commands for instance ${instanceId}:\n`);

    const response = await ssm.send(
      new ListCommandsCommand({
        InstanceId: instanceId,
        MaxResults: maxItems,
      })
    );

    if (!response.Commands || response.Commands.length === 0) {
      console.log('No commands found for this instance.');
      return;
    }

    // Format as table
    console.log(
      'Command ID'.padEnd(40) +
        'Status'.padEnd(12) +
        'Document'.padEnd(25) +
        'Requested'
    );
    console.log('-'.repeat(100));

    for (const cmd of response.Commands) {
      const commandId = cmd.CommandId || 'N/A';
      const status = cmd.Status || 'Unknown';
      const document = cmd.DocumentName || 'N/A';
      const requested = cmd.RequestedDateTime
        ? cmd.RequestedDateTime.toISOString().replace('T', ' ').substring(0, 19)
        : 'N/A';

      console.log(
        commandId.substring(0, 38).padEnd(40) +
          status.padEnd(12) +
          document.substring(0, 23).padEnd(25) +
          requested
      );
    }
  } catch (error) {
    console.error('\n❌ Failed to list commands:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: StatusOptions = {
  follow: args.includes('--follow') || args.includes('-f'),
};

// Check if this is a list-commands request
if (args.includes('--list-commands') || args.includes('-l')) {
  listCommands(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
} else {
  // Parse --command-id
  const commandIdIndex = args.indexOf('--command-id');
  if (commandIdIndex !== -1 && args[commandIdIndex + 1]) {
    options.commandId = args[commandIdIndex + 1];
  }

  // Parse --tail
  const tailIndex = args.indexOf('--tail');
  if (tailIndex !== -1 && args[tailIndex + 1]) {
    options.tail = parseInt(args[tailIndex + 1], 10);
  }

  // Parse --instance-id
  const instanceIdIndex = args.indexOf('--instance-id');
  if (instanceIdIndex !== -1 && args[instanceIdIndex + 1]) {
    options.instanceId = args[instanceIdIndex + 1];
  }

  // Run if executed directly
  if (require.main === module) {
    checkBootstrapStatus(options).catch((error) => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
  }
}

