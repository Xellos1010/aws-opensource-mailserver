import { setupSshAccess } from '@mm/admin-ssh-access';
import { setSesDnsRecords } from '@mm/admin-ses-dns';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

export type ProvisionInstanceConfig = {
  domain: string;
  region?: string;
  profile?: string;
  miabAdminEmail?: string; // Defaults to admin@{domain}
  skipSsh?: boolean;
  skipSesDns?: boolean;
};

export type ProvisionResult = {
  success: boolean;
  sshResult?: {
    host?: string;
    keyPath?: string;
    instanceId?: string;
    instanceIp?: string;
  };
  sesDnsResult?: {
    recordsConfigured: number;
  };
  error?: string;
};

/**
 * Provisions a mailserver instance by setting up SSH access and SES DNS records
 * Orchestrates setupSshAccess() and setSesDnsRecords()
 */
export async function provisionInstance(
  config: ProvisionInstanceConfig
): Promise<ProvisionResult> {
  const domain = config.domain;
  const region = config.region || process.env['AWS_REGION'] || 'us-east-1';
  const profile = config.profile || process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
  const miabAdminEmail = config.miabAdminEmail || `admin@${domain}`;
  const skipSsh = config.skipSsh || false;
  const skipSesDns = config.skipSesDns || false;

  log('info', 'Starting instance provisioning', {
    domain,
    region,
    profile,
    miabAdminEmail,
    skipSsh,
    skipSesDns,
  });

  const result: ProvisionResult = {
    success: true,
  };

  try {
    // Step 1: Setup SSH access (unless skipped)
    if (!skipSsh) {
      log('info', 'Setting up SSH access');
      const sshResult = await setupSshAccess({
        domain,
        region,
        profile,
      });

      if (!sshResult.success) {
        const error = `SSH setup failed: ${sshResult.error}`;
        log('error', error);
        return {
          success: false,
          error,
          sshResult: {
            instanceId: sshResult.instanceId,
            instanceIp: sshResult.instanceIp,
          },
        };
      }

      log('info', 'SSH access setup completed successfully');
      result.sshResult = {
        host: sshResult.host,
        keyPath: sshResult.keyPath,
        instanceId: sshResult.instanceId,
        instanceIp: sshResult.instanceIp,
      };
    } else {
      log('info', 'Skipping SSH setup');
    }

    // Step 2: Setup SES DNS records (unless skipped)
    if (!skipSesDns) {
      log('info', 'Setting up SES DNS records');
      const sesDnsResult = await setSesDnsRecords({
        domain,
        region,
        profile,
        miabAdminEmail,
        dryRun: false, // Always do the real work in provision
      });

      if (!sesDnsResult.success) {
        const error = `SES DNS setup failed: ${sesDnsResult.error}`;
        log('error', error);
        return {
          success: false,
          error,
          sshResult: result.sshResult,
        };
      }

      log('info', 'SES DNS records setup completed successfully');
      result.sesDnsResult = {
        recordsConfigured: sesDnsResult.records ? 5 : 0, // DKIM x3 + MX + TXT
      };
    } else {
      log('info', 'Skipping SES DNS setup');
    }

    log('info', 'Instance provisioning completed successfully', {
      sshConfigured: !skipSsh,
      sesDnsConfigured: !skipSesDns,
      recordsConfigured: result.sesDnsResult?.recordsConfigured || 0,
    });

    return result;

  } catch (error) {
    const err = `Instance provisioning failed: ${String(error)}`;
    log('error', err, { error });
    return {
      success: false,
      error: err,
      sshResult: result.sshResult,
    };
  }
}