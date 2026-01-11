#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getAdminCredentials } from '@mm/admin-credentials';
import { getSshKeyPath, buildSshArgs } from '@mm/admin-ssh';
import * as https from 'https';
import { spawn } from 'child_process';

interface SslProvisionApiOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

/**
 * Makes API call to Mail-in-a-Box SSL API
 * Uses https module with rejectUnauthorized: false to handle self-signed certificates
 */
async function makeApiCall(
  method: string,
  apiPath: string,
  data: string | undefined,
  baseUrl: string,
  email: string,
  password: string
): Promise<{ httpCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(baseUrl);
    const fullPath = `${parsedUrl.pathname}${apiPath}`.replace(/\/+/g, '/');

    const auth = Buffer.from(`${email}:${password}`).toString('base64');
    
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: fullPath,
      method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'Mail-in-a-Box-SSL-Provision/1.0',
      },
      rejectUnauthorized: false, // Allow self-signed certificates
      timeout: 120000, // 2 minute timeout (SSL provisioning can take time)
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      
      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        resolve({
          httpCode: res.statusCode || 500,
          body: responseBody,
        });
      });
    });

    req.on('error', (err) => {
      reject(new Error(`API call failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API call timeout after 2 minutes'));
    });

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

/**
 * Find correct endpoint by examining web.py
 */
async function findCorrectEndpoint(
  keyPath: string | null,
  instanceIp: string,
  baseUrl: string,
  email: string,
  password: string
): Promise<{ path: string; data?: string } | null> {
  return new Promise(async (resolve) => {
    try {
      // Build SSH command
      const sshArgs = await buildSshArgs(keyPath, instanceIp, 'ubuntu');
      
      // Search for SSL provision route in web.py
      const command = `grep -n "@app.route.*ssl\|@app.route.*tls\|@app.route.*cert\|def.*ssl.*provision\|def.*provision.*ssl" /opt/mailinabox/web/web.py 2>/dev/null | head -10`;
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
        if (code === 0 && output.trim()) {
          // Try to extract route path from output
          const routeMatch = output.match(/@app\.route\(['"]([^'"]+)['"]/);
          if (routeMatch) {
            resolve({ path: routeMatch[1] });
            return;
          }
        }
        resolve(null);
      });

      ssh.on('error', () => {
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Handle successful API response
 */
async function handleSuccessResponse(
  result: { httpCode: number; body: string },
  baseUrl: string,
  keyPath: string | null,
  instanceIp: string,
  hostname: string
): Promise<void> {
  console.log(`\n📊 API Response:`);
  console.log(`   HTTP Status: ${result.httpCode}`);
  
  if (result.body) {
    // Try to parse JSON response if available
    try {
      const jsonBody = JSON.parse(result.body);
      console.log(`   Response: ${JSON.stringify(jsonBody, null, 2)}`);
    } catch {
      // Not JSON, display as text
      const bodyPreview = result.body.length > 500 
        ? result.body.substring(0, 500) + '...' 
        : result.body;
      console.log(`   Response: ${bodyPreview}`);
    }
  }

  if (result.httpCode === 200) {
    console.log('\n✅ SSL certificate provisioning completed successfully');
    
    // Verify certificates were actually provisioned
    console.log('\n📋 Step 4: Verifying certificates were provisioned...');
    await verifyCertificatesProvisioned(keyPath, instanceIp, hostname);
    
    console.log('\n💡 Next steps:');
    console.log(`   1. Verify certificates: pnpm nx run cdk-emcnotary-instance:admin:ssl:status`);
    console.log(`   2. Access admin UI: ${baseUrl}/admin`);
    console.log(`   3. Check System > TLS(SSL) Certificates in admin UI\n`);
  } else if (result.httpCode === 202) {
    // 202 Accepted - async operation started
    console.log('\n✅ SSL certificate provisioning started (async operation)');
    console.log('   Provisioning is running in the background.');
    console.log('\n💡 Next steps:');
    console.log(`   1. Wait 1-2 minutes for provisioning to complete`);
    console.log(`   2. Verify certificates: pnpm nx run cdk-emcnotary-instance:admin:ssl:status`);
    console.log(`   3. Check admin UI: ${baseUrl}/admin\n`);
  }
}

/**
 * Verify SSL certificates were actually provisioned (not self-signed)
 */
async function verifyCertificatesProvisioned(
  keyPath: string | null,
  instanceIp: string,
  hostname: string
): Promise<void> {
  return new Promise(async (resolve) => {
    try {
      const sshArgs = await buildSshArgs(keyPath, instanceIp, 'ubuntu');
      
      // Check certificate issuer from multiple locations
      const command = `(
        # Check main certificate file
        openssl x509 -in /home/user-data/ssl/ssl_certificate.pem -noout -issuer 2>/dev/null && echo "---MAIN---" ||
        # Check Let's Encrypt directory
        find /home/user-data/ssl/lets_encrypt -name "*.pem" -type f 2>/dev/null | head -1 | xargs openssl x509 -noout -issuer 2>/dev/null && echo "---LETSENCRYPT---" ||
        # Check if symlink exists
        readlink -f /home/user-data/ssl/ssl_certificate.pem 2>/dev/null | xargs openssl x509 -noout -issuer 2>/dev/null && echo "---SYMLINK---" ||
        echo "NOT_FOUND"
      )`;
      sshArgs.push(command);

      let output = '';
      const ssh = spawn('ssh', sshArgs);

      ssh.stdout.on('data', (data) => {
        output += data.toString();
      });

      ssh.on('close', (code) => {
        if (code === 0 && output.trim() && output.trim() !== 'NOT_FOUND') {
          if (output.includes("Let's Encrypt") || output.includes("Let\\'s Encrypt")) {
            console.log('   ✅ Certificates verified: Let\'s Encrypt certificates found');
          } else if (output.includes(hostname)) {
            console.log('   ⚠️  Warning: Certificates appear to be self-signed');
            console.log(`      Issuer: ${output.trim()}`);
            console.log('      Provisioning may still be in progress. Wait 1-2 minutes and check again.');
          } else {
            console.log(`   ℹ️  Certificate issuer: ${output.trim()}`);
          }
        } else {
          console.log('   ⚠️  Could not verify certificate (may still be provisioning)');
        }
        resolve();
      });

      ssh.on('error', () => {
        console.log('   ⚠️  Could not verify certificate (SSH error)');
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

/**
 * Provision SSL certificates via Mail-in-a-Box HTTP API
 */
async function provisionSslCertificatesViaApi(
  options: SslProvisionApiOptions
): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔐 SSL Certificate Provision (HTTP API)');
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
    const baseUrl = `https://${hostname}`;

    // Get SSH key for fallback endpoint discovery
    const keyPath = await getSshKeyPath({
      appPath,
      domain,
      region,
      profile,
      ensureSetup: false,
    });

    console.log(`✅ Found instance: ${instanceId}`);
    console.log(`   IP: ${instanceIp}`);
    console.log(`   Hostname: ${hostname}`);
    console.log(`   Admin URL: ${baseUrl}/admin\n`);

    // Get admin credentials
    console.log('📋 Step 2: Getting admin credentials...');
    const credentials = await getAdminCredentials({
      appPath,
      domain,
      region,
      profile,
    });

    console.log(`✅ Admin credentials retrieved`);
    console.log(`   Email: ${credentials.email}\n`);

    // Provision SSL certificates via API
    console.log('📋 Step 3: Provisioning SSL certificates via HTTP API...');
    console.log(`   Endpoint: ${baseUrl}/admin/ssl/provision`);
    console.log(`   Domain: ${domain}`);
    console.log('   ⏳ This may take 1-2 minutes...\n');

    // Try different endpoint variations based on Mail-in-a-Box API patterns
    const endpointsToTry = [
      { path: '/admin/ssl/provision', data: undefined },
      { path: '/admin/ssl/provision', data: `domain=${domain}` },
      { path: '/admin/ssl/provision', data: `domain=${hostname}` },
      { path: '/admin/ssl/certificates/provision', data: undefined },
      { path: '/admin/system/ssl/provision', data: undefined },
    ];

    let lastError: Error | null = null;
    let success = false;

    for (const endpoint of endpointsToTry) {
      try {
        console.log(`   Trying: POST ${endpoint.path}${endpoint.data ? ` with domain=${endpoint.data.split('=')[1]}` : ''}...`);
        
        const result = await makeApiCall(
          'POST',
          endpoint.path,
          endpoint.data,
          baseUrl,
          credentials.email,
          credentials.password
        );

        console.log(`   Response: HTTP ${result.httpCode}\n`);
        
        if (result.httpCode === 200 || result.httpCode === 202) {
          // Success! Use this endpoint
          success = true;
          await handleSuccessResponse(result, baseUrl, keyPath, instanceIp, hostname);
          break;
        } else if (result.httpCode === 404) {
          // Endpoint doesn't exist, try next one
          console.log(`   ⚠️  Endpoint not found (404), trying next...\n`);
          continue;
        } else {
          // Other error, might be the right endpoint but with wrong params
          console.log(`   ⚠️  HTTP ${result.httpCode}: ${result.body.substring(0, 200)}\n`);
          lastError = new Error(`HTTP ${result.httpCode}: ${result.body.substring(0, 200)}`);
          // Continue to try other endpoints
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
        lastError = error instanceof Error ? error : new Error(String(error));
        // Continue to try other endpoints
      }
    }

    if (!success) {
      // If all endpoints failed, try to find the correct endpoint by examining web.py
      console.log('\n⚠️  All endpoint variations failed. Examining web UI code to find correct endpoint...\n');
      
      try {
        // Get SSH key for endpoint discovery
        const sshKeyPath = await getSshKeyPath({
          appPath,
          domain,
          region,
          profile,
          ensureSetup: false,
        });
        
        const correctEndpoint = await findCorrectEndpoint(sshKeyPath, instanceIp, baseUrl, credentials.email, credentials.password);
        if (correctEndpoint) {
          console.log(`\n✅ Found correct endpoint: ${correctEndpoint.path}`);
          console.log('   Retrying with correct endpoint...\n');
          
          const result = await makeApiCall(
            'POST',
            correctEndpoint.path,
            correctEndpoint.data,
            baseUrl,
            credentials.email,
            credentials.password
          );
          
          if (result.httpCode === 200 || result.httpCode === 202) {
            await handleSuccessResponse(result, baseUrl, sshKeyPath, instanceIp, hostname);
            return;
          }
        }
      } catch (findError) {
        console.log(`   Could not find endpoint automatically: ${findError instanceof Error ? findError.message : String(findError)}\n`);
      }
      
      // Final error
      console.error('\n❌ All endpoint variations failed');
      console.error('\n💡 Troubleshooting:');
      console.error(`   1. Check if Mail-in-a-Box is running: ${baseUrl}/admin`);
      console.error(`   2. Verify admin credentials are correct`);
      console.error(`   3. Check DNS is pointing to instance: ${hostname} -> ${instanceIp}`);
      console.error(`   4. Try finding the endpoint: pnpm nx run cdk-emcnotary-instance:admin:ssl:find-endpoint`);
      console.error(`   5. Review Mail-in-a-Box logs on the instance\n`);
      throw lastError || new Error('All SSL provisioning endpoint attempts failed');
    }
  } catch (error) {
    console.error('\n❌ Failed to provision SSL certificates:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      
      // Provide helpful error messages
      if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
        console.error('\n💡 Troubleshooting:');
        console.error(`   1. Verify instance is running: aws ec2 describe-instance-status --instance-ids ${instanceId} --region ${region} --profile ${profile}`);
        console.error(`   2. Check if HTTPS is accessible: curl -k ${baseUrl}/admin`);
        console.error(`   3. Verify DNS: ${hostname} should resolve to ${instanceIp}`);
      } else if (error.message.includes('401') || error.message.includes('403')) {
        console.error('\n💡 Troubleshooting:');
        console.error(`   1. Verify admin credentials: pnpm nx run cdk-emcnotary-instance:admin:credentials`);
        console.error(`   2. Test login: ${baseUrl}/admin`);
      }
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  provisionSslCertificatesViaApi({}).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { provisionSslCertificatesViaApi };


