import { EC2Client, DescribeAddressesCommand, ModifyAddressAttributeCommand } from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';
import { getStackInfo, getStackInfoFromApp } from '@mm/admin-stack-info';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

export type SetReverseDnsConfig = {
  appPath?: string;
  stackName?: string;
  domain?: string;
  region?: string;
  profile?: string;
  ptrRecord?: string; // Defaults to box.{domain}
};

export type ReverseDnsResult = {
  success: boolean;
  elasticIp?: string;
  allocationId?: string;
  ptrRecord?: string;
  error?: string;
};

/**
 * Sets reverse DNS (PTR record) for Elastic IP address
 */
export async function setReverseDns(
  config: SetReverseDnsConfig
): Promise<ReverseDnsResult> {
  const region = config.region || process.env['AWS_REGION'] || 'us-east-1';
  const profile = config.profile || process.env['AWS_PROFILE'] || 'hepe-admin-mfa';

  const credentials = fromIni({ profile });
  const ec2Client = new EC2Client({ region, credentials });

  // Get stack info to find domain and Elastic IP
  let stackInfo;
  if (config.appPath) {
    stackInfo = await getStackInfoFromApp(config.appPath, {
      region,
      profile,
    });
  } else {
    stackInfo = await getStackInfo({
      stackName: config.stackName,
      domain: config.domain,
      region,
      profile,
    });
  }

  const domain = stackInfo.domain;
  const ptrRecord = config.ptrRecord || `box.${domain}`;

  log('info', 'Setting reverse DNS', {
    domain,
    ptrRecord,
    stackName: stackInfo.stackName,
  });

  // Find Elastic IP by domain tag
  try {
    const addressesResp = await ec2Client.send(
      new DescribeAddressesCommand({
        Filters: [
          {
            Name: 'tag:MAILSERVER',
            Values: [domain],
          },
        ],
      })
    );

    const addresses = addressesResp.Addresses || [];
    if (addresses.length === 0) {
      const error = `Could not find Elastic IP address for domain ${domain}`;
      log('error', error);
      return { success: false, error };
    }

    const address = addresses[0];
    const elasticIp = address.PublicIp;
    const allocationId = address.AllocationId;

    if (!elasticIp || !allocationId) {
      const error = 'Elastic IP found but missing PublicIp or AllocationId';
      log('error', error);
      return { success: false, error };
    }

    log('info', 'Found Elastic IP', {
      elasticIp,
      allocationId,
    });

    // Set reverse DNS
    try {
      await ec2Client.send(
        new ModifyAddressAttributeCommand({
          AllocationId: allocationId,
          DomainName: ptrRecord,
        })
      );

      log('info', 'Reverse DNS set successfully', {
        elasticIp,
        ptrRecord,
      });

      return {
        success: true,
        elasticIp,
        allocationId,
        ptrRecord,
      };
    } catch (err) {
      const error = `Failed to set reverse DNS: ${String(err)}`;
      log('error', error, { error: err });
      return { success: false, error, elasticIp, allocationId, ptrRecord };
    }
  } catch (err) {
    const error = `Failed to find Elastic IP: ${String(err)}`;
    log('error', error, { error: err });
    return { success: false, error };
  }
}

