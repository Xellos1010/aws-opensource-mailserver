import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

/**
 * Reboot Integration E2E Tests
 * 
 * These tests verify the complete reboot flow:
 * 1. Direct Lambda invocation reboots instance
 * 2. EventBridge manual trigger invokes Lambda and reboots instance
 * 3. EventBridge scheduled trigger invokes Lambda and reboots instance
 * 
 * Each test waits for the instance to complete reboot before proceeding.
 * 
 * Prerequisites:
 * - Instance stack deployed
 * - Instance running
 * - AWS credentials configured
 * 
 * Run this test suite:
 *   pnpm nx run cdk-emcnotary-instance:test:reboot-integration
 * 
 * WARNING: These tests will actually reboot your instance multiple times.
 * Only run on test instances, not production!
 */
describe('Reboot Integration E2E Tests', () => {
  // Use AWS profile (defaults to hepe-admin-mfa) for all AWS CLI commands
  // If AWS_ACCESS_KEY_ID is set, it takes precedence over profile
  const hasAwsAccessKeys =
    process.env['AWS_ACCESS_KEY_ID'] && process.env['AWS_SECRET_ACCESS_KEY'];
  
  // Default to hepe-admin-mfa profile if no profile or access keys are specified
  if (!hasAwsAccessKeys) {
    const awsProfile = process.env['AWS_PROFILE'] || process.env['AWS_DEFAULT_PROFILE'] || 'hepe-admin-mfa';
    process.env['AWS_PROFILE'] = awsProfile;
  }
  
  const testDomain = process.env['DOMAIN'] || 'emcnotary.com';
  const testStackName = `${testDomain.replace(/\./g, '-')}-mailserver-instance`;

  // Always run tests - AWS CLI will fail naturally if credentials aren't available
  const describeIfAws = describe;

  // Shared resources (populated in beforeAll)
  let instanceId: string;
  let lambdaFunctionName: string;
  let eventBridgeRuleName: string;
  let originalSchedule: string;
  let test1Passed = false; // Track if Test 1 passed to skip subsequent tests

  /**
   * Helper: Execute AWS CLI command with profile support
   * Ensures AWS_PROFILE is set for all AWS CLI commands (unless access keys are provided)
   */
  function execAwsCli(
    command: string,
    options: { encoding: BufferEncoding; stdio: 'pipe' | 'inherit' | 'ignore' } = {
      encoding: 'utf8',
      stdio: 'pipe',
    }
  ): string {
    const hasAwsAccessKeys =
      process.env['AWS_ACCESS_KEY_ID'] && process.env['AWS_SECRET_ACCESS_KEY'];
    
    // Only set AWS_PROFILE if access keys are not provided
    const env = { ...process.env };
    if (!hasAwsAccessKeys) {
      env['AWS_PROFILE'] = process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
    }
    
    return execSync(command, {
      ...options,
      env,
    }).toString();
  }

  /**
   * Helper: Get instance state from EC2
   */
  function getInstanceState(instanceId: string): string | null {
    try {
      const state = execAwsCli(
        `aws ec2 describe-instance-status --instance-ids ${instanceId} --query 'InstanceStatuses[0].InstanceState.Name' --output text`
      ).trim();
      return state;
    } catch (error) {
      console.warn(`Failed to get instance state: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Helper: Wait for instance to complete reboot cycle
   * Returns true if reboot completed successfully, false on timeout
   * @param stateChangeTimeoutMs - Maximum time to wait for state to change from "running" (default: 60000ms = 60s)
   */
  async function waitForReboot(
    instanceId: string,
    timeoutMs: number = 300000,
    stateChangeTimeoutMs: number = 60000
  ): Promise<boolean> {
    const checkInterval = 2000; // 2 seconds
    const statusPrintInterval = 10000; // Print status every 10 seconds
    const startTime = Date.now();
    let lastStatusPrint = startTime;
    let previousState: string | null = null;

    console.log(`Waiting for instance ${instanceId} to reboot...`);
    console.log(`State change timeout: ${stateChangeTimeoutMs / 1000}s, Total timeout: ${timeoutMs / 1000}s`);

    // Wait for state to change from "running" to "rebooting" or "stopping"
    let stateChanged = false;
    while (Date.now() - startTime < timeoutMs) {
      const currentState = getInstanceState(instanceId);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      
      // Print status every 10 seconds or when state changes
      if (currentState !== previousState || Date.now() - lastStatusPrint >= statusPrintInterval) {
        console.log(`[${elapsed}s] Instance state: ${currentState || 'unknown'}`);
        lastStatusPrint = Date.now();
        previousState = currentState;
      }
      
      // Check if we've exceeded the state change timeout
      if (Date.now() - startTime >= stateChangeTimeoutMs && !stateChanged) {
        console.error(`Instance state did not change within ${stateChangeTimeoutMs / 1000}s timeout`);
        return false;
      }
      
      if (currentState === 'rebooting' || currentState === 'stopping') {
        stateChanged = true;
        console.log(`✓ Instance state changed to: ${currentState} (after ${elapsed}s)`);
        break;
      }
      
      if (currentState === null) {
        // Instance might be in transition, wait a bit more
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        continue;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    if (!stateChanged) {
      console.warn('Instance state did not change to rebooting/stopping within timeout');
      return false;
    }

    // Wait for instance to return to "running"
    console.log('Waiting for instance to return to running state...');
    const runningStartTime = Date.now();
    const runningMaxWait = timeoutMs - (Date.now() - startTime);
    previousState = null;
    lastStatusPrint = Date.now();

    while (Date.now() - runningStartTime < runningMaxWait) {
      const currentState = getInstanceState(instanceId);
      const elapsed = Math.floor((Date.now() - runningStartTime) / 1000);
      const totalElapsed = Math.floor((Date.now() - startTime) / 1000);
      
      // Print status every 10 seconds or when state changes
      if (currentState !== previousState || Date.now() - lastStatusPrint >= statusPrintInterval) {
        console.log(`[${totalElapsed}s] Instance state: ${currentState || 'unknown'} (rebooting for ${elapsed}s)`);
        lastStatusPrint = Date.now();
        previousState = currentState;
      }
      
      if (currentState === 'running') {
        console.log(`✓ Instance is running again (total time: ${totalElapsed}s)`);
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.warn('Instance did not return to running state within timeout');
    return false;
  }

  /**
   * Helper: Get Lambda function name from stack
   */
  function getLambdaFunctionName(stackName: string): string | null {
    try {
      const stackResources = execAwsCli(
        `aws cloudformation describe-stack-resources --stack-name ${stackName} --query 'StackResources[?ResourceType==\`AWS::Lambda::Function\`]' --output json`
      );

      const lambdaResources = JSON.parse(stackResources);
      // Filter for Lambda functions with LogicalResourceId starting with "NightlyRebootFunction"
      const rebootLambda = lambdaResources.find((resource: any) =>
        resource.LogicalResourceId?.startsWith('NightlyRebootFunction')
      );
      
      if (!rebootLambda) {
        return null;
      }

      return rebootLambda.PhysicalResourceId;
    } catch (error) {
      console.warn(`Failed to get Lambda function name: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Helper: Get EventBridge rule name from stack
   */
  function getEventBridgeRuleName(stackName: string): string | null {
    try {
      const stackResources = execAwsCli(
        `aws cloudformation describe-stack-resources --stack-name ${stackName} --query 'StackResources[?ResourceType==\`AWS::Events::Rule\`]' --output json`
      );

      const ruleResources = JSON.parse(stackResources);
      // Filter for EventBridge rules with LogicalResourceId starting with "NightlyRebootRule"
      const rebootRule = ruleResources.find((resource: any) =>
        resource.LogicalResourceId?.startsWith('NightlyRebootRule')
      );
      
      if (!rebootRule) {
        return null;
      }

      return rebootRule.PhysicalResourceId;
    } catch (error) {
      console.warn(`Failed to get EventBridge rule name: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Helper: Get current EventBridge schedule
   */
  function getEventBridgeSchedule(ruleName: string): string | null {
    try {
      const schedule = execAwsCli(
        `aws events describe-rule --name ${ruleName} --query 'ScheduleExpression' --output text`
      ).trim();
      return schedule;
    } catch (error) {
      console.warn(`Failed to get EventBridge schedule: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Helper: Update EventBridge schedule
   */
  function updateEventBridgeSchedule(ruleName: string, schedule: string): boolean {
    try {
      execAwsCli(
        `aws events put-rule --name ${ruleName} --schedule-expression "${schedule}"`
      );
      return true;
    } catch (error) {
      console.error(`Failed to update EventBridge schedule: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Helper: Get detailed Lambda logs from CloudWatch
   */
  async function getLambdaLogs(
    functionName: string,
    startTime: number,
    waitSeconds: number = 5
  ): Promise<string[]> {
    const logGroupName = `/aws/lambda/${functionName}`;
    const startTimeMs = startTime * 1000;

    try {
      // Wait for logs to appear
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));

      const logs = execAwsCli(
        `aws logs filter-log-events --log-group-name ${logGroupName} --start-time ${startTimeMs} --query 'events[*].message' --output text`
      );

      return logs.split('\n').filter(msg => msg.trim());
    } catch (error) {
      console.warn(`Could not retrieve Lambda logs: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Helper: Verify Lambda was invoked and check for reboot command
   * Returns detailed information about the invocation
   */
  async function verifyLambdaInvocation(
    functionName: string,
    startTime: number
  ): Promise<{
    success: boolean;
    logs: string[];
    hasRebootLog: boolean;
    hasError: boolean;
    errorMessages: string[];
  }> {
    const logMessages = await getLambdaLogs(functionName, startTime, 5);

    const hasRebootLog = logMessages.some(msg =>
      msg.includes('Rebooting Mail-in-a-Box instance') ||
      msg.includes('Successfully initiated reboot') ||
      msg.includes('RebootInstancesCommand')
    );

    const errorMessages = logMessages.filter(msg =>
      msg.includes('ERROR') ||
      msg.includes('Error') ||
      msg.includes('error') ||
      msg.includes('Failed') ||
      msg.includes('Exception') ||
      msg.includes('errorType')
    );

    const hasError = errorMessages.length > 0;

    return {
      success: hasRebootLog && !hasError,
      logs: logMessages,
      hasRebootLog,
      hasError,
      errorMessages,
    };
  }

  /**
   * Helper: Check Lambda function configuration
   */
  function checkLambdaConfiguration(lambdaName: string, expectedInstanceId: string): {
    instanceIdMatch: boolean;
    lambdaInstanceId: string | null;
    hasError: boolean;
    errorMessage: string | null;
  } {
    try {
      const config = execAwsCli(
        `aws lambda get-function-configuration --function-name ${lambdaName} --query 'Environment.Variables.INSTANCE_ID' --output text`
      ).trim();

      const instanceIdMatch = config === expectedInstanceId;

      return {
        instanceIdMatch,
        lambdaInstanceId: config || null,
        hasError: false,
        errorMessage: null,
      };
    } catch (error) {
      return {
        instanceIdMatch: false,
        lambdaInstanceId: null,
        hasError: true,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Helper: Calculate cron schedule for N minutes from now
   */
  function getScheduleInMinutes(minutes: number): string {
    const now = new Date();
    const targetTime = new Date(now.getTime() + minutes * 60 * 1000);
    
    const minute = targetTime.getUTCMinutes();
    const hour = targetTime.getUTCHours();
    
    // Format: cron(minute hour day-of-month month day-of-week year)
    return `cron(${minute} ${hour} * * ? *)`;
  }

  /**
   * Helper: Calculate cron schedule for N seconds from now
   * Note: EventBridge cron has 1-minute granularity, so we schedule for the next minute boundary
   */
  function getScheduleInSeconds(seconds: number): string {
    const now = new Date();
    // Calculate target time
    const targetTime = new Date(now.getTime() + seconds * 1000);
    
    // Get the next minute boundary (round up to next minute)
    const nextMinute = new Date(targetTime);
    nextMinute.setUTCSeconds(0);
    nextMinute.setUTCMilliseconds(0);
    
    // If the next minute boundary is in the past or exactly now, move to the following minute
    if (nextMinute.getTime() <= now.getTime()) {
      nextMinute.setUTCMinutes(nextMinute.getUTCMinutes() + 1);
    }
    
    const minute = nextMinute.getUTCMinutes();
    const hour = nextMinute.getUTCHours();
    
    // Format: cron(minute hour day-of-month month day-of-week year)
    return `cron(${minute} ${hour} * * ? *)`;
  }

  describeIfAws('Reboot Integration Tests', () => {
    beforeAll(() => {
      // Get instance ID from stack outputs
      const stackOutputs = execAwsCli(
        `aws cloudformation describe-stacks --stack-name ${testStackName} --query 'Stacks[0].Outputs' --output json`
      );

      const outputs = JSON.parse(stackOutputs);
      const instanceIdOutput = outputs.find((o: any) => o.OutputKey === 'InstanceId');
      
      if (!instanceIdOutput) {
        throw new Error('Instance ID not found in stack outputs');
      }

      instanceId = instanceIdOutput.OutputValue;

      // Get Lambda function name
      const lambdaName = getLambdaFunctionName(testStackName);
      if (!lambdaName) {
        throw new Error('Lambda function not found in stack');
      }
      lambdaFunctionName = lambdaName;

      // Get EventBridge rule name
      const ruleName = getEventBridgeRuleName(testStackName);
      if (!ruleName) {
        throw new Error('EventBridge rule not found in stack');
      }
      eventBridgeRuleName = ruleName;

      // Get and store original schedule
      const schedule = getEventBridgeSchedule(eventBridgeRuleName);
      if (!schedule) {
        throw new Error('Could not retrieve EventBridge schedule');
      }
      originalSchedule = schedule;

      console.log(`Test Configuration:
        Instance ID: ${instanceId}
        Lambda Function: ${lambdaFunctionName}
        EventBridge Rule: ${eventBridgeRuleName}
        Original Schedule: ${originalSchedule}`);
    });

    afterAll(() => {
      // Restore original EventBridge schedule
      if (originalSchedule && eventBridgeRuleName) {
        console.log(`Restoring original EventBridge schedule: ${originalSchedule}`);
        updateEventBridgeSchedule(eventBridgeRuleName, originalSchedule);
      }
    });

    it('Test 1: Direct Lambda invocation reboots instance', async () => {
      // Verify instance is running
      const initialState = getInstanceState(instanceId);
      expect(initialState).toBe('running');

      // Check Lambda configuration before invoking
      console.log('Checking Lambda configuration...');
      const lambdaConfig = checkLambdaConfiguration(lambdaFunctionName, instanceId);
      if (lambdaConfig.hasError) {
        throw new Error(`Failed to check Lambda configuration: ${lambdaConfig.errorMessage}`);
      }
      if (!lambdaConfig.instanceIdMatch) {
        console.error(`⚠️  Lambda INSTANCE_ID mismatch!`);
        console.error(`   Lambda has: ${lambdaConfig.lambdaInstanceId}`);
        console.error(`   Expected: ${instanceId}`);
        throw new Error(`Lambda INSTANCE_ID does not match actual instance ID`);
      }
      console.log(`✓ Lambda configuration verified (INSTANCE_ID: ${lambdaConfig.lambdaInstanceId})`);

      console.log(`Test 1: Invoking Lambda function ${lambdaFunctionName} directly...`);

      // Invoke Lambda function
      const invokeStartTime = Math.floor(Date.now() / 1000);
      const responseFile = '/tmp/lambda-response-1.json';
      
      try {
        // Invoke Lambda and capture both invoke response and function response
        const invokeOutput = execAwsCli(
          `aws lambda invoke --function-name ${lambdaFunctionName} --payload '{}' ${responseFile}`
        );
        
        // Parse the invoke response (contains StatusCode, ExecutedVersion, etc.)
        const invokeResponse = JSON.parse(invokeOutput);
        expect(invokeResponse.StatusCode).toBe(200);
        
        // Parse the function response (contains statusCode, body, or error)
        const functionResponse = JSON.parse(readFileSync(responseFile, 'utf8'));
        
        // Check if Lambda executed successfully (no error)
        if (functionResponse.errorType) {
          console.error('Lambda function error response:', functionResponse);
          throw new Error(`Lambda function error: ${functionResponse.errorMessage || functionResponse.errorType}`);
        }
        
        // Verify function response
        expect(functionResponse.statusCode).toBe(200);
        expect(functionResponse.body).toContain(instanceId);

        console.log('Lambda invocation successful, waiting for reboot...');

        // Wait for reboot with 60 second state change timeout
        const stateChangeTimeout = 60000; // 60 seconds
        const rebootCompleted = await waitForReboot(instanceId, 300000, stateChangeTimeout);
        
        if (!rebootCompleted) {
          // Get detailed logs for diagnostics
          console.error('Instance did not reboot. Checking CloudWatch logs for diagnostics...');
          const logVerification = await verifyLambdaInvocation(lambdaFunctionName, invokeStartTime);
          
          console.error('Lambda Logs:');
          logVerification.logs.forEach(log => console.error(`  ${log}`));
          
          if (logVerification.hasError) {
            console.error('Errors found in logs:');
            logVerification.errorMessages.forEach(err => console.error(`  ${err}`));
          }
          
          if (!logVerification.hasRebootLog) {
            console.error('No reboot-related logs found. Lambda may not have executed reboot command.');
          }
          
          throw new Error('Instance did not reboot within timeout. Check CloudWatch logs above for details.');
        }

        // Verify Lambda invocation in CloudWatch logs
        const logVerification = await verifyLambdaInvocation(lambdaFunctionName, invokeStartTime);
        if (logVerification.success) {
          console.log('✓ Verified Lambda invocation in CloudWatch logs');
        } else {
          console.warn('⚠️  Could not fully verify Lambda invocation in CloudWatch logs');
          if (logVerification.hasError) {
            console.warn('Errors in logs:', logVerification.errorMessages);
          }
        }

        test1Passed = true;
        console.log('✓ Test 1 completed: Direct Lambda invocation successfully rebooted instance');
      } catch (error) {
        test1Passed = false;
        // Get logs even on error for diagnostics
        try {
          const logVerification = await verifyLambdaInvocation(lambdaFunctionName, invokeStartTime);
          if (logVerification.logs.length > 0) {
            console.error('Lambda logs at time of error:');
            logVerification.logs.forEach(log => console.error(`  ${log}`));
          }
        } catch (logError) {
          // Ignore log retrieval errors
        }
        throw new Error(`Lambda invocation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, 360000); // 6 minute timeout

    it('Test 2: EventBridge manual trigger invokes Lambda and reboots instance', async () => {
      if (!test1Passed) {
        console.log('⏭️  Skipping Test 2: Test 1 did not pass');
        return;
      }

      // Verify instance is running
      const initialState = getInstanceState(instanceId);
      expect(initialState).toBe('running');

      console.log(`Test 2: Testing EventBridge manual trigger...`);

      // Temporarily modify schedule to trigger in 2 minutes
      const testSchedule = getScheduleInMinutes(2);
      console.log(`Temporarily setting EventBridge schedule to: ${testSchedule}`);
      
      const scheduleUpdated = updateEventBridgeSchedule(eventBridgeRuleName, testSchedule);
      expect(scheduleUpdated).toBe(true);

      // Wait for the scheduled trigger (2 minutes + buffer)
      const waitTime = 2 * 60 * 1000 + 30000; // 2 minutes 30 seconds
      const triggerStartTime = Math.floor(Date.now() / 1000);
      
      console.log(`Waiting ${waitTime / 1000} seconds for EventBridge to trigger Lambda...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Verify Lambda was invoked by checking CloudWatch logs
      const logVerification = await verifyLambdaInvocation(lambdaFunctionName, triggerStartTime);
      expect(logVerification.success).toBe(true);
      if (!logVerification.success) {
        console.error('Lambda logs:', logVerification.logs);
        if (logVerification.hasError) {
          console.error('Errors:', logVerification.errorMessages);
        }
      }

      console.log('EventBridge triggered Lambda, waiting for reboot...');

      // Wait for reboot to complete
      const rebootCompleted = await waitForReboot(instanceId, 300000);
      expect(rebootCompleted).toBe(true);

      // Restore original schedule
      console.log('Restoring original EventBridge schedule...');
      updateEventBridgeSchedule(eventBridgeRuleName, originalSchedule);

      console.log('Test 2 completed: EventBridge manual trigger successfully rebooted instance');
    }, 420000); // 7 minute timeout (2 min wait + 5 min reboot)

    it('Test 3: EventBridge scheduled trigger invokes Lambda and reboots instance', async () => {
      if (!test1Passed) {
        console.log('⏭️  Skipping Test 3: Test 1 did not pass');
        return;
      }

      // Verify instance is running
      const initialState = getInstanceState(instanceId);
      expect(initialState).toBe('running');

      console.log(`Test 3: Testing EventBridge scheduled trigger...`);

      // Temporarily modify schedule to trigger in ~10 seconds (next minute boundary)
      const testSchedule = getScheduleInSeconds(10);
      console.log(`Temporarily setting EventBridge schedule to: ${testSchedule}`);
      
      const scheduleUpdated = updateEventBridgeSchedule(eventBridgeRuleName, testSchedule);
      expect(scheduleUpdated).toBe(true);

      // Verify schedule was updated
      const currentSchedule = getEventBridgeSchedule(eventBridgeRuleName);
      expect(currentSchedule).toBe(testSchedule);

      // Wait for the scheduled trigger (up to 70 seconds to account for minute boundary)
      const waitTime = 70 * 1000 + 5000; // 70 seconds + 5 second buffer
      const triggerStartTime = Math.floor(Date.now() / 1000);
      
      console.log(`Waiting up to ${waitTime / 1000} seconds for EventBridge scheduled trigger...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Verify Lambda was invoked by checking CloudWatch logs
      const logVerification = await verifyLambdaInvocation(lambdaFunctionName, triggerStartTime);
      expect(logVerification.success).toBe(true);
      if (!logVerification.success) {
        console.error('Lambda logs:', logVerification.logs);
        if (logVerification.hasError) {
          console.error('Errors:', logVerification.errorMessages);
        }
      }

      console.log('EventBridge scheduled trigger invoked Lambda, waiting for reboot...');

      // Wait for reboot to complete
      const rebootCompleted = await waitForReboot(instanceId, 300000);
      expect(rebootCompleted).toBe(true);

      // Restore original schedule
      console.log('Restoring original EventBridge schedule...');
      updateEventBridgeSchedule(eventBridgeRuleName, originalSchedule);

      // Verify schedule was restored
      const restoredSchedule = getEventBridgeSchedule(eventBridgeRuleName);
      expect(restoredSchedule).toBe(originalSchedule);

      console.log('Test 3 completed: EventBridge scheduled trigger successfully rebooted instance');
    }, 120000); // 2 minute timeout (70 sec wait + 5 min reboot max)
  });
});

