#!/usr/bin/env node

import { App, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';

interface Ec2MailServerStackProps extends StackProps {
  domainName?: string;
  instanceType?: string;
}

class Ec2MailServerStack extends Stack {
  constructor(scope: App, id: string, props?: Ec2MailServerStackProps) {
    super(scope, id, props);

    // TODO: Recreate EC2 resources currently in CloudFormation (split from monolith).
    // This will include:
    // - EC2 Instance with Mail-in-a-Box
    // - Security Groups
    // - Elastic IP
    // - IAM Role and Instance Profile
    // - User Data script for MIAB installation
    // - CloudWatch Alarms for memory/disk
    // - SNS Topics for alerts

    new CfnOutput(this, 'Placeholder', {
      value: 'EC2 split stack scaffolded - ready for implementation',
      description: 'Placeholder output indicating CDK stack is scaffolded',
    });
  }
}

const app = new App();

new Ec2MailServerStack(app, 'Ec2MailServerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'EC2 Mail Server Stack - Split from CloudFormation monolith',
});

app.synth();
