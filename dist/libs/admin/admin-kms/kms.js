var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// libs/admin/admin-kms/src/lib/kms.ts
import {
  KMSClient,
  EnableKeyRotationCommand,
  DisableKeyRotationCommand,
  GetKeyRotationStatusCommand
} from "@aws-sdk/client-kms";
var kms = new KMSClient({});
var enableRotation = async (keyId) => kms.send(new EnableKeyRotationCommand({ KeyId: keyId }));
var disableRotation = async (keyId) => kms.send(new DisableKeyRotationCommand({ KeyId: keyId }));
var rotationStatus = async (keyId) => kms.send(new GetKeyRotationStatusCommand({ KeyId: keyId }));
if (__require.main === module) {
  const [, , cmd, keyId] = process.argv;
  if (!cmd || !keyId) {
    console.error("usage: kms <enable|disable|status> <keyId>");
    process.exit(2);
  }
  (async () => {
    if (cmd === "enable")
      await enableRotation(keyId);
    else if (cmd === "disable")
      await disableRotation(keyId);
    else if (cmd === "status")
      console.log(await rotationStatus(keyId));
    else
      throw new Error("unknown cmd");
    console.log("ok");
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
export {
  disableRotation,
  enableRotation,
  rotationStatus
};
