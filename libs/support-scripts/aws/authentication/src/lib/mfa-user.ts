import { STSClient, GetSessionTokenCommand } from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-providers';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import * as crypto from 'node:crypto';
import { parse, stringify } from 'ini';

type AuthConfig = {
  mfaArn: string;
  sourceProfile: string;
  targetProfile: string;
  durationSeconds: number;
  dryRun?: boolean;
  region?: string;
};

type SessionCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: string;
};

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
): void => {
  const rec = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
    runId: process.env.RUN_ID || crypto.randomUUID(),
  };
  console.log(JSON.stringify(rec));
};

async function prompt(promptText: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer: string = await new Promise((res) =>
    rl.question(promptText, res)
  );
  rl.close();
  return answer.trim();
}

function loadConfig(): AuthConfig {
  return {
    mfaArn:
      process.env.MFA_DEVICE_ARN ??
      'arn:aws:iam::413988044972:mfa/Evans-Phone',
    sourceProfile: process.env.SOURCE_PROFILE ?? 'hepe-admin',
    targetProfile: process.env.TARGET_PROFILE ?? 'hepe-admin-mfa',
    durationSeconds: Number(process.env.DURATION_SECONDS ?? 43200),
    dryRun: process.env.DRY_RUN === '1',
    region: process.env.AWS_REGION ?? 'us-east-1',
  };
}

async function getSession(
  cfg: AuthConfig,
  mfaCode: string
): Promise<SessionCredentials> {
  const credentialsProvider = fromIni({ profile: cfg.sourceProfile });
  const client = new STSClient({
    region: cfg.region,
    credentials: credentialsProvider,
  });

  const cmd = new GetSessionTokenCommand({
    SerialNumber: cfg.mfaArn,
    TokenCode: mfaCode,
    DurationSeconds: cfg.durationSeconds,
  });

  const out = await client.send(cmd);
  if (!out.Credentials) {
    throw new Error('Failed to get session token');
  }

  return {
    accessKeyId: out.Credentials.AccessKeyId!,
    secretAccessKey: out.Credentials.SecretAccessKey!,
    sessionToken: out.Credentials.SessionToken!,
    expiration: out.Credentials.Expiration?.toISOString(),
  };
}

function updateCredentialsFile(
  targetProfile: string,
  creds: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  }
): void {
  const credPath = path.join(os.homedir(), '.aws', 'credentials');
  const src = fs.existsSync(credPath)
    ? fs.readFileSync(credPath, 'utf-8')
    : '';
  const ini = src ? parse(src) : {};

  ini[targetProfile] = ini[targetProfile] ?? {};
  ini[targetProfile].aws_access_key_id = creds.accessKeyId;
  ini[targetProfile].aws_secret_access_key = creds.secretAccessKey;
  ini[targetProfile].aws_session_token = creds.sessionToken;

  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  fs.writeFileSync(credPath, stringify(ini), { mode: 0o600 });
}

export async function main(): Promise<void> {
  // Feature flag check
  if (
    process.env.FEATURE_NX_SCRIPTS_ENABLED !== '1' &&
    process.env.FEATURE_NX_SCRIPTS_ENABLED !== 'true'
  ) {
    log(
      'warn',
      'Nx scripts feature flag not enabled. Set FEATURE_NX_SCRIPTS_ENABLED=1 to use.',
      { featureFlag: 'FEATURE_NX_SCRIPTS_ENABLED' }
    );
    // Don't exit - allow manual override for testing
  }

  const cfg = loadConfig();
  log('info', 'Starting MFA auth', {
    sourceProfile: cfg.sourceProfile,
    targetProfile: cfg.targetProfile,
    duration: cfg.durationSeconds,
    dryRun: !!cfg.dryRun,
  });

  const code = await prompt(`Enter MFA code for ${cfg.sourceProfile}: `);
  if (!/^\d{6}$/.test(code)) {
    throw new Error('MFA code must be 6 digits');
  }

  const session = await getSession(cfg, code);

  if (cfg.dryRun) {
    log('info', 'DRY_RUN: would write temporary credentials', {
      targetProfile: cfg.targetProfile,
      expires: session.expiration,
    });
  } else {
    updateCredentialsFile(cfg.targetProfile, session);
    log('info', 'Temporary credentials written to credentials file', {
      targetProfile: cfg.targetProfile,
      expires: session.expiration,
    });
  }

  // Export current-process env (useful if invoked directly)
  process.env.AWS_ACCESS_KEY_ID = session.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = session.secretAccessKey;
  process.env.AWS_SESSION_TOKEN = session.sessionToken;

  log('info', 'Temporary credentials ready', {
    targetProfile: cfg.targetProfile,
    note: `Use --profile ${cfg.targetProfile}`,
    expires: session.expiration,
  });

  console.log(
    `\nTemporary credentials set for profile '${cfg.targetProfile}' (valid for ${Math.floor(cfg.durationSeconds / 3600)} hours)`
  );
  console.log(`Original credentials in '${cfg.sourceProfile}' remain unchanged`);
  console.log(`Use AWS commands with: aws ... --profile ${cfg.targetProfile}`);
  console.log('Environment variables are also set for the current session');
}

if (require.main === module) {
  main().catch((err) => {
    log('error', err.message, { error: err.name, stack: err.stack });
    process.exit(1);
  });
}

