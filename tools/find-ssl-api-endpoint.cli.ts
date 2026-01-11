#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath, buildSshArgs } from '@mm/admin-ssh';
import { spawn } from 'child_process';

interface FindEndpointOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

/**
 * Execute SSH command and return output
 */
async function sshCommand(
  keyPath: string | null,
  host: string,
  command: string
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise(async (resolve) => {
    const sshArgs = await buildSshArgs(keyPath, host, 'ubuntu');
    sshArgs.push(command);

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
        error: error.trim(),
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

/**
 * Find the actual SSL provisioning endpoint by examining Mail-in-a-Box web UI code
 */
async function findSslApiEndpoint(options: FindEndpointOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔍 Finding Mail-in-a-Box SSL Provisioning API Endpoint');
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

    if (!stackInfo.instancePublicIp) {
      throw new Error('Instance public IP not found');
    }

    const instanceIp = stackInfo.instancePublicIp;
    console.log(`✅ Found instance IP: ${instanceIp}\n`);

    // Get SSH key (prefer agent)
    const keyPath = await getSshKeyPath({
      appPath,
      domain,
      region,
      profile,
      ensureSetup: false,
    });

    if (!keyPath) {
      const { isSshAgentAvailable } = await import('@mm/admin-ssh');
      const agentAvailable = await isSshAgentAvailable();
      if (!agentAvailable) {
        throw new Error('SSH key or agent required');
      }
      console.log('✅ Using SSH agent\n');
    } else {
      console.log(`✅ Using SSH key: ${keyPath}\n`);
    }

    // Find web.py file
    console.log('📋 Step 2: Finding Mail-in-a-Box web UI files...');
    const webPyCheck = await sshCommand(
      keyPath,
      instanceIp,
      'find /opt/mailinabox/web -name "*.py" -type f | head -20'
    );
    
    if (webPyCheck.success && webPyCheck.output) {
      console.log('✅ Found web UI files:');
      webPyCheck.output.split('\n').forEach((file) => {
        if (file.trim()) console.log(`   - ${file.trim()}`);
      });
      console.log('');
    }

    // Search for SSL-related routes in web.py
    console.log('📋 Step 3: Searching for SSL provisioning routes...');
    const sslRoutesCheck = await sshCommand(
      keyPath,
      instanceIp,
      'grep -n "ssl\|tls\|certificate" /opt/mailinabox/web/web.py 2>/dev/null | grep -i "route\|def\|@app" | head -30'
    );
    
    if (sslRoutesCheck.success && sslRoutesCheck.output) {
      console.log('✅ Found SSL-related routes:');
      console.log(sslRoutesCheck.output);
      console.log('');
    }

    // Search for provision-related routes
    console.log('📋 Step 4: Searching for provision endpoints...');
    const provisionCheck = await sshCommand(
      keyPath,
      instanceIp,
      'grep -rn "provision" /opt/mailinabox/web/*.py 2>/dev/null | grep -i "route\|def\|@app\|POST\|GET" | head -30'
    );
    
    if (provisionCheck.success && provisionCheck.output) {
      console.log('✅ Found provision-related code:');
      console.log(provisionCheck.output);
      console.log('');
    }

    // Get full context around SSL routes
    console.log('📋 Step 5: Getting full context of SSL routes...');
    const contextCheck = await sshCommand(
      keyPath,
      instanceIp,
      'grep -n "@app.route.*ssl\|@app.route.*tls\|@app.route.*cert" /opt/mailinabox/web/web.py 2>/dev/null | head -10'
    );
    
    if (contextCheck.success && contextCheck.output) {
      const lineNumbers = contextCheck.output.split('\n')
        .map(line => line.split(':')[0])
        .filter(num => num && !isNaN(parseInt(num)));
      
      for (const lineNum of lineNumbers.slice(0, 5)) {
        const context = await sshCommand(
          keyPath,
          instanceIp,
          `sed -n '${Math.max(1, parseInt(lineNum) - 5)},${parseInt(lineNum) + 20}p' /opt/mailinabox/web/web.py 2>/dev/null`
        );
        if (context.success && context.output) {
          console.log(`\n   Context around line ${lineNum}:`);
          console.log(context.output);
          console.log('');
        }
      }
    }

    // Check for system.py or similar files
    console.log('📋 Step 6: Checking for system management files...');
    const systemFilesCheck = await sshCommand(
      keyPath,
      instanceIp,
      'find /opt/mailinabox/web -name "*system*.py" -o -name "*ssl*.py" 2>/dev/null'
    );
    
    if (systemFilesCheck.success && systemFilesCheck.output) {
      const files = systemFilesCheck.output.split('\n').filter(f => f.trim());
      for (const file of files.slice(0, 3)) {
        if (file.trim()) {
          console.log(`\n   Examining: ${file.trim()}`);
          const fileContent = await sshCommand(
            keyPath,
            instanceIp,
            `grep -n "ssl\|tls\|certificate\|provision" "${file.trim()}" 2>/dev/null | head -20`
          );
          if (fileContent.success && fileContent.output) {
            console.log(fileContent.output);
          }
        }
      }
    }

    // Check HTML templates for form actions
    console.log('\n📋 Step 7: Checking HTML templates for form actions...');
    const templateCheck = await sshCommand(
      keyPath,
      instanceIp,
      'grep -rn "provision\|ssl.*cert" /opt/mailinabox/web/templates/*.html 2>/dev/null | grep -i "action\|form\|button" | head -20'
    );
    
    if (templateCheck.success && templateCheck.output) {
      console.log('✅ Found form actions in templates:');
      console.log(templateCheck.output);
      console.log('');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Review the output above to identify:');
    console.log('1. The Flask route decorator (@app.route) for SSL provisioning');
    console.log('2. The HTTP method (POST/GET)');
    console.log('3. The endpoint path');
    console.log('4. Any required parameters\n');

  } catch (error) {
    console.error('\n❌ Failed to find SSL endpoint:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  findSslApiEndpoint({}).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { findSslApiEndpoint };

