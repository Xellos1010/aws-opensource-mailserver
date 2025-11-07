import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync } from 'fs';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

export type SetSesDnsRecordsConfig = {
  domain: string;
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
  const stackName = config.stackName || `${domain.replace(/\./g, '-')}-mailserver-core`;
  const miabAdminEmail = config.miabAdminEmail || `admin@${domain}`;
  const dryRun = config.dryRun || false;

  log('info', 'Setting SES DNS records', {
    domain,
    stackName,
    region,
    profile,
    miabAdminEmail,
    dryRun,
  });

  const cfClient = new CloudFormationClient({ region });
  const ec2Client = new EC2Client({ region });
  const ssmClient = new SSMClient({ region });

  try {
    // Get core stack outputs for SES DNS records
    const coreStackResp = await cfClient.send(
      new DescribeStacksCommand({
        StackName: stackName,
      })
    );

    const coreStack = coreStackResp.Stacks?.[0];
    if (!coreStack?.Outputs) {
      const error = `Could not retrieve core stack outputs for ${stackName}`;
      log('error', error);
      return { success: false, error };
    }

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
      const error = 'Missing required SES DNS record outputs from core stack';
      log('error', error);
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
    const instanceStackResp = await cfClient.send(
      new DescribeStacksCommand({
        StackName: instanceStackName,
      })
    );

    const instanceStack = instanceStackResp.Stacks?.[0];
    if (!instanceStack?.Outputs) {
      const error = `Could not retrieve instance stack outputs for ${instanceStackName}`;
      log('error', error);
      return { success: false, error };
    }

    const instanceOutputs = instanceStack.Outputs.reduce((acc, output) => {
      acc[output.OutputKey!] = output.OutputValue!;
      return acc;
    }, {} as Record<string, string>);

    const instanceId = instanceOutputs['RestorePrefix']; // This is actually the instance ID
    const instanceIp = instanceOutputs['PublicIp'] || instanceOutputs['ElasticIPAddress'];

    if (!instanceId) {
      const error = 'Could not find instance ID in instance stack outputs';
      log('error', error);
      return { success: false, error };
    }

    // Get instance IP if not in outputs
    let finalInstanceIp = instanceIp;
    if (!finalInstanceIp) {
      const instanceResp = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        })
      );

      const instance = instanceResp.Reservations?.[0]?.Instances?.[0];
      finalInstanceIp = instance?.PublicIpAddress;
    }

    if (!finalInstanceIp) {
      const error = 'Could not determine instance public IP';
      log('error', error);
      return { success: false, error };
    }

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
      log('error', error);
      return { success: false, error };
    }

    // Get private key from SSM
    const privateKeyParam = await ssmClient.send(
      new GetParameterCommand({
        Name: `/ec2/keypair/${keyPairId}`,
        WithDecryption: true,
      })
    );

    const privateKey = privateKeyParam.Parameter?.Value;
    if (!privateKey) {
      const error = 'Could not retrieve private key from SSM';
      log('error', error);
      return { success: false, error };
    }

    // Write private key to temp file
    const tempKeyFile = `/tmp/ssh-key-${Date.now()}.pem`;
    execSync(`echo "${privateKey}" > "${tempKeyFile}"`, { stdio: 'inherit' });
    execSync(`chmod 400 "${tempKeyFile}"`, { stdio: 'inherit' });

    try {
      // Create script to set DNS records via MIAB API
      const scriptContent = `
#!/bin/bash
set -e

# Mail-in-a-Box API endpoint
MIAB_HOST="https://box.${domain}"
ADMIN_EMAIL="${miabAdminEmail}"
ADMIN_PASSWORD="${adminPassword}"

# Function to make API call
set_dns_record() {
    local type=\$1
    local name=\$2
    local value=\$3
    local method=\$4  # PUT or POST

    # Normalize qname by removing trailing domain if present
    local normalized_name=\${name%.$domain}

    echo "Setting \$type record: \$name -> \$value"

    # Make the API call
    response=\$(curl -s -w "%{http_code}" -o /tmp/curl_response \\
         -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" \\
         -X "\${method}" \\
         -d "value=\$value" \\
         -H "Content-Type: application/x-www-form-urlencoded" \\
         "\${MIAB_HOST}/admin/dns/custom/\${normalized_name}/\${type}")

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
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${dkimName1%.$domain}/CNAME" || true
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${dkimName2%.$domain}/CNAME" || true
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${dkimName3%.$domain}/CNAME" || true
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${mailFromDomain%.$domain}/MX" || true
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${mailFromDomain%.$domain}/TXT" || true

# Set DKIM CNAME records using PUT (single value)
set_dns_record "CNAME" "${dkimName1}" "${dkimValue1}" "PUT"
set_dns_record "CNAME" "${dkimName2}" "${dkimValue2}" "PUT"
set_dns_record "CNAME" "${dkimName3}" "${dkimValue3}" "PUT"

# Set MAIL FROM MX record (strip priority for Mail-in-a-Box API)
set_dns_record "MX" "${mailFromDomain}" "${mailFromMx##* }" "PUT"

# Set MAIL FROM TXT record using POST to preserve any existing SPF records
set_dns_record "TXT" "${mailFromDomain}" "${mailFromTxt}" "POST"

echo "DNS records set successfully!"
`.trim();

      // Write script to temp file
      const scriptFile = `/tmp/set-dns-records-${Date.now()}.sh`;
      execSync(`echo "${scriptContent}" > "${scriptFile}"`, { stdio: 'inherit' });
      execSync(`chmod +x "${scriptFile}"`, { stdio: 'inherit' });

      // Copy script to instance
      log('info', 'Copying DNS setup script to instance', { instanceIp: finalInstanceIp });
      execSync(`scp -i "${tempKeyFile}" -o StrictHostKeyChecking=no "${scriptFile}" "ubuntu@${finalInstanceIp}:~/set-dns-records.sh"`, {
        stdio: 'inherit'
      });

      // Execute DNS setup script
      log('info', 'Executing DNS setup script on instance');
      execSync(`ssh -i "${tempKeyFile}" -o StrictHostKeyChecking=no "ubuntu@${finalInstanceIp}" "~/set-dns-records.sh"`, {
        stdio: 'inherit'
      });

      // Clean up temp files
      execSync(`rm -f "${tempKeyFile}" "${scriptFile}"`, { stdio: 'inherit' });

      log('info', 'SES DNS records set successfully via Mail-in-a-Box API');
      return { success: true, records };

    } catch (error) {
      // Clean up temp files on error
      execSync(`rm -f "${tempKeyFile}"`, { stdio: 'inherit' });
      throw error;
    }

  } catch (error) {
    const err = `SES DNS setup failed: ${String(error)}`;
    log('error', err, { error });
    return { success: false, error: err };
  }
}