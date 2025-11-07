"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDeploymentConfig = loadDeploymentConfig;
exports.getCdkEnvVars = getCdkEnvVars;
const fs = require("node:fs");
const path = require("node:path");
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
    if (config.cdk.defaultAccount) {
        env['CDK_DEFAULT_ACCOUNT'] = config.cdk.defaultAccount;
    }
    return env;
}
//# sourceMappingURL=config.js.map