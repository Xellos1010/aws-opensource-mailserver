import { type StackInfoConfig } from '@mm/admin-stack-info';
export type EmptyBucketsConfig = StackInfoConfig & {
    dryRun?: boolean;
};
export type BucketInfo = {
    bucketName: string;
    logicalId: string;
};
/**
 * Lists all S3 buckets in a CloudFormation stack
 */
export declare function listStackBuckets(stackName: string, region: string, profile: string): Promise<BucketInfo[]>;
/**
 * Empties an S3 bucket by deleting all object versions and delete markers
 */
export declare function emptyBucket(bucketName: string, region: string, profile: string, dryRun?: boolean): Promise<{
    versionsDeleted: number;
    markersDeleted: number;
}>;
/**
 * Empties all S3 buckets in a CloudFormation stack
 */
export declare function emptyStackBuckets(config: EmptyBucketsConfig): Promise<{
    buckets: BucketInfo[];
    results: Array<{
        bucket: string;
        versionsDeleted: number;
        markersDeleted: number;
    }>;
}>;
//# sourceMappingURL=empty-buckets.d.ts.map