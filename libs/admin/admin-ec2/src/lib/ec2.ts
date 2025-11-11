import {
  EC2Client,
  RebootInstancesCommand,
  StopInstancesCommand,
  StartInstancesCommand,
  ModifyInstanceAttributeCommand,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';

function createEC2Client() {
  const region = process.env['AWS_REGION'] || 'us-east-1';
  const profile = process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
  const credentials = fromIni({ profile });
  return new EC2Client({ region, credentials });
}

export const restart = async (id: string) => {
  const ec2 = createEC2Client();
  return ec2.send(new RebootInstancesCommand({ InstanceIds: [id] }));
};

export const stop = async (id: string) => {
  const ec2 = createEC2Client();
  return ec2.send(new StopInstancesCommand({ InstanceIds: [id] }));
};

export const start = async (id: string) => {
  const ec2 = createEC2Client();
  return ec2.send(new StartInstancesCommand({ InstanceIds: [id] }));
};

export const changeType = async (id: string, instanceType: string) => {
  const ec2 = createEC2Client();
  return ec2.send(
    new ModifyInstanceAttributeCommand({
      InstanceId: id,
      InstanceType: { Value: instanceType },
    })
  );
};

/**
 * Get the current state of an EC2 instance
 */
async function getInstanceState(id: string): Promise<string> {
  const ec2 = createEC2Client();
  const response = await ec2.send(
    new DescribeInstancesCommand({ InstanceIds: [id] })
  );
  const instance = response.Reservations?.[0]?.Instances?.[0];
  if (!instance) {
    throw new Error(`Instance ${id} not found`);
  }
  return instance.State?.Name || 'unknown';
}

/**
 * Wait for instance to reach desired state
 */
async function waitForState(
  id: string,
  desiredState: string,
  timeoutMs: number = 600000 // 10 minutes default
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 10000; // Check every 10 seconds

  console.log(`Waiting for instance ${id} to reach state: ${desiredState}`);

  while (Date.now() - startTime < timeoutMs) {
    const currentState = await getInstanceState(id);

    if (currentState === desiredState) {
      console.log(`Instance ${id} is now in ${desiredState} state`);
      return;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000 / 60);
    console.log(
      `Current state: ${currentState}. Waiting... (${elapsed} minutes elapsed)`
    );

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  throw new Error(
    `Timeout waiting for instance ${id} to reach ${desiredState} state after ${timeoutMs / 1000 / 60} minutes`
  );
}

/**
 * Stop instance, wait for stopped state, then start instance and wait for running state
 */
export async function stopAndStart(id: string): Promise<void> {
  console.log(`Stopping and restarting instance ${id}...`);

  // Check current state
  let currentState = await getInstanceState(id);
  console.log(`Current instance state: ${currentState}`);

  // Stop the instance if it's running or stopping
  const ec2 = createEC2Client();
  if (currentState === 'running') {
    console.log(`Stopping instance ${id}...`);
    await ec2.send(new StopInstancesCommand({ InstanceIds: [id] }));
    await waitForState(id, 'stopped');
  } else if (currentState === 'stopping') {
    console.log(`Instance ${id} is already stopping. Waiting for stopped state...`);
    await waitForState(id, 'stopped');
  } else if (currentState === 'stopped') {
    console.log(`Instance ${id} is already stopped`);
  } else {
    throw new Error(
      `Cannot stop instance ${id} from ${currentState} state. Must be running or stopping.`
    );
  }

  // Start the instance
  currentState = await getInstanceState(id);
  if (currentState === 'stopped') {
    console.log(`Starting instance ${id}...`);
    await ec2.send(new StartInstancesCommand({ InstanceIds: [id] }));
    await waitForState(id, 'running', 900000); // 15 minutes for starting
  } else if (currentState === 'pending') {
    console.log(`Instance ${id} is already starting. Waiting for running state...`);
    await waitForState(id, 'running', 900000);
  } else if (currentState === 'running') {
    console.log(`Instance ${id} is already running`);
  } else {
    throw new Error(
      `Cannot start instance ${id} from ${currentState} state. Must be stopped or pending.`
    );
  }

  console.log(`✅ Instance ${id} stop-and-start completed successfully`);
}

// CommonJS entry point check (only for direct execution, not ES modules)
if (
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  require.main === module
) {
  const [, , cmd, id, arg] = process.argv;
  if (!cmd || !id) {
    console.error(
      'usage: ec2 <restart|stop|start|type> <instanceId> [t3.medium]'
    );
    process.exit(2);
  }

  (async () => {
    if (cmd === 'restart') await restart(id);
    else if (cmd === 'stop') await stop(id);
    else if (cmd === 'start') await start(id);
    else if (cmd === 'type') await changeType(id, arg!);
    else throw new Error('unknown command');

    console.log(`ok: ${cmd} ${id} ${arg ?? ''}`.trim());
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

