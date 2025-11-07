export declare const enableRotation: (keyId: string) => Promise<import("@aws-sdk/client-kms").EnableKeyRotationCommandOutput>;
export declare const disableRotation: (keyId: string) => Promise<import("@aws-sdk/client-kms").DisableKeyRotationCommandOutput>;
export declare const rotationStatus: (keyId: string) => Promise<import("@aws-sdk/client-kms").GetKeyRotationStatusCommandOutput>;
