#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("../src/lib/config");
const child_process_1 = require("child_process");
/**
 * CDK deployment wrapper that loads secure configuration
 * and sets up environment variables before running CDK commands.
 */
function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: cdk-deploy <cdk-command> [cdk-args...]');
        console.error('Example: cdk-deploy deploy --require-approval never');
        process.exit(1);
    }
    const cdkCommand = args[0];
    const cdkArgs = args.slice(1);
    // Load configuration and get environment variables
    const envVars = (0, config_1.getCdkEnvVars)();
    // Merge with existing environment
    const env = {
        ...process.env,
        ...envVars,
    };
    // Build full CDK command
    const fullCommand = `cdk ${cdkCommand} ${cdkArgs.join(' ')}`.trim();
    console.log('Loading deployment configuration...');
    console.log(`AWS Profile: ${envVars['AWS_PROFILE']}`);
    console.log(`AWS Region: ${envVars['AWS_REGION']}`);
    if (envVars['CDK_DEFAULT_ACCOUNT']) {
        console.log(`CDK Account: ${envVars['CDK_DEFAULT_ACCOUNT']}`);
    }
    console.log(`\nExecuting: ${fullCommand}\n`);
    try {
        (0, child_process_1.execSync)(fullCommand, {
            env,
            stdio: 'inherit',
            cwd: process.cwd(),
        });
    }
    catch (error) {
        process.exit(1);
    }
}
main();
//# sourceMappingURL=cdk-deploy.js.map