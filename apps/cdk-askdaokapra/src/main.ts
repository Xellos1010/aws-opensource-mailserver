#!/usr/bin/env node

import { App, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';

class AskDaoKapraBaseStack extends Stack {
  constructor(app: App, id: string, p?: StackProps) {
    super(app, id, p);

    new CfnOutput(this, 'Bootstrap', { value: '{placeholder: true}' });
  }
}

const app = new App();

new AskDaoKapraBaseStack(app, 'AskDaoKapraBaseStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Ask Dao Kapra Base Stack - Domain/DNS/SES/CDK scaffold',
});

app.synth();

