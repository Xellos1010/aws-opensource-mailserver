#!/usr/bin/env ts-node

/**
 * Test script to verify stack resolution validation works correctly
 * Tests that operations fail gracefully when required parameters are missing
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';

interface TestCase {
  name: string;
  config: {
    domain?: string;
    appPath?: string;
    stackName?: string;
  };
  shouldFail: boolean;
  expectedError?: string;
}

const testCases: TestCase[] = [
  {
    name: 'Should fail when no parameters provided',
    config: {},
    shouldFail: true,
    expectedError: 'Cannot resolve',
  },
  {
    name: 'Should succeed with domain only',
    config: { domain: 'emcnotary.com' },
    shouldFail: false,
  },
  {
    name: 'Should succeed with appPath only',
    config: { appPath: 'apps/cdk-emc-notary/instance' },
    shouldFail: false,
  },
  {
    name: 'Should succeed with stackName only',
    config: { stackName: 'emcnotary-com-mailserver-instance' },
    shouldFail: false,
  },
  {
    name: 'Should succeed with domain and appPath',
    config: { domain: 'emcnotary.com', appPath: 'apps/cdk-emc-notary/instance' },
    shouldFail: false,
  },
];

async function runTests(): Promise<void> {
  console.log('🧪 Testing Stack Resolution Validation\n');
  
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    process.stdout.write(`Testing: ${testCase.name}... `);
    
    try {
      // Test resolveStackName
      const stackName = resolveStackName(
        testCase.config.domain,
        testCase.config.appPath,
        testCase.config.stackName,
        'instance'
      );
      
      if (testCase.shouldFail) {
        console.log('❌ FAILED - Expected error but got stack name:', stackName);
        failed++;
        continue;
      }
      
      if (!stackName) {
        console.log('❌ FAILED - Expected stack name but got undefined');
        failed++;
        continue;
      }
      
      console.log('✅ PASSED');
      passed++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (testCase.shouldFail) {
        if (testCase.expectedError && !errorMessage.includes(testCase.expectedError)) {
          console.log(`❌ FAILED - Error message doesn't match expected pattern`);
          console.log(`   Expected: ${testCase.expectedError}`);
          console.log(`   Got: ${errorMessage}`);
          failed++;
          continue;
        }
        console.log('✅ PASSED (failed as expected)');
        passed++;
      } else {
        console.log(`❌ FAILED - Unexpected error: ${errorMessage}`);
        failed++;
      }
    }
  }

  // Test getStackInfo with missing parameters (should fail without AWS call)
  console.log('\nTesting getStackInfo validation...');
  process.stdout.write('Testing: getStackInfo with no parameters... ');
  try {
    await getStackInfo({});
    console.log('❌ FAILED - Expected error but succeeded');
    failed++;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Cannot resolve')) {
      console.log('✅ PASSED (failed as expected)');
      passed++;
    } else {
      console.log(`❌ FAILED - Wrong error: ${errorMessage}`);
      failed++;
    }
  }

  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}


