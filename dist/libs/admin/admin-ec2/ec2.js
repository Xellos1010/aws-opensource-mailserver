var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// libs/admin/admin-ec2/src/lib/ec2.ts
import {
  EC2Client,
  RebootInstancesCommand,
  StopInstancesCommand,
  StartInstancesCommand,
  ModifyInstanceAttributeCommand
} from "@aws-sdk/client-ec2";
var ec2 = new EC2Client({});
var restart = async (id) => ec2.send(new RebootInstancesCommand({ InstanceIds: [id] }));
var stop = async (id) => ec2.send(new StopInstancesCommand({ InstanceIds: [id] }));
var start = async (id) => ec2.send(new StartInstancesCommand({ InstanceIds: [id] }));
var changeType = async (id, instanceType) => ec2.send(
  new ModifyInstanceAttributeCommand({
    InstanceId: id,
    InstanceType: { Value: instanceType }
  })
);
if (__require.main === module) {
  const [, , cmd, id, arg] = process.argv;
  if (!cmd || !id) {
    console.error(
      "usage: ec2 <restart|stop|start|type> <instanceId> [t3.medium]"
    );
    process.exit(2);
  }
  (async () => {
    if (cmd === "restart")
      await restart(id);
    else if (cmd === "stop")
      await stop(id);
    else if (cmd === "start")
      await start(id);
    else if (cmd === "type")
      await changeType(id, arg);
    else
      throw new Error("unknown command");
    console.log(`ok: ${cmd} ${id} ${arg ?? ""}`.trim());
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
export {
  changeType,
  restart,
  start,
  stop
};
