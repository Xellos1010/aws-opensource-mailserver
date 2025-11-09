"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDeploymentConfig = loadDeploymentConfig;
exports.getCdkEnvVars = getCdkEnvVars;
exports.tryGetAccountFromAwsCli = tryGetAccountFromAwsCli;
exports.getCdkEnvVarsWithFallback = getCdkEnvVarsWithFallback;
const fs = require("node:fs");
const path = require("node:path");
const child_process_1 = require("child_process");
const DEFAULT_CONFIG = {
    aws: {
        profile: 'hepe-admin-mfa',
        region: 'us-east-1',
    },
    cdk: {
        defaultRegion: 'us-east-1',
    },
};
/**
 * Loads deployment configuration from a local file or environment variables.
 * The local config file is gitignored and should not be committed.
 *
 * Priority:
 * 1. Environment variables (highest priority)
 * 2. Local config file (.aws-config.local.json)
 * 3. Default values (lowest priority)
 */
function loadDeploymentConfig() {
    const configPath = path.join(process.cwd(), '.aws-config.local.json');
    let fileConfig = {};
    // Try to load from local config file (gitignored)
    if (fs.existsSync(configPath)) {
        try {
            const fileContent = fs.readFileSync(configPath, 'utf-8');
            fileConfig = JSON.parse(fileContent);
        }
        catch (err) {
            console.warn(`Warning: Failed to parse config file at ${configPath}: ${err}`);
        }
    }
    // Merge configs with priority: env vars > file config > defaults
    const config = {
        aws: {
            profile: process.env['AWS_PROFILE'] ||
                fileConfig.aws?.profile ||
                DEFAULT_CONFIG.aws.profile,
            region: process.env['AWS_REGION'] ||
                fileConfig.aws?.region ||
                DEFAULT_CONFIG.aws.region,
            accountId: process.env['AWS_ACCOUNT_ID'] ||
                fileConfig.aws?.accountId ||
                DEFAULT_CONFIG.aws.accountId,
        },
        cdk: {
            defaultAccount: process.env['CDK_DEFAULT_ACCOUNT'] ||
                fileConfig.cdk?.defaultAccount ||
                fileConfig.aws?.accountId ||
                DEFAULT_CONFIG.cdk.defaultAccount,
            defaultRegion: process.env['CDK_DEFAULT_REGION'] ||
                fileConfig.cdk?.defaultRegion ||
                DEFAULT_CONFIG.cdk.defaultRegion,
        },
    };
    return config;
}
/**
 * Gets AWS environment variables for CDK deployment
 */
function getCdkEnvVars() {
    const config = loadDeploymentConfig();
    const env = {
        AWS_PROFILE: config.aws.profile,
        AWS_REGION: config.aws.region,
        CDK_DEFAULT_REGION: config.cdk.defaultRegion,
    };
    // Set CDK_DEFAULT_ACCOUNT if available
    if (config.cdk.defaultAccount) {
        env['CDK_DEFAULT_ACCOUNT'] = config.cdk.defaultAccount;
    }
    else if (config.aws.accountId) {
        env['CDK_DEFAULT_ACCOUNT'] = config.aws.accountId;
    }
    return env;
}
/**
 * Attempts to get AWS account ID from AWS CLI.
 * Respects AWS_PROFILE environment variable or provided profile parameter.
 *
 * @param profile - Optional AWS profile name. If not provided, uses AWS_PROFILE env var or default profile.
 * @returns AWS account ID as string, or undefined if AWS CLI fails or is unavailable.
 */
function tryGetAccountFromAwsCli(profile) {
    try {
        // Validate profile parameter if provided
        if (profile !== undefined && (typeof profile !== 'string' || profile.trim() === '')) {
            return undefined;
        }
        // Build AWS CLI command with profile if provided
        const profileArg = profile ? `--profile ${profile}` : '';
        const command = `aws sts get-caller-identity ${profileArg} --query Account --output text`.trim();
        // Execute AWS CLI command with proper error handling
        // Use stdio: ['ignore', 'pipe', 'ignore'] to avoid blocking and capture output only
        const account = (0, child_process_1.execSync)(command, {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
            env: {
                ...process.env,
                // Set AWS_PROFILE in execSync env if profile is provided
                ...(profile ? { AWS_PROFILE: profile } : {}),
            },
        }).trim();
        return account || undefined;
    }
    catch {
        // Return undefined on any failure (don't throw) - error handling rule
        return undefined;
    }
}
/**
 * Gets AWS environment variables for CDK deployment with AWS CLI fallback for account.
 * Enhanced version of getCdkEnvVars() that attempts to resolve account via AWS CLI if not set.
 *
 * @returns Environment variables with CDK_DEFAULT_ACCOUNT populated if available.
 */
function getCdkEnvVarsWithFallback() {
    const config = loadDeploymentConfig();
    const env = {
        AWS_PROFILE: config.aws.profile,
        AWS_REGION: config.aws.region,
        CDK_DEFAULT_REGION: config.cdk.defaultRegion,
    };
    // Set CDK_DEFAULT_ACCOUNT with fallback priority:
    // 1. Config defaultAccount
    // 2. Config aws.accountId
    // 3. AWS CLI fallback (respects AWS_PROFILE)
    if (config.cdk.defaultAccount) {
        env['CDK_DEFAULT_ACCOUNT'] = config.cdk.defaultAccount;
    }
    else if (config.aws.accountId) {
        env['CDK_DEFAULT_ACCOUNT'] = config.aws.accountId;
    }
    else {
        // Try AWS CLI as last resort, using the configured profile
        const accountFromCli = tryGetAccountFromAwsCli(config.aws.profile);
        if (accountFromCli) {
            env['CDK_DEFAULT_ACCOUNT'] = accountFromCli;
        }
    }
    return env;
}
//# sourceMappingURL=config.js.map