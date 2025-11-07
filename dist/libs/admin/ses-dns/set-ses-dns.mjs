#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// libs/admin/ses-dns/src/lib/ses-dns.ts
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { execSync } from "child_process";
async function setSesDnsRecords(config) {
  const region = config.region || process.env["AWS_REGION"] || "us-east-1";
  const profile = config.profile || process.env["AWS_PROFILE"] || "hepe-admin-mfa";
  const domain = config.domain;
  const stackName = config.stackName || `${domain.replace(/\./g, "-")}-mailserver-core`;
  const miabAdminEmail = config.miabAdminEmail || `admin@${domain}`;
  const dryRun = config.dryRun || false;
  log("info", "Setting SES DNS records", {
    domain,
    stackName,
    region,
    profile,
    miabAdminEmail,
    dryRun
  });
  if (dryRun) {
    log("info", "DRY RUN: Would set the following DNS records via MIAB API");
    console.log("\n\u{1F50D} DRY RUN MODE - Previewing what would be executed:\n");
    console.log(`  Domain: ${domain}`);
    console.log(`  Stack: ${stackName}`);
    console.log(`  Region: ${region}`);
    console.log(`  Profile: ${profile}`);
    console.log("\n\u{1F4CB} Would perform the following steps:");
    console.log("  1. Get SES DNS records from CloudFormation stack outputs");
    console.log("  2. Get instance details and SSH key from SSM");
    console.log("  3. Connect to instance via SSH");
    console.log("  4. Set DNS records via Mail-in-a-Box API:");
    console.log("     - 3 DKIM CNAME records");
    console.log("     - 1 Mail-From MX record");
    console.log("     - 1 Mail-From TXT record");
    console.log("\n\u2705 Dry run complete - no AWS calls made, no changes");
    return {
      success: true,
      records: {
        dkim1: { name: "dkim1._domainkey", value: "dkim1.example.com.dkim.amazonses.com", type: "CNAME" },
        dkim2: { name: "dkim2._domainkey", value: "dkim2.example.com.dkim.amazonses.com", type: "CNAME" },
        dkim3: { name: "dkim3._domainkey", value: "dkim3.example.com.dkim.amazonses.com", type: "CNAME" },
        mailFromMx: { name: "mail", value: "10 feedback-smtp.us-east-1.amazonses.com", type: "MX" },
        mailFromTxt: { name: "mail", value: "v=spf1 include:amazonses.com ~all", type: "TXT" }
      }
    };
  }
  const cfClient = new CloudFormationClient({ region });
  const ec2Client = new EC2Client({ region });
  const ssmClient = new SSMClient({ region });
  try {
    const coreStackResp = await cfClient.send(
      new DescribeStacksCommand({
        StackName: stackName
      })
    );
    const coreStack = coreStackResp.Stacks?.[0];
    if (!coreStack?.Outputs) {
      const error = `Could not retrieve core stack outputs for ${stackName}`;
      log("error", error);
      return { success: false, error };
    }
    const outputs = coreStack.Outputs.reduce((acc, output) => {
      acc[output.OutputKey] = output.OutputValue;
      return acc;
    }, {});
    const dkimName1 = outputs["DkimDNSTokenName1"];
    const dkimValue1 = outputs["DkimDNSTokenValue1"];
    const dkimName2 = outputs["DkimDNSTokenName2"];
    const dkimValue2 = outputs["DkimDNSTokenValue2"];
    const dkimName3 = outputs["DkimDNSTokenName3"];
    const dkimValue3 = outputs["DkimDNSTokenValue3"];
    const mailFromDomain = outputs["MailFromDomain"];
    const mailFromMx = outputs["MailFromMXRecord"];
    const mailFromTxt = outputs["MailFromTXTRecord"];
    if (!dkimName1 || !dkimValue1 || !dkimName2 || !dkimValue2 || !dkimName3 || !dkimValue3 || !mailFromDomain || !mailFromMx || !mailFromTxt) {
      const error = "Missing required SES DNS record outputs from core stack";
      log("error", error);
      return { success: false, error };
    }
    const records = {
      dkim1: { name: dkimName1, value: dkimValue1, type: "CNAME" },
      dkim2: { name: dkimName2, value: dkimValue2, type: "CNAME" },
      dkim3: { name: dkimName3, value: dkimValue3, type: "CNAME" },
      mailFromMx: { name: mailFromDomain, value: mailFromMx, type: "MX" },
      mailFromTxt: { name: mailFromDomain, value: mailFromTxt, type: "TXT" }
    };
    log("info", "Retrieved SES DNS records", {
      dkim1: `${dkimName1} -> ${dkimValue1}`,
      dkim2: `${dkimName2} -> ${dkimValue2}`,
      dkim3: `${dkimName3} -> ${dkimValue3}`,
      mailFrom: `${mailFromDomain} MX:${mailFromMx} TXT:${mailFromTxt}`
    });
    if (dryRun) {
      log("info", "DRY RUN: Would set the following DNS records via MIAB API");
      console.log("\nDNS Records to be set:");
      console.log(`  CNAME: ${dkimName1} -> ${dkimValue1}`);
      console.log(`  CNAME: ${dkimName2} -> ${dkimValue2}`);
      console.log(`  CNAME: ${dkimName3} -> ${dkimValue3}`);
      console.log(`  MX: ${mailFromDomain} -> ${mailFromMx}`);
      console.log(`  TXT: ${mailFromDomain} -> ${mailFromTxt}`);
      return { success: true, records };
    }
    const instanceStackName = stackName.replace("-core", "-instance");
    const instanceStackResp = await cfClient.send(
      new DescribeStacksCommand({
        StackName: instanceStackName
      })
    );
    const instanceStack = instanceStackResp.Stacks?.[0];
    if (!instanceStack?.Outputs) {
      const error = `Could not retrieve instance stack outputs for ${instanceStackName}`;
      log("error", error);
      return { success: false, error };
    }
    const instanceOutputs = instanceStack.Outputs.reduce((acc, output) => {
      acc[output.OutputKey] = output.OutputValue;
      return acc;
    }, {});
    const instanceId = instanceOutputs["RestorePrefix"];
    const instanceIp = instanceOutputs["PublicIp"] || instanceOutputs["ElasticIPAddress"];
    if (!instanceId) {
      const error = "Could not find instance ID in instance stack outputs";
      log("error", error);
      return { success: false, error };
    }
    let finalInstanceIp = instanceIp;
    if (!finalInstanceIp) {
      const instanceResp2 = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId]
        })
      );
      const instance2 = instanceResp2.Reservations?.[0]?.Instances?.[0];
      finalInstanceIp = instance2?.PublicIpAddress ?? void 0;
    }
    if (!finalInstanceIp) {
      const error = "Could not determine instance public IP";
      log("error", error);
      return { success: false, error };
    }
    const instanceIpString = finalInstanceIp;
    const instanceResp = await ec2Client.send(
      new DescribeInstancesCommand({
        InstanceIds: [instanceId]
      })
    );
    const instance = instanceResp.Reservations?.[0]?.Instances?.[0];
    const keyName = instance?.KeyName;
    if (!keyName) {
      const error = "Could not determine instance key pair name";
      log("error", error);
      return { success: false, error };
    }
    const keyPairId = instanceOutputs["KeyPairId"];
    if (!keyPairId) {
      const error = "Could not retrieve KeyPairId from instance stack outputs";
      log("error", error);
      return { success: false, error };
    }
    const adminPasswordParam = await ssmClient.send(
      new GetParameterCommand({
        Name: `/MailInABoxAdminPassword-${instanceStackName}`,
        WithDecryption: true
      })
    );
    const adminPassword = adminPasswordParam.Parameter?.Value;
    if (!adminPassword) {
      const error = "Could not retrieve Mail-in-a-Box admin password from SSM";
      log("error", error);
      return { success: false, error };
    }
    const privateKeyParam = await ssmClient.send(
      new GetParameterCommand({
        Name: `/ec2/keypair/${keyPairId}`,
        WithDecryption: true
      })
    );
    const privateKey = privateKeyParam.Parameter?.Value;
    if (!privateKey) {
      const error = "Could not retrieve private key from SSM";
      log("error", error);
      return { success: false, error };
    }
    const tempKeyFile = `/tmp/ssh-key-${Date.now()}.pem`;
    execSync(`echo "${privateKey}" > "${tempKeyFile}"`, { stdio: "inherit" });
    execSync(`chmod 400 "${tempKeyFile}"`, { stdio: "inherit" });
    const normalizeDnsName = (name) => {
      const suffix = `.${domain}`;
      return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
    };
    const normalizedDkimName1 = normalizeDnsName(dkimName1);
    const normalizedDkimName2 = normalizeDnsName(dkimName2);
    const normalizedDkimName3 = normalizeDnsName(dkimName3);
    const normalizedMailFromDomain = normalizeDnsName(mailFromDomain);
    const mailFromMxValue = mailFromMx.split(/\s+/).slice(1).join(" ") || mailFromMx;
    try {
      const scriptContent = `
#!/bin/bash
set -e

# Mail-in-a-Box API endpoint
MIAB_HOST="https://box.${domain}"
ADMIN_EMAIL="${miabAdminEmail}"
ADMIN_PASSWORD="${adminPassword}"

# Function to make API call
set_dns_record() {
    local type=$1
    local name=$2
    local value=$3
    local method=$4  # PUT or POST

    echo "Setting $type record: $name -> $value"

    # Make the API call
    response=$(curl -s -w "%{http_code}" -o /tmp/curl_response \\
         -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" \\
         -X "\${method}" \\
         -d "value=$value" \\
         -H "Content-Type: application/x-www-form-urlencoded" \\
         "\${MIAB_HOST}/admin/dns/custom/\${name}/\${type}")

    http_code=\${response##* }
    response_body=$(cat /tmp/curl_response)
    rm -f /tmp/curl_response

    if [ "$http_code" != "200" ]; then
        echo "Error: Failed to set $type record for $name (HTTP $http_code)"
        echo "Response: $response_body"
        exit 1
    fi

    echo "Successfully set $type record for $name"
}

# First, delete any existing records for these domains
echo "Cleaning up existing records..."
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${normalizedDkimName1}/CNAME" || true
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${normalizedDkimName2}/CNAME" || true
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${normalizedDkimName3}/CNAME" || true
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${normalizedMailFromDomain}/MX" || true
curl -s -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X DELETE "\${MIAB_HOST}/admin/dns/custom/${normalizedMailFromDomain}/TXT" || true

# Set DKIM CNAME records using PUT (single value)
set_dns_record "CNAME" "${normalizedDkimName1}" "${dkimValue1}" "PUT"
set_dns_record "CNAME" "${normalizedDkimName2}" "${dkimValue2}" "PUT"
set_dns_record "CNAME" "${normalizedDkimName3}" "${dkimValue3}" "PUT"

# Set MAIL FROM MX record (priority already stripped)
set_dns_record "MX" "${normalizedMailFromDomain}" "${mailFromMxValue}" "PUT"

# Set MAIL FROM TXT record using POST to preserve any existing SPF records
set_dns_record "TXT" "${normalizedMailFromDomain}" "${mailFromTxt}" "POST"

echo "DNS records set successfully!"
`.trim();
      const scriptFile = `/tmp/set-dns-records-${Date.now()}.sh`;
      execSync(`echo "${scriptContent}" > "${scriptFile}"`, { stdio: "inherit" });
      execSync(`chmod +x "${scriptFile}"`, { stdio: "inherit" });
      log("info", "Copying DNS setup script to instance", { instanceIp: instanceIpString });
      execSync(`scp -i "${tempKeyFile}" -o StrictHostKeyChecking=no "${scriptFile}" "ubuntu@${instanceIpString}:~/set-dns-records.sh"`, {
        stdio: "inherit"
      });
      log("info", "Executing DNS setup script on instance");
      execSync(`ssh -i "${tempKeyFile}" -o StrictHostKeyChecking=no "ubuntu@${instanceIpString}" "~/set-dns-records.sh"`, {
        stdio: "inherit"
      });
      execSync(`rm -f "${tempKeyFile}" "${scriptFile}"`, { stdio: "inherit" });
      log("info", "SES DNS records set successfully via Mail-in-a-Box API");
      return { success: true, records };
    } catch (error) {
      execSync(`rm -f "${tempKeyFile}"`, { stdio: "inherit" });
      throw error;
    }
  } catch (error) {
    const err = `SES DNS setup failed: ${String(error)}`;
    log("error", err, { error });
    return { success: false, error: err };
  }
}
var log;
var init_ses_dns = __esm({
  "libs/admin/ses-dns/src/lib/ses-dns.ts"() {
    "use strict";
    log = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
  }
});

