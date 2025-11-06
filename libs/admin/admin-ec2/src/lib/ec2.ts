import {
  EC2Client,
  RebootInstancesCommand,
  StopInstancesCommand,
  StartInstancesCommand,
  ModifyInstanceAttributeCommand,
} from '@aws-sdk/client-ec2';

const ec2 = new EC2Client({});

export const restart = async (id: string) =>
  ec2.send(new RebootInstancesCommand({ InstanceIds: [id] }));

export const stop = async (id: string) =>
  ec2.send(new StopInstancesCommand({ InstanceIds: [id] }));

export const start = async (id: string) =>
  ec2.send(new StartInstancesCommand({ InstanceIds: [id] }));

export const changeType = async (id: string, instanceType: string) =>
  ec2.send(
    new ModifyInstanceAttributeCommand({
      InstanceId: id,
      InstanceType: { Value: instanceType },
    })
  );

if (require.main === module) {
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

