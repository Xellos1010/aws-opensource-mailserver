#!/usr/bin/env node

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

const stackName = process.argv[2];

if (!stackName) {
  console.error('Usage: cfn-outputs <stack-name>');
  process.exit(1);
}

(async () => {
  try {
    const cfn = new CloudFormationClient({});
    const output = await cfn.send(
      new DescribeStacksCommand({ StackName: stackName })
    );
    const stack = output.Stacks?.[0];

    if (!stack) {
      console.error(`Stack ${stackName} not found`);
      process.exit(1);
    }

    console.log(JSON.stringify(stack.Outputs ?? [], null, 2));
  } catch (error) {
    console.error(
      'Error:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
})();

