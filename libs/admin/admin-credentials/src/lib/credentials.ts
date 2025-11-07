import { getStackInfo, getStackInfoFromApp } from '@mm/admin-stack-info';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

export type AdminCredentials = {
  email: string;
  password: string;
  domain: string;
  adminUrl: string;
};

export type GetCredentialsConfig = {
  appPath?: string;
  stackName?: string;
  domain?: string;
  region?: string;
  profile?: string;
};

/**
 * Gets admin credentials for a Mail-in-a-Box stack
 */
export async function getAdminCredentials(
  config: GetCredentialsConfig
): Promise<AdminCredentials> {
  let stackInfo;

  if (config.appPath) {
    stackInfo = await getStackInfoFromApp(config.appPath, {
      region: config.region,
      profile: config.profile,
    });
  } else {
    stackInfo = await getStackInfo({
      stackName: config.stackName,
      domain: config.domain,
      region: config.region,
      profile: config.profile,
    });
  }

  if (!stackInfo.adminPassword) {
    throw new Error(
      `Admin password not found for stack ${stackInfo.stackName}. Check SSM parameter: /MailInABoxAdminPassword-${stackInfo.stackName}`
    );
  }

  const email = `admin@${stackInfo.domain}`;
  const adminUrl = `https://${stackInfo.domain}/admin`;

  log('info', 'Retrieved admin credentials', {
    domain: stackInfo.domain,
    stackName: stackInfo.stackName,
    hasPassword: !!stackInfo.adminPassword,
  });

  return {
    email,
    password: stackInfo.adminPassword,
    domain: stackInfo.domain,
    adminUrl,
  };
}

