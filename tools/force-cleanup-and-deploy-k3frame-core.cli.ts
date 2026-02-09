#!/usr/bin/env ts-node

/**
 * Force cleanup and deploy script for k3frame core stack
 * 
 * This script:
 * 1. Aggressively cleans up any stuck stacks and changesets
 * 2. Waits for complete cleanup
 * 3. Attempts deployment with retry logic
 */

import { execSync } from 'child_process';

const STACK_NAME = 'k3frame-com-mailserver-core';
const REGION = process.env['AWS_REGION'] || 'us-east-1';
const PROFILE = process.env['AWS_PROFILE'] || 'k3frame';

function runCommand(cmd: string, description: string): { success: boolean; output: string } {
  console.log(`\n🔧 ${description}`);
  console.log(`   Command: ${cmd}`);
  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env, AWS_PROFILE: PROFILE, AWS_REGION: REGION },
    });
    console.log(`   ✅ Success`);
    return { success: true, output };
  } catch (error: any) {
    const output = error.stdout?.toString() || error.stderr?.toString() || error.message || '';
    if (output.includes('does not exist') || output.includes('ValidationError')) {
      console.log(`   ⚪ Resource not found (expected)`);
      return { success: true, output };
    }
    console.log(`   ⚠️  Error: ${output.substring(0, 200)}`);
    return { success: false, output };
  }
}

async function waitForStackDeletion(maxWaitSeconds: number = 120): Promise<boolean> {
  console.log(`\n⏳ Waiting for stack deletion (max ${maxWaitSeconds}s)...`);
  const startTime = Date.now();
  const checkInterval = 5000; // 5 seconds

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    const result = runCommand(
      `aws cloudformation describe-stacks --stack-name ${STACK_NAME} --query 'Stacks[0].StackStatus' --output text 2>&1 || echo "NOT_FOUND"`,
      'Checking stack status'
    );

    if (result.output.includes('NOT_FOUND') || result.output.includes('does not exist')) {
      console.log(`   ✅ Stack deleted`);
      return true;
    }

    const status = result.output.trim();
    if (status && !status.includes('DELETE_IN_PROGRESS')) {
      console.log(`   ⚠️  Stack status: ${status}`);
    }

    // Wait before next check
    const waitTime = Math.min(checkInterval, (maxWaitSeconds * 1000) - (Date.now() - startTime));
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  console.log(`   ⚠️  Timeout waiting for stack deletion`);
  return false;
}

async function main(): Promise<void> {
  console.log('🚀 Force Cleanup and Deploy - K3Frame Core Stack');
  console.log('═'.repeat(60));
  console.log(`Stack: ${STACK_NAME}`);
  console.log(`Region: ${REGION}`);
  console.log(`Profile: ${PROFILE}`);
  console.log('═'.repeat(60));

  // Step 1: Delete any pending changesets
  console.log('\n📋 Step 1: Cleaning up changesets');
  console.log('─'.repeat(60));
  
  const listChangesets = runCommand(
    `aws cloudformation list-change-sets --stack-name ${STACK_NAME} --query 'Summaries[*].ChangeSetName' --output text 2>&1 || echo ""`,
    'Listing changesets'
  );

  if (listChangesets.success && listChangesets.output.trim()) {
    const changesets = listChangesets.output.trim().split(/\s+/).filter((s) => s);
    for (const changeset of changesets) {
      runCommand(
        `aws cloudformation delete-change-set --stack-name ${STACK_NAME} --change-set-name ${changeset}`,
        `Deleting changeset: ${changeset}`
      );
    }
  }

  // Step 2: Delete the stack
  console.log('\n📋 Step 2: Deleting stack');
  console.log('─'.repeat(60));
  
  const deleteStack = runCommand(
    `aws cloudformation delete-stack --stack-name ${STACK_NAME}`,
    'Initiating stack deletion'
  );

  if (deleteStack.success) {
    // Wait for deletion
    const deleted = waitForStackDeletion(180); // 3 minutes
    if (!deleted) {
      console.log('\n⚠️  Stack deletion still in progress. Continuing anyway...');
    }
  }

  // Step 3: Run comprehensive cleanup
  console.log('\n📋 Step 3: Running comprehensive cleanup');
  console.log('─'.repeat(60));
  
  runCommand(
    `pnpm tsx tools/cleanup-k3frame-core.cli.ts`,
    'Running cleanup script'
  );

  // Step 4: Wait a bit more
  console.log('\n⏳ Waiting 10 seconds for AWS to propagate changes...');
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Step 5: Verify stack is gone
  console.log('\n📋 Step 4: Verifying cleanup');
  console.log('─'.repeat(60));
  
  const verify = runCommand(
    `aws cloudformation describe-stacks --stack-name ${STACK_NAME} --query 'Stacks[0].StackStatus' --output text 2>&1 || echo "STACK_NOT_FOUND"`,
    'Verifying stack deletion'
  );

  if (!verify.output.includes('STACK_NOT_FOUND') && !verify.output.includes('does not exist')) {
    console.log('\n❌ Stack still exists. Status:', verify.output.trim());
    console.log('   Please wait and try again, or manually delete the stack.');
    process.exit(1);
  }

  // Step 6: Attempt deployment
  console.log('\n📋 Step 5: Attempting deployment');
  console.log('─'.repeat(60));
  console.log('   This may take several minutes...\n');

  const deployCmd = `AWS_PROFILE=${PROFILE} AWS_REGION=${REGION} FEATURE_CDK_K3FRAME_STACKS_ENABLED=1 DOMAIN=k3frame.com pnpm nx run cdk-k3frame-core:deploy`;

  try {
    execSync(deployCmd, {
      encoding: 'utf-8',
      stdio: 'inherit',
      env: { ...process.env, AWS_PROFILE: PROFILE, AWS_REGION: REGION },
    });
    console.log('\n✅ Deployment completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.log('\n❌ Deployment failed');
    
    // Check if it's the same early validation error
    const errorOutput = error.stdout?.toString() || error.stderr?.toString() || error.message || '';
    if (errorOutput.includes('ResourceExistenceCheck')) {
      console.log('\n⚠️  Early validation error persists.');
      console.log('   This suggests a resource exists that we cannot detect.');
      console.log('   Possible causes:');
      console.log('   1. S3 bucket name conflict (globally unique)');
      console.log('   2. SES identity in different region');
      console.log('   3. Resource in different AWS account');
      console.log('\n   Recommendation: Check AWS Console manually or contact AWS support.');
    }
    
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}

