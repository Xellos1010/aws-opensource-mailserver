import { SSMClient, SendCommandCommand } from '@aws-sdk/client-ssm';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import * as fs from 'fs';
import * as path from 'path';
import { toMailserverInstanceStackName } from '@mm/infra-naming';

export async function runMiaBSetupForDomain(domain: string, region: string) {
  const stackName = toMailserverInstanceStackName(domain);
  const cf = new CloudFormationClient({ region });
  const ssm = new SSMClient({ region });

  // get InstanceId + outputs
  const stacks = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
  const outputs = Object.fromEntries((stacks.Stacks?.[0].Outputs||[]).map(o => [o.OutputKey!, o.OutputValue!]));
  const instanceId = outputs['InstanceId'];
  const instanceDns = outputs['InstanceDns'];

  if (!instanceId) throw new Error(`InstanceId output not found on stack ${stackName}`);

  // Note: This function is deprecated - use instance-bootstrap library instead
  // The MIAB setup script is now in libs/support-scripts/aws/instance-bootstrap/assets/miab-setup.sh
  throw new Error('This function is deprecated. Use instance-bootstrap library instead. See libs/support-scripts/aws/instance-bootstrap/');
}
