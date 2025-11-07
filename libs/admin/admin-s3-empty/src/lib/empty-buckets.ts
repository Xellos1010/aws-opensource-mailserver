import {
  CloudFormationClient,
  ListStackResourcesCommand,
  DescribeStackResourcesCommand,
} from '@aws-sdk/client-cloudformation';
import {
  S3Client,
  ListObjectVersionsCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-providers';
import { getStackInfo, type StackInfoConfig } from '@mm/admin-stack-info';

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
export async function listStackBuckets(
  stackName: string,
  region: string,
  profile: string
): Promise<BucketInfo[]> {
  const credentials = fromIni({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });

  const buckets: BucketInfo[] = [];
  let nextToken: string | undefined;

  do {
    const command = nextToken
      ? new ListStackResourcesCommand({
          StackName: stackName,
          NextToken: nextToken,
        })
      : new ListStackResourcesCommand({ StackName: stackName });

    const response = await cfClient.send(command);

    if (response.StackResourceSummaries) {
      for (const resource of response.StackResourceSummaries) {
        if (resource.ResourceType === 'AWS::S3::Bucket') {
          // Get the physical resource ID (bucket name)
          const describeCommand = new DescribeStackResourcesCommand({
            StackName: stackName,
            LogicalResourceId: resource.LogicalResourceId,
          });
          const describeResponse = await cfClient.send(describeCommand);
          const physicalId = describeResponse.StackResources?.[0]?.PhysicalResourceId;

          if (physicalId) {
            buckets.push({
              bucketName: physicalId,
              logicalId: resource.LogicalResourceId || 'Unknown',
            });
          }
        }
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return buckets;
}

/**
 * Empties an S3 bucket by deleting all object versions and delete markers
 */
export async function emptyBucket(
  bucketName: string,
  region: string,
  profile: string,
  dryRun: boolean = false
): Promise<{ versionsDeleted: number; markersDeleted: number }> {
  const credentials = fromIni({ profile });
  const s3Client = new S3Client({ region, credentials });

  let versionsDeleted = 0;
  let markersDeleted = 0;
  let nextKeyMarker: string | undefined;
  let nextVersionIdMarker: string | undefined;

  console.log(`  ${dryRun ? '[DRY RUN] ' : ''}Emptying bucket: ${bucketName}`);

  do {
    const command = new ListObjectVersionsCommand({
      Bucket: bucketName,
      KeyMarker: nextKeyMarker,
      VersionIdMarker: nextVersionIdMarker,
    });

    const response = await s3Client.send(command);

    // Delete object versions
    if (response.Versions && response.Versions.length > 0) {
      const objectsToDelete = response.Versions.map((version) => ({
        Key: version.Key!,
        VersionId: version.VersionId,
      }));

      if (!dryRun) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true,
          },
        });
        await s3Client.send(deleteCommand);
      }

      versionsDeleted += objectsToDelete.length;
      console.log(
        `    ${dryRun ? '[DRY RUN] ' : ''}Deleted ${objectsToDelete.length} object version(s)`
      );
    }

    // Delete delete markers
    if (response.DeleteMarkers && response.DeleteMarkers.length > 0) {
      const markersToDelete = response.DeleteMarkers.map((marker) => ({
        Key: marker.Key!,
        VersionId: marker.VersionId,
      }));

      if (!dryRun) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: markersToDelete,
            Quiet: true,
          },
        });
        await s3Client.send(deleteCommand);
      }

      markersDeleted += markersToDelete.length;
      console.log(
        `    ${dryRun ? '[DRY RUN] ' : ''}Deleted ${markersToDelete.length} delete marker(s)`
      );
    }

    nextKeyMarker = response.NextKeyMarker;
    nextVersionIdMarker = response.NextVersionIdMarker;
  } while (nextKeyMarker || nextVersionIdMarker);

  return { versionsDeleted, markersDeleted };
}

/**
 * Empties all S3 buckets in a CloudFormation stack
 */
export async function emptyStackBuckets(
  config: EmptyBucketsConfig
): Promise<{ buckets: BucketInfo[]; results: Array<{ bucket: string; versionsDeleted: number; markersDeleted: number }> }> {
  const region = config.region || process.env['AWS_REGION'] || 'us-east-1';
  const profile = config.profile || process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
  const dryRun = config.dryRun ?? false;

  // Get stack info to resolve stack name
  const stackInfo = await getStackInfo(config);
  const stackName = stackInfo.stackName;

  console.log(`Finding S3 buckets in stack: ${stackName}`);
  console.log(`Region: ${region}, Profile: ${profile}`);
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No buckets will be emptied');
  }
  console.log('');

  // List all S3 buckets in the stack
  const buckets = await listStackBuckets(stackName, region, profile);

  if (buckets.length === 0) {
    console.log('No S3 buckets found in stack.');
    return { buckets: [], results: [] };
  }

  console.log(`Found ${buckets.length} S3 bucket(s):`);
  for (const bucket of buckets) {
    console.log(`  - ${bucket.bucketName} (${bucket.logicalId})`);
  }
  console.log('');

  // Empty each bucket
  const results: Array<{ bucket: string; versionsDeleted: number; markersDeleted: number }> = [];

  for (const bucket of buckets) {
    try {
      const result = await emptyBucket(bucket.bucketName, region, profile, dryRun);
      results.push({
        bucket: bucket.bucketName,
        versionsDeleted: result.versionsDeleted,
        markersDeleted: result.markersDeleted,
      });
      console.log(
        `  ✅ Completed: ${result.versionsDeleted} versions, ${result.markersDeleted} markers`
      );
    } catch (error) {
      console.error(`  ❌ Failed to empty bucket ${bucket.bucketName}:`, error);
      results.push({
        bucket: bucket.bucketName,
        versionsDeleted: 0,
        markersDeleted: 0,
      });
    }
    console.log('');
  }

  return { buckets, results };
}

