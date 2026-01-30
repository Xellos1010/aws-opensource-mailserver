#!/usr/bin/env ts-node

/**
 * Set SES DNS records via SSM agent script executed on the Mail-in-a-Box instance
 * 
 * This tool:
 * 1. Creates a bash script with SES DNS records
 * 2. Executes it on the instance via SSM Run Command
 * 3. Cleans up the script after execution
 * 
 * Usage:
 *   APP_PATH=apps/cdk-emc-notary/instance DOMAIN=emcnotary.com pnpm exec tsx tools/set-ses-dns-ssm.cli.ts
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getAdminCredentials } from '@mm/admin-credentials';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

const appPath = process.env['APP_PATH'] || 'apps/cdk-emc-notary/instance';
const domain = process.env['DOMAIN'] || 'emcnotary.com';
const region = process.env['AWS_REGION'] || 'us-east-1';
const profile = process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
const coreAppPath = process.env['CORE_APP_PATH'] || 'apps/cdk-emc-notary/core';

async function setSesDnsViaSsm() {
  console.log('\n📋 Setting SES DNS Records via SSM Agent Script\n');
  console.log('='.repeat(70));
  console.log(`Domain: ${domain}`);
  console.log('='.repeat(70));
  console.log('');

  try {
    // Step 1: Get instance stack info
    console.log('📋 Step 1: Getting instance stack information...');
    const instanceStackInfo = await getStackInfoFromApp(appPath, {
      domain,
      region,
      profile,
    });

    const instanceId = instanceStackInfo.instanceId;
    if (!instanceId) {
      throw new Error('Could not determine instance ID');
    }

    console.log(`✅ Instance ID: ${instanceId}\n`);

    // Step 2: Get SES DNS records from core stack
    console.log('📋 Step 2: Retrieving SES DNS records from core stack...');
    const coreStackInfo = await getStackInfoFromApp(coreAppPath, {
      domain,
      region,
      profile,
    });

    const coreStackName = coreStackInfo.stackName;
    if (!coreStackName) {
      throw new Error('Could not determine core stack name');
    }

    const { CloudFormationClient, DescribeStacksCommand } = await import('@aws-sdk/client-cloudformation');

    const credentials = fromIni({ profile });
    const cfClient = new CloudFormationClient({ region, credentials });

    const stackResp = await cfClient.send(
      new DescribeStacksCommand({ StackName: coreStackName })
    );

    const stack = stackResp.Stacks?.[0];
    if (!stack?.Outputs) {
      throw new Error(`Could not retrieve core stack outputs for ${coreStackName}`);
    }

    const outputs = stack.Outputs.reduce((acc, output) => {
      acc[output.OutputKey!] = output.OutputValue!;
      return acc;
    }, {} as Record<string, string>);

    const dkimName1 = outputs['DkimDNSTokenName1'];
    const dkimValue1 = outputs['DkimDNSTokenValue1'];
    const dkimName2 = outputs['DkimDNSTokenName2'];
    const dkimValue2 = outputs['DkimDNSTokenValue2'];
    const dkimName3 = outputs['DkimDNSTokenName3'];
    const dkimValue3 = outputs['DkimDNSTokenValue3'];
    const mailFromDomain = outputs['MailFromDomain'];
    const mailFromMx = outputs['MailFromMXRecord'];
    const mailFromTxt = outputs['MailFromTXTRecord'];

    if (!dkimName1 || !dkimValue1 || !dkimName2 || !dkimValue2 || !dkimName3 || !dkimValue3 ||
        !mailFromDomain || !mailFromMx || !mailFromTxt) {
      throw new Error('Missing required SES DNS record outputs from core stack');
    }

    console.log(`✅ Retrieved SES DNS records from ${coreStackName}\n`);

    // Step 3: Get admin credentials (SSM-backed)
    console.log('📋 Step 3: Getting admin credentials from SSM...');
    const adminCreds = await getAdminCredentials({
      appPath,
      domain,
      region,
      profile,
    });
    const adminEmail = adminCreds.email;
    const adminPassword = adminCreds.password;
    const hostname = `box.${domain}`;
    const baseUrl = `https://${hostname}`;

    console.log(`✅ Admin email: ${adminEmail}\n`);

    // Step 4: Normalize qnames
    // MIAB DNS API expects a fully-qualified domain name (must include a dot).
    // If we receive a short name, append the domain; otherwise keep the FQDN.
    function normalizeQname(qname: string, domain: string): string {
      if (qname.includes('.')) {
        return qname;
      }
      return `${qname}.${domain}`;
    }

    const normalizedDkim1 = normalizeQname(dkimName1, domain);
    const normalizedDkim2 = normalizeQname(dkimName2, domain);
    const normalizedDkim3 = normalizeQname(dkimName3, domain);
    const normalizedMailFrom = normalizeQname(mailFromDomain, domain);

    // Step 5: Create bash script
    console.log('📋 Step 4: Creating SSM agent script...');
    const script = `#!/bin/bash
set -Eeuo pipefail
IFS=$'\\n\\t'

# Mail-in-a-Box API endpoint
MIAB_HOST="${baseUrl}"
RESOLVE_HOST="${hostname}:443:127.0.0.1"
ADMIN_EMAIL="${adminEmail}"
ADMIN_PASSWORD="${adminPassword}"

# Function to make API call
set_dns_record() {
    local type=$1
    local name=$2
    local value=$3

    echo "Setting $type record: $name -> $value"

    # Make the API call (use -k to skip SSL verification for self-signed certs)
    response=$(curl -k -s -w "%{http_code}" -o /tmp/curl_response \
         --resolve "$RESOLVE_HOST" \
         -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" \
         -X PUT \
         --data-raw "$value" \
         -H "Content-Type: text/plain" \
         "\${MIAB_HOST}/admin/dns/custom/\${name}/\${type}" 2>&1)

    http_code=\${response##* }
    response_body=$(cat /tmp/curl_response)
    rm -f /tmp/curl_response

    if [ "$http_code" != "200" ]; then
        echo "Error: Failed to set $type record for $name (HTTP $http_code)"
        echo "Response: $response_body"
        return 1
    fi

    echo "Successfully set $type record for $name"
    return 0
}

# Set DKIM CNAME records (values must end with period)
set_dns_record CNAME "${normalizedDkim1}" "${dkimValue1}."
set_dns_record CNAME "${normalizedDkim2}" "${dkimValue2}."
set_dns_record CNAME "${normalizedDkim3}" "${dkimValue3}."

# Set Mail From MX record
set_dns_record MX "${normalizedMailFrom}" "${mailFromMx}"

# Set Mail From SPF TXT record
set_dns_record TXT "${normalizedMailFrom}" "${mailFromTxt}"

echo ""
echo "✅ All SES DNS records have been set successfully!"
`;

    console.log(`✅ Script created\n`);

    // Step 6: Execute via SSM
    console.log('📋 Step 5: Executing script via SSM Run Command...');
    const ssmClient = new SSMClient({ region, credentials });
    
    const command = new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [script],
      },
      TimeoutSeconds: 300,
    });

    const commandResp = await ssmClient.send(command);
    const commandId = commandResp.Command?.CommandId;

    if (!commandId) {
      throw new Error('Failed to send SSM command');
    }

    console.log(`✅ Command sent: ${commandId}`);
    console.log(`   Waiting for execution...\n`);

    // Step 7: Wait for command completion
    let status = 'InProgress';
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max

    while (status === 'InProgress' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

      const statusResp = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        })
      );

      status = statusResp.Status || 'Unknown';
      attempts++;

      if (status === 'InProgress') {
        process.stdout.write('.');
      }
    }

    console.log('\n');

    // Step 8: Get final output
    const finalResp = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      })
    );

    console.log('='.repeat(70));
    console.log('📊 Execution Result\n');
    console.log(`Status: ${finalResp.Status}`);
    console.log(`Exit Code: ${finalResp.ResponseCode || 'N/A'}\n`);

    if (finalResp.StandardOutputContent) {
      console.log('Output:');
      console.log(finalResp.StandardOutputContent);
      console.log('');
    }

    if (finalResp.StandardErrorContent) {
      console.log('Errors:');
      console.log(finalResp.StandardErrorContent);
      console.log('');
    }

    if (finalResp.Status === 'Success') {
      console.log('✅ SES DNS records have been set successfully!\n');
      console.log('💡 Next steps:');
      console.log('   1. Wait for DNS propagation (typically 5-60 minutes)');
      console.log('   2. Check SES console: Domain status should change to "Verified"');
      console.log('   3. Verify with: pnpm nx run cdk-emcnotary-instance:admin:ses:status\n');
    } else {
      throw new Error(`SSM command failed with status: ${finalResp.Status}`);
    }

  } catch (error) {
    console.error('\n❌ Error setting SES DNS records:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

setSesDnsViaSsm().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
