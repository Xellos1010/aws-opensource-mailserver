import {
  KMSClient,
  EnableKeyRotationCommand,
  DisableKeyRotationCommand,
  GetKeyRotationStatusCommand,
} from '@aws-sdk/client-kms';

const kms = new KMSClient({});

export const enableRotation = async (keyId: string) =>
  kms.send(new EnableKeyRotationCommand({ KeyId: keyId }));

export const disableRotation = async (keyId: string) =>
  kms.send(new DisableKeyRotationCommand({ KeyId: keyId }));

export const rotationStatus = async (keyId: string) =>
  kms.send(new GetKeyRotationStatusCommand({ KeyId: keyId }));

if (require.main === module) {
  const [, , cmd, keyId] = process.argv;
  if (!cmd || !keyId) {
    console.error('usage: kms <enable|disable|status> <keyId>');
    process.exit(2);
  }

  (async () => {
    if (cmd === 'enable') await enableRotation(keyId);
    else if (cmd === 'disable') await disableRotation(keyId);
    else if (cmd === 'status') console.log(await rotationStatus(keyId));
    else throw new Error('unknown cmd');

    console.log('ok');
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