// libs/admin/ses-dns/src/index.ts
var init_src = __esm({
  "libs/admin/ses-dns/src/index.ts"() {
    "use strict";
    init_ses_dns();
  }
});

// libs/admin/ses-dns/bin/set-ses-dns.ts
var require_set_ses_dns = __commonJS({
  "libs/admin/ses-dns/bin/set-ses-dns.ts"() {
    init_src();
    async function main() {
      const args = process.argv.slice(2);
      const domainIndex = args.indexOf("--domain");
      const dryRunIndex = args.indexOf("--dry-run");
      if (domainIndex === -1 || domainIndex + 1 >= args.length) {
        console.error("Usage: set-ses-dns --domain <domain> [--dry-run]");
        console.error("Example: set-ses-dns --domain emcnotary.com --dry-run");
        process.exit(1);
      }
      const domain = args[domainIndex + 1];
      const dryRun = dryRunIndex !== -1;
      console.log(`Setting SES DNS records for domain: ${domain}`);
      if (dryRun) {
        console.log("DRY RUN MODE - No changes will be made");
      }
      console.log("----------------------------------------");
      const result = await setSesDnsRecords({
        domain,
        region: process.env["AWS_REGION"] || "us-east-1",
        profile: process.env["AWS_PROFILE"] || "hepe-admin-mfa",
        dryRun
      });
      if (result.success) {
        if (dryRun) {
          console.log("\u2705 DRY RUN: DNS records would be set successfully!");
          console.log("\nRecords that would be configured:");
          if (result.records) {
            console.log(`  ${result.records.dkim1.type}: ${result.records.dkim1.name} -> ${result.records.dkim1.value}`);
            console.log(`  ${result.records.dkim2.type}: ${result.records.dkim2.name} -> ${result.records.dkim2.value}`);
            console.log(`  ${result.records.dkim3.type}: ${result.records.dkim3.name} -> ${result.records.dkim3.value}`);
            console.log(`  ${result.records.mailFromMx.type}: ${result.records.mailFromMx.name} -> ${result.records.mailFromMx.value}`);
            console.log(`  ${result.records.mailFromTxt.type}: ${result.records.mailFromTxt.name} -> ${result.records.mailFromTxt.value}`);
          }
        } else {
          console.log("\u2705 SES DNS records have been set successfully!");
          console.log("Please allow time for DNS propagation and verify the SES identity status in the AWS SES Console.");
          console.log("You can check DNS records using:");
          if (result.records) {
            console.log(`  dig ${result.records.dkim1.name} CNAME`);
            console.log(`  dig ${result.records.mailFromMx.name} MX`);
            console.log(`  dig ${result.records.mailFromTxt.name} TXT`);
          }
        }
      } else {
        console.error("\u274C SES DNS setup failed:", result.error);
        process.exit(1);
      }
    }
    main().catch((error) => {
      console.error("Unexpected error:", error);
      process.exit(1);
    });
  }
});
export default require_set_ses_dns();
