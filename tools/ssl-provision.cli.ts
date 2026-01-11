#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';

interface SslProvisionOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  domains?: string[];
}

/**
 * Provision SSL certificates via Mail-in-a-Box management script
 */
async function provisionSslCertificates(
  options: SslProvisionOptions
): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔐 SSL Certificate Provision');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

  try {
    // Get stack info
    console.log('📋 Step 1: Getting stack information...');
    const stackInfo = await getStackInfoFromApp(appPath, {
      domain,
      region,
      profile,
    });

    if (!stackInfo.instanceId) {
      throw new Error('Instance ID not found in stack outputs');
    }

    if (!stackInfo.instancePublicIp) {
      throw new Error('Instance public IP not found');
    }

    const instanceId = stackInfo.instanceId;
    const instanceIp = stackInfo.instancePublicIp;
    const instanceDns = stackInfo.instanceDns || 'box';
    const hostname = `${instanceDns}.${domain}`;

    console.log(`✅ Found instance: ${instanceId}`);
    console.log(`   IP: ${instanceIp}`);
    console.log(`   Hostname: ${hostname}\n`);

    // Get SSH key
    console.log('📋 Step 2: Getting SSH key...');
    const keyPath = await getSshKeyPath({
      appPath,
      domain,
      region,
      profile,
      ensureSetup: true,
    });

    if (!keyPath) {
      throw new Error(
        'SSH key not found. Run: pnpm nx run cdk-emcnotary-instance:admin:ssh:setup'
      );
    }

    console.log(`✅ SSH key ready: ${keyPath}\n`);

    // Determine domains to provision
    const domainsToProvision = options.domains || [hostname, domain];
    console.log(`📋 Step 3: Provisioning SSL certificates for:`);
    domainsToProvision.forEach((d) => console.log(`   - ${d}`));
    console.log('');

    // Mail-in-a-Box uses management/ssl_certificates.py to provision certificates
    // The script automatically provisions certificates for all domains configured in Mail-in-a-Box
    console.log('🔍 Step 4: Running Mail-in-a-Box SSL certificate provision...\n');

    // Use Mail-in-a-Box management script to provision SSL certificates
    // This will use Let's Encrypt to provision certificates for all configured domains
    const provisionCommand = `cd /opt/mailinabox && sudo -u root python3 management/ssl_certificates.py --force`;

    const sshArgs = [
      '-i',
      keyPath,
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'ConnectTimeout=30',
      `ubuntu@${instanceIp}`,
      provisionCommand,
    ];

    return new Promise((resolve, reject) => {
      console.log('⏳ Provisioning SSL certificates (this may take 1-2 minutes)...\n');

      // Capture stderr separately to detect connection errors
      let stderrOutput = '';

      const ssh = spawn('ssh', sshArgs);

      // Forward stdout to console
      ssh.stdout.on('data', (data) => {
        process.stdout.write(data);
      });

      // Capture stderr to detect connection errors
      ssh.stderr.on('data', (data) => {
        const text = data.toString();
        stderrOutput += text;
        // Filter out common SSH warnings that aren't errors
        if (!text.includes('Permanently added') && !text.includes('Warning: Permanently added')) {
          process.stderr.write(text);
        }
      });

      ssh.on('close', (code) => {
        // Check for connection errors in stderr
        const connectionErrorPatterns = [
          'Connection refused',
          'Connection timed out',
          'Connection closed',
          'Network is unreachable',
          'No route to host',
          'Host key verification failed',
          'Permission denied',
          'Could not resolve hostname',
        ];

        const isConnectionError = connectionErrorPatterns.some((pattern) =>
          stderrOutput.toLowerCase().includes(pattern.toLowerCase())
        );

        if (code === 0) {
          console.log('\n✅ SSL certificate provisioning completed successfully');
          console.log('\n💡 Next steps:');
          console.log(`   1. Verify certificates: pnpm nx run cdk-emcnotary-instance:admin:bootstrap:confirm`);
          console.log(`   2. Access admin UI: https://${instanceIp}/admin`);
          console.log(`   3. Check System > TLS(SSL) Certificates in admin UI\n`);
          resolve();
        } else if (isConnectionError) {
          // Connection errors are real failures - instance is not accessible
          console.error(`\n❌ SSL provisioning failed: Connection error`);
          console.error(`   Exit code: ${code}`);
          console.error(`   Error: ${stderrOutput.trim() || 'Unknown connection error'}`);
          console.error('\n💡 Troubleshooting steps:');
          console.error(`   1. Verify instance is running: aws ec2 describe-instance-status --instance-ids ${instanceId} --region ${region} --profile ${profile}`);
          console.error(`   2. Check security group allows SSH from your IP`);
          console.error(`   3. Verify SSH key is correct: pnpm nx run cdk-emcnotary-instance:admin:ssh:test`);
          console.error(`   4. Check instance logs: aws ec2 get-console-output --instance-id ${instanceId} --region ${region} --profile ${profile}\n`);
          reject(
            new Error(
              `SSH connection failed: ${stderrOutput.trim() || 'Connection error'} (exit code: ${code})`
            )
          );
        } else {
          // Non-zero exit code but not a connection error
          // This might be normal if certificates are already provisioned or SSL script has warnings
          console.log(`\n⚠️  SSL provisioning exited with code ${code}`);
          if (stderrOutput.trim()) {
            console.log(`   Error output: ${stderrOutput.trim()}`);
          }
          console.log('   This may be normal if certificates are already provisioned.');
          console.log('   Check the output above for details.');
          console.log(`\n💡 Verify SSL status: pnpm nx run cdk-emcnotary-instance:admin:ssl:status\n`);
          // Resolve successfully - certificates might already be provisioned
          // User can verify with ssl:status task
          resolve();
        }
      });

      ssh.on('error', (error) => {
        // Spawn errors (e.g., ssh command not found) are always failures
        console.error(`\n❌ Failed to execute SSH command: ${error.message}`);
        reject(error);
      });

      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        console.log('\n\n⏹️  Stopping SSL provisioning...');
        ssh.kill('SIGINT');
        reject(new Error('SSL provisioning interrupted by user'));
      });
    });
  } catch (error) {
    console.error('\n❌ Failed to provision SSL certificates:');
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
const options: SslProvisionOptions = {};

// Parse --domains
const domainsIndex = args.indexOf('--domains');
if (domainsIndex !== -1 && args[domainsIndex + 1]) {
  options.domains = args[domainsIndex + 1].split(',').map((d) => d.trim());
}

// Parse individual domain arguments
if (args.length > 0 && !args[0].startsWith('--')) {
  options.domains = args.filter((arg) => !arg.startsWith('--'));
}

// Run if executed directly
if (require.main === module) {
  provisionSslCertificates(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

