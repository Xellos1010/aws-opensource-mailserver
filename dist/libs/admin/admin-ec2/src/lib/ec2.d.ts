export declare const restart: (id: string) => Promise<import("@aws-sdk/client-ec2").RebootInstancesCommandOutput>;
export declare const stop: (id: string) => Promise<import("@aws-sdk/client-ec2").StopInstancesCommandOutput>;
export declare const start: (id: string) => Promise<import("@aws-sdk/client-ec2").StartInstancesCommandOutput>;
export declare const changeType: (id: string, instanceType: string) => Promise<import("@aws-sdk/client-ec2").ModifyInstanceAttributeCommandOutput>;
