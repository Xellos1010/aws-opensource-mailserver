import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { resolveStackName, resolveDomain } from '@mm/admin-stack-info';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

export type SetSesDnsRecordsConfig = {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  stackName?: string; // Auto-generated if not provided
  miabAdminEmail?: string; // Defaults to admin@{domain}
  dryRun?: boolean;
};

export type SesDnsResult = {
  success: boolean;
  records?: {
    dkim1: { name: string; value: string; type: 'CNAME' };
    dkim2: { name: string; value: string; type: 'CNAME' };
    dkim3: { name: string; value: string; type: 'CNAME' };
    mailFromMx: { name: string; value: string; type: 'MX' };
    mailFromTxt: { name: string; value: string; type: 'TXT' };
  };
  error?: string;
};

/**
 * Sets SES DNS records via Mail-in-a-Box admin API
 * Ports logic from archive/administration/set-ses-dns-records.sh
 */
export async function setSesDnsRecords(
  config: SetSesDnsRecordsConfig
): Promise<SesDnsResult> {
  const region = config.region || process.env['AWS_REGION'] || 'us-east-1';
  const profile = config.profile || process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
  const domain = config.domain;
  const appPath = config.appPath || process.env['APP_PATH'];
  
  if (!config.stackName && !domain && !appPath) {
    const error = 'Cannot resolve stack name. Provide stackName, domain, or appPath';
    log('error', error);
    return { success: false, error };
  }
  
  const stackName = config.stackName || resolveStackName(domain, appPath, undefined, 'core');
  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  
  if (!resolvedDomain) {
    const error = 'Cannot resolve domain. Provide domain or appPath';
    log('error', error, { domain, appPath, stackName });
    return { success: false, error };
  }
  
  log('info', 'Resolved domain and stack', { 
    resolvedDomain, 
    stackName, 
    providedDomain: domain,
    appPath 
  });
  
  const miabAdminEmail = config.miabAdminEmail || `admin@${resolvedDomain}`;
  const dryRun = config.dryRun || false;

  log('info', 'Setting SES DNS records', {
    domain,
    stackName,
    region,
    profile,
    miabAdminEmail,
    dryRun,
  });

  // Early dry-run check - skip AWS calls if dry-run
  if (dryRun) {
    log('info', 'DRY RUN: Would set the following DNS records via MIAB API');
    console.log('\n🔍 DRY RUN MODE - Previewing what would be executed:\n');
    console.log(`  Domain: ${domain}`);
    console.log(`  Stack: ${stackName}`);
    console.log(`  Region: ${region}`);
    console.log(`  Profile: ${profile}`);
    console.log('\n📋 Would perform the following steps:');
    console.log('  1. Get SES DNS records from CloudFormation stack outputs');
    console.log('  2. Get instance details and SSH key from SSM');
    console.log('  3. Connect to instance via SSH');
    console.log('  4. Set DNS records via Mail-in-a-Box API:');
    console.log('     - 3 DKIM CNAME records');
    console.log('     - 1 Mail-From MX record');
    console.log('     - 1 Mail-From TXT record');
    console.log('\n✅ Dry run complete - no AWS calls made, no changes');
    return {
      success: true,
      records: {
        dkim1: { name: 'dkim1._domainkey', value: 'dkim1.example.com.dkim.amazonses.com', type: 'CNAME' as const },
        dkim2: { name: 'dkim2._domainkey', value: 'dkim2.example.com.dkim.amazonses.com', type: 'CNAME' as const },
        dkim3: { name: 'dkim3._domainkey', value: 'dkim3.example.com.dkim.amazonses.com', type: 'CNAME' as const },
        mailFromMx: { name: 'mail', value: '10 feedback-smtp.us-east-1.amazonses.com', type: 'MX' as const },
        mailFromTxt: { name: 'mail', value: 'v=spf1 include:amazonses.com ~all', type: 'TXT' as const },
      },
    };
  }

  // Create AWS clients with credentials
  const credentials = fromIni({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });
  const ec2Client = new EC2Client({ region, credentials });
  const ssmClient = new SSMClient({ region, credentials });
  
  log('info', 'Created AWS clients', { region, profile });

  try {
    // Get core stack outputs for SES DNS records
    log('info', 'Retrieving core stack outputs', { stackName });
    const coreStackResp = await cfClient.send(
      new DescribeStacksCommand({
        StackName: stackName,
      })
    );

    const coreStack = coreStackResp.Stacks?.[0];
    if (!coreStack?.Outputs) {
      const error = `Could not retrieve core stack outputs for ${stackName}`;
      log('error', error, { stackName, stackExists: !!coreStack });
      return { success: false, error };
    }
    
    log('info', 'Retrieved core stack outputs', { 
      stackName, 
      outputCount: coreStack.Outputs.length 
    });

    // Extract SES DNS records from core stack outputs
    const outputs = coreStack.Outputs.reduce((acc, output) => {
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
      const missing = [];
      if (!dkimName1) missing.push('DkimDNSTokenName1');
      if (!dkimValue1) missing.push('DkimDNSTokenValue1');
      if (!dkimName2) missing.push('DkimDNSTokenName2');
      if (!dkimValue2) missing.push('DkimDNSTokenValue2');
      if (!dkimName3) missing.push('DkimDNSTokenName3');
      if (!dkimValue3) missing.push('DkimDNSTokenValue3');
      if (!mailFromDomain) missing.push('MailFromDomain');
      if (!mailFromMx) missing.push('MailFromMXRecord');
      if (!mailFromTxt) missing.push('MailFromTXTRecord');
      const error = `Missing required SES DNS record outputs from core stack: ${missing.join(', ')}`;
      log('error', error, { missing, availableOutputs: Object.keys(outputs) });
      return { success: false, error };
    }

    const records = {
      dkim1: { name: dkimName1, value: dkimValue1, type: 'CNAME' as const },
      dkim2: { name: dkimName2, value: dkimValue2, type: 'CNAME' as const },
      dkim3: { name: dkimName3, value: dkimValue3, type: 'CNAME' as const },
      mailFromMx: { name: mailFromDomain, value: mailFromMx, type: 'MX' as const },
      mailFromTxt: { name: mailFromDomain, value: mailFromTxt, type: 'TXT' as const },
    };

    log('info', 'Retrieved SES DNS records', {
      dkim1: `${dkimName1} -> ${dkimValue1}`,
      dkim2: `${dkimName2} -> ${dkimValue2}`,
      dkim3: `${dkimName3} -> ${dkimValue3}`,
      mailFrom: `${mailFromDomain} MX:${mailFromMx} TXT:${mailFromTxt}`,
    });

    if (dryRun) {
      log('info', 'DRY RUN: Would set the following DNS records via MIAB API');
      console.log('\nDNS Records to be set:');
      console.log(`  CNAME: ${dkimName1} -> ${dkimValue1}`);
      console.log(`  CNAME: ${dkimName2} -> ${dkimValue2}`);
      console.log(`  CNAME: ${dkimName3} -> ${dkimValue3}`);
      console.log(`  MX: ${mailFromDomain} -> ${mailFromMx}`);
      console.log(`  TXT: ${mailFromDomain} -> ${mailFromTxt}`);
      return { success: true, records };
    }

    // Get instance stack outputs for instance details
    const instanceStackName = stackName.replace('-core', '-instance');
    log('info', 'Retrieving instance stack outputs', { instanceStackName });
    const instanceStackResp = await cfClient.send(
      new DescribeStacksCommand({
        StackName: instanceStackName,
      })
    );

    const instanceStack = instanceStackResp.Stacks?.[0];
    if (!instanceStack?.Outputs) {
      const error = `Could not retrieve instance stack outputs for ${instanceStackName}`;
      log('error', error, { instanceStackName, stackExists: !!instanceStack });
      return { success: false, error };
    }
    
    log('info', 'Retrieved instance stack outputs', { 
      instanceStackName, 
      outputCount: instanceStack.Outputs.length 
    });

    const instanceOutputs = instanceStack.Outputs.reduce((acc, output) => {
      acc[output.OutputKey!] = output.OutputValue!;
      return acc;
    }, {} as Record<string, string>);

    const instanceId =
      instanceOutputs['InstanceId'] ||
      instanceOutputs['RestorePrefixValue'] || // current CDK output key
      instanceOutputs['RestorePrefix']; // legacy output key

    const instanceIp =
      instanceOutputs['InstancePublicIp'] || // current CDK output key
      instanceOutputs['PublicIp'] || // legacy output key
      instanceOutputs['ElasticIPAddress'] || // legacy output key
      outputs['ElasticIPAddress']; // core stack output (EIP) as a fallback

    if (!instanceId) {
      const error = 'Could not find instance ID in instance stack outputs';
      log('error', error);
      return { success: false, error };
    }

    // Get instance IP if not in outputs
    let finalInstanceIp: string | undefined = instanceIp;
    if (!finalInstanceIp) {
      const instanceResp = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        })
      );

      const instance = instanceResp.Reservations?.[0]?.Instances?.[0];
      finalInstanceIp = instance?.PublicIpAddress ?? undefined;
    }

    if (!finalInstanceIp) {
      const error = 'Could not determine instance public IP';
      log('error', error);
      return { success: false, error };
    }

    // TypeScript now knows finalInstanceIp is string after the check above
    const instanceIpString = finalInstanceIp;

    // Get instance key pair name
    const instanceResp = await ec2Client.send(
      new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      })
    );

    const instance = instanceResp.Reservations?.[0]?.Instances?.[0];
    const keyName = instance?.KeyName;

    if (!keyName) {
      const error = 'Could not determine instance key pair name';
      log('error', error);
      return { success: false, error };
    }

    // Get KeyPairId from instance stack outputs
    const keyPairId = instanceOutputs['KeyPairId'];

    if (!keyPairId) {
      const error = 'Could not retrieve KeyPairId from instance stack outputs';
      log('error', error);
      return { success: false, error };
    }

    // Get admin password from SSM
    const adminPasswordParam = await ssmClient.send(
      new GetParameterCommand({
        Name: `/MailInABoxAdminPassword-${instanceStackName}`,
        WithDecryption: true,
      })
    );

    const adminPassword = adminPasswordParam.Parameter?.Value;
    if (!adminPassword) {
      const error = 'Could not retrieve Mail-in-a-Box admin password from SSM';
      log('error', error, { 
        ssmParamName: `/MailInABoxAdminPassword-${instanceStackName}`,
        paramExists: !!adminPasswordParam.Parameter 
      });
      return { success: false, error };
    }
    
    log('info', 'Retrieved admin password from SSM', { 
      ssmParamName: `/MailInABoxAdminPassword-${instanceStackName}`,
      passwordLength: adminPassword.length 
    });

    // Get private key from SSM
    log('info', 'Retrieving private key from SSM', { keyPairId });
    const privateKeyParam = await ssmClient.send(
      new GetParameterCommand({
        Name: `/ec2/keypair/${keyPairId}`,
        WithDecryption: true,
      })
    );

    const privateKey = privateKeyParam.Parameter?.Value;
    if (!privateKey) {
      const error = 'Could not retrieve private key from SSM';
      log('error', error, { 
        ssmParamName: `/ec2/keypair/${keyPairId}`,
        keyPairId,
        paramExists: !!privateKeyParam.Parameter 
      });
      return { success: false, error };
    }
    
    log('info', 'Retrieved private key from SSM', { 
      ssmParamName: `/ec2/keypair/${keyPairId}`,
      keyLength: privateKey.length 
    });

    // Write private key to temp file
    const tempKeyFile = `/tmp/ssh-key-${Date.now()}.pem`;
    let scriptFile: string | undefined;
    
    try {
      execSync(`echo "${privateKey}" > "${tempKeyFile}"`, { stdio: 'inherit' });
      execSync(`chmod 400 "${tempKeyFile}"`, { stdio: 'inherit' });

      // Mail-in-a-Box API requires full FQDN for qname
      // The domain must already be managed by Mail-in-a-Box (added via mail users)
      // Use the full FQDN as-is from the stack outputs
      log('info', 'Using full FQDN for DNS qnames', { 
        domain: resolvedDomain,
        dkimName1: dkimName1,
        mailFromDomain: mailFromDomain 
      });

      const normalizedDkimName1 = dkimName1;
      const normalizedDkimName2 = dkimName2;
      const normalizedDkimName3 = dkimName3;
      const normalizedMailFromDomain = mailFromDomain;

      // Strip priority from MX record (format: "10 mail.example.com" -> "mail.example.com")
      const mailFromMxValue = mailFromMx.split(/\s+/).slice(1).join(' ') || mailFromMx;
      
      // Ensure CNAME values end with a period (fully qualified domain name per MIAB docs)
      // Per MIAB docs: "CNAME (an alias, which is a fully qualified domain name — don't forget the final period)"
      const ensureCnameFormat = (value: string): string => {
        return value.endsWith('.') ? value : `${value}.`;
      };
      
      const dkimValue1Formatted = ensureCnameFormat(dkimValue1);
      const dkimValue2Formatted = ensureCnameFormat(dkimValue2);
      const dkimValue3Formatted = ensureCnameFormat(dkimValue3);
      
      log('info', 'Formatted CNAME values with trailing periods', {
        dkim1Before: dkimValue1,
        dkim1After: dkimValue1Formatted,
        dkim2Before: dkimValue2,
        dkim2After: dkimValue2Formatted,
        dkim3Before: dkimValue3,
        dkim3After: dkimValue3Formatted
      });
      // Create script to set DNS records via MIAB API
      // Use resolvedDomain instead of domain to ensure it's not undefined
      // Per MIAB docs: CNAME values must be fully qualified domain names ending with a period
      const scriptContent = `
#!/bin/bash
set -e

# Mail-in-a-Box API endpoint
MIAB_HOST="https://box.${resolvedDomain}"
ADMIN_EMAIL="${miabAdminEmail}"
ADMIN_PASSWORD="${adminPassword}"

# CNAME values (already formatted with trailing periods)
DKIM_VALUE1="${dkimValue1Formatted}"
DKIM_VALUE2="${dkimValue2Formatted}"
DKIM_VALUE3="${dkimValue3Formatted}"

# Function to make API call
set_dns_record() {
    local type=\$1
    local name=\$2
    local value=\$3
    local method=\$4  # PUT or POST

    echo "Setting \$type record: \$name -> \$value"

    # Make the API call (use -k to skip SSL verification for self-signed certs)
    response=\$(curl -k -s -w "%{http_code}" -o /tmp/curl_response \\
         -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" \\
         -X "\${method}" \\
         -d "value=\$value" \\
         -H "Content-Type: application/x-www-form-urlencoded" \\
         "\${MIAB_HOST}/admin/dns/custom/\${name}/\${type}" 2>&1)

    http_code=\${response##* }
    response_body=\$(cat /tmp/curl_response)
    rm -f /tmp/curl_response

    if [ "\$http_code" != "200" ]; then
        echo "Error: Failed to set \$type record for \$name (HTTP \$http_code)"
        echo "Response: \$response_body"
        exit 1
    fi

    echo "Successfully set \$type record for \$name"
}

# First, delete any existing records for these domains
echo "Cleaning up existing records..."
curl -k -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${normalizedDkimName1}/CNAME" || true
curl -k -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${normalizedDkimName2}/CNAME" || true
curl -k -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${normalizedDkimName3}/CNAME" || true
curl -k -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${normalizedMailFromDomain}/MX" || true
curl -k -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${normalizedMailFromDomain}/TXT" || true

# Set DKIM CNAME records using PUT (single value)
# CNAME values must end with a period per MIAB documentation
set_dns_record "CNAME" "${normalizedDkimName1}" "\${DKIM_VALUE1}" "PUT"
set_dns_record "CNAME" "${normalizedDkimName2}" "\${DKIM_VALUE2}" "PUT"
set_dns_record "CNAME" "${normalizedDkimName3}" "\${DKIM_VALUE3}" "PUT"

# Set MAIL FROM MX record (priority already stripped)
set_dns_record "MX" "${normalizedMailFromDomain}" "${mailFromMxValue}" "PUT"

# Set MAIL FROM TXT record using POST to preserve any existing SPF records
set_dns_record "TXT" "${normalizedMailFromDomain}" "${mailFromTxt}" "POST"

echo "DNS records set successfully!"
`.trim();

      // Write script to temp file using writeFileSync to avoid shell escaping issues
      scriptFile = `/tmp/set-dns-records-${Date.now()}.sh`;
      writeFileSync(scriptFile, scriptContent, { mode: 0o755 });
      log('info', 'DNS setup script written to temp file', { scriptFile });

      // Copy script to instance
      log('info', 'Copying DNS setup script to instance', { 
        instanceIp: instanceIpString,
        scriptFile 
      });
      try {
        execSync(`scp -i "${tempKeyFile}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${scriptFile}" "ubuntu@${instanceIpString}:~/set-dns-records.sh"`, {
          stdio: 'inherit',
          timeout: 30000 // 30 second timeout
        });
        log('info', 'DNS setup script copied successfully');
      } catch (scpError) {
        const error = `Failed to copy DNS setup script to instance: ${scpError instanceof Error ? scpError.message : String(scpError)}`;
        log('error', error, { instanceIp: instanceIpString, scpError });
        throw new Error(error);
      }

      // Execute DNS setup script
      log('info', 'Executing DNS setup script on instance', { instanceIp: instanceIpString });
      try {
        execSync(`ssh -i "${tempKeyFile}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${instanceIpString}" "~/set-dns-records.sh"`, {
          stdio: 'inherit',
          timeout: 60000 // 60 second timeout
        });
        log('info', 'DNS setup script executed successfully');
      } catch (sshError) {
        const error = `Failed to execute DNS setup script on instance: ${sshError instanceof Error ? sshError.message : String(sshError)}`;
        log('error', error, { instanceIp: instanceIpString, sshError });
        throw new Error(error);
      }

      // Clean up temp files
      execSync(`rm -f "${tempKeyFile}" "${scriptFile}"`, { stdio: 'inherit' });

      log('info', 'SES DNS records set successfully via Mail-in-a-Box API', {
        records: {
          dkim1: `${normalizedDkimName1} -> ${dkimValue1Formatted}`,
          dkim2: `${normalizedDkimName2} -> ${dkimValue2Formatted}`,
          dkim3: `${normalizedDkimName3} -> ${dkimValue3Formatted}`,
          mailFromMx: `${normalizedMailFromDomain} -> ${mailFromMxValue}`,
          mailFromTxt: `${normalizedMailFromDomain} -> ${mailFromTxt}`,
        }
      });
      return { 
        success: true, 
        records: {
          dkim1: { name: normalizedDkimName1, value: dkimValue1Formatted, type: 'CNAME' as const },
          dkim2: { name: normalizedDkimName2, value: dkimValue2Formatted, type: 'CNAME' as const },
          dkim3: { name: normalizedDkimName3, value: dkimValue3Formatted, type: 'CNAME' as const },
          mailFromMx: { name: normalizedMailFromDomain, value: mailFromMxValue, type: 'MX' as const },
          mailFromTxt: { name: normalizedMailFromDomain, value: mailFromTxt, type: 'TXT' as const },
        }
      };

    } catch (error) {
      // Clean up temp files on error
      try {
        execSync(`rm -f "${tempKeyFile}"`, { stdio: 'inherit' });
        if (scriptFile) {
          execSync(`rm -f "${scriptFile}"`, { stdio: 'inherit' });
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      log('error', 'Failed to set DNS records via SSH', { error: errorMsg });
      throw error;
    }

  } catch (error) {
    const err = `SES DNS setup failed: ${String(error)}`;
    log('error', err, { error });
    return { success: false, error: err };
  }
}