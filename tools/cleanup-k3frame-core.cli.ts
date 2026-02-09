#!/usr/bin/env ts-node

/**
 * Cleanup script for k3frame core stack orphaned resources
 * 
 * This script removes all resources associated with the k3frame-com-mailserver-core stack
 * to prepare for a fresh deployment. It handles:
 * - CloudFormation stack deletion
 * - IAM roles
 * - Lambda functions
 * - S3 buckets (with versioning cleanup)
 * - SSM parameters
 * - CloudWatch log groups
 * - SNS topics
 * - SES domain identity
 * - Elastic IPs
 */

import {
  CloudFormationClient,
  DescribeStacksCommand,
  DeleteStackCommand,
  ListChangeSetsCommand,
  DeleteChangeSetCommand,
  DescribeChangeSetCommand,
  StackStatus,
} from '@aws-sdk/client-cloudformation';
import {
  IAMClient,
  DeleteRoleCommand,
  ListAttachedRolePoliciesCommand,
  DetachRolePolicyCommand,
  ListRolePoliciesCommand,
  DeleteRolePolicyCommand,
} from '@aws-sdk/client-iam';
import {
  LambdaClient,
  DeleteFunctionCommand,
} from '@aws-sdk/client-lambda';
import {
  S3Client,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
  DeleteBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import {
  SSMClient,
  DeleteParameterCommand,
} from '@aws-sdk/client-ssm';
import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  SNSClient,
  ListTopicsCommand,
  DeleteTopicCommand,
} from '@aws-sdk/client-sns';
import {
  SESClient,
  ListIdentitiesCommand,
  DeleteIdentityCommand,
} from '@aws-sdk/client-ses';
import {
  EC2Client,
  DescribeAddressesCommand,
  ReleaseAddressCommand,
} from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';

const STACK_NAME = 'k3frame-com-mailserver-core';
const DOMAIN = 'k3frame.com';
const REGION = process.env['AWS_REGION'] || 'us-east-1';
const PROFILE = process.env['AWS_PROFILE'] || 'k3frame';

interface CleanupResult {
  resourceType: string;
  resourceName: string;
  status: 'deleted' | 'not_found' | 'error';
  error?: string;
}

const results: CleanupResult[] = [];

async function logResult(result: CleanupResult): Promise<void> {
  results.push(result);
  const icon = result.status === 'deleted' ? '✅' : result.status === 'not_found' ? '⚪' : '❌';
  console.log(`${icon} ${result.resourceType}: ${result.resourceName} - ${result.status}`);
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
}

async function deleteCloudFormationStack(): Promise<void> {
  console.log('\n🗑️  Step 1: Checking CloudFormation Stack');
  console.log('─'.repeat(50));

  const cfClient = new CloudFormationClient({
    region: REGION,
    credentials: fromIni({ profile: PROFILE }),
  });

  try {
    const describeCmd = new DescribeStacksCommand({ StackName: STACK_NAME });
    const stack = await cfClient.send(describeCmd);
    const stackStatus = stack.Stacks?.[0]?.StackStatus;

    if (stackStatus) {
      console.log(`   Stack found with status: ${stackStatus}`);

      // Handle REVIEW_IN_PROGRESS state - delete pending changesets first
      if (stackStatus === StackStatus.REVIEW_IN_PROGRESS) {
        console.log('   ⚠️  Stack is in REVIEW_IN_PROGRESS - cleaning up changesets...');
        
        try {
          const listChangesetsCmd = new ListChangeSetsCommand({ StackName: STACK_NAME });
          const changesets = await cfClient.send(listChangesetsCmd);
          
          for (const changeset of changesets.Summaries || []) {
            if (changeset.ChangeSetName && changeset.Status === 'CREATE_PENDING' || changeset.Status === 'CREATE_IN_PROGRESS') {
              console.log(`   Deleting changeset: ${changeset.ChangeSetName}`);
              try {
                const deleteChangesetCmd = new DeleteChangeSetCommand({
                  StackName: STACK_NAME,
                  ChangeSetName: changeset.ChangeSetName,
                });
                await cfClient.send(deleteChangesetCmd);
                console.log(`   ✅ Deleted changeset: ${changeset.ChangeSetName}`);
              } catch (err: any) {
                console.log(`   ⚠️  Could not delete changeset ${changeset.ChangeSetName}: ${err.message}`);
              }
            }
          }
        } catch (err: any) {
          console.log(`   ⚠️  Could not list changesets: ${err.message}`);
        }

        // Wait a moment for changeset cleanup
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      // Don't delete if stack is in DELETE_IN_PROGRESS
      if (stackStatus === StackStatus.DELETE_IN_PROGRESS) {
        await logResult({
          resourceType: 'CloudFormation Stack',
          resourceName: STACK_NAME,
          status: 'error',
          error: 'Stack is already being deleted',
        });
        return;
      }

      // Delete the stack
      const deleteCmd = new DeleteStackCommand({ StackName: STACK_NAME });
      await cfClient.send(deleteCmd);
      await logResult({
        resourceType: 'CloudFormation Stack',
        resourceName: STACK_NAME,
        status: 'deleted',
      });
      console.log('   ⏳ Stack deletion initiated. Waiting for completion...');
      
      // Wait for stack deletion (with timeout)
      const maxWait = 300; // 5 minutes
      const startTime = Date.now();
      while (Date.now() - startTime < maxWait * 1000) {
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        try {
          const checkCmd = new DescribeStacksCommand({ StackName: STACK_NAME });
          await cfClient.send(checkCmd);
          // Stack still exists, continue waiting
        } catch (error: any) {
          if (error.name === 'ValidationError') {
            // Stack deleted
            console.log('   ✅ Stack deletion completed');
            return;
          }
          throw error;
        }
      }
      console.log('   ⚠️  Stack deletion still in progress (timeout reached)');
    }
  } catch (error: any) {
    if (error.name === 'ValidationError' && error.message?.includes('does not exist')) {
      await logResult({
        resourceType: 'CloudFormation Stack',
        resourceName: STACK_NAME,
        status: 'not_found',
      });
    } else {
      await logResult({
        resourceType: 'CloudFormation Stack',
        resourceName: STACK_NAME,
        status: 'error',
        error: error.message || String(error),
      });
    }
  }
}

async function deleteIAMRoles(): Promise<void> {
  console.log('\n🗑️  Step 2: Cleaning up IAM Roles');
  console.log('─'.repeat(50));

  const iamClient = new IAMClient({
    credentials: fromIni({ profile: PROFILE }),
  });

  const roleNames = [
    `ReverseDnsLambdaExecutionRole-${STACK_NAME}`,
    `SMTPLambdaExecutionRole-${STACK_NAME}`,
  ];

  for (const roleName of roleNames) {
    try {
      // List attached policies
      const attachedPoliciesCmd = new ListAttachedRolePoliciesCommand({ RoleName: roleName });
      const attachedPolicies = await iamClient.send(attachedPoliciesCmd);

      // Detach managed policies
      for (const policy of attachedPolicies.AttachedPolicies || []) {
        try {
          const detachCmd = new DetachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn: policy.PolicyArn!,
          });
          await iamClient.send(detachCmd);
        } catch (err) {
          // Ignore errors during detach
        }
      }

      // List and delete inline policies
      const inlinePoliciesCmd = new ListRolePoliciesCommand({ RoleName: roleName });
      const inlinePolicies = await iamClient.send(inlinePoliciesCmd);

      for (const policyName of inlinePolicies.PolicyNames || []) {
        try {
          const deletePolicyCmd = new DeleteRolePolicyCommand({
            RoleName: roleName,
            PolicyName: policyName,
          });
          await iamClient.send(deletePolicyCmd);
        } catch (err) {
          // Ignore errors during delete
        }
      }

      // Delete the role
      const deleteCmd = new DeleteRoleCommand({ RoleName: roleName });
      await iamClient.send(deleteCmd);
      await logResult({
        resourceType: 'IAM Role',
        resourceName: roleName,
        status: 'deleted',
      });
    } catch (error: any) {
      if (error.name === 'NoSuchEntity' || error.message?.includes('cannot be found')) {
        await logResult({
          resourceType: 'IAM Role',
          resourceName: roleName,
          status: 'not_found',
        });
      } else {
        await logResult({
          resourceType: 'IAM Role',
          resourceName: roleName,
          status: 'error',
          error: error.message || String(error),
        });
      }
    }
  }
}

async function deleteLambdaFunctions(): Promise<void> {
  console.log('\n🗑️  Step 3: Cleaning up Lambda Functions');
  console.log('─'.repeat(50));

  const lambdaClient = new LambdaClient({
    region: REGION,
    credentials: fromIni({ profile: PROFILE }),
  });

  const functionNames = [
    `ReverseDnsLambdaFunction-${STACK_NAME}`,
    `SMTPCredentialsLambdaFunction-${STACK_NAME}`,
  ];

  for (const functionName of functionNames) {
    try {
      const deleteCmd = new DeleteFunctionCommand({ FunctionName: functionName });
      await lambdaClient.send(deleteCmd);
      await logResult({
        resourceType: 'Lambda Function',
        resourceName: functionName,
        status: 'deleted',
      });
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        await logResult({
          resourceType: 'Lambda Function',
          resourceName: functionName,
          status: 'not_found',
        });
      } else {
        await logResult({
          resourceType: 'Lambda Function',
          resourceName: functionName,
          status: 'error',
          error: error.message || String(error),
        });
      }
    }
  }
}

async function deleteS3Buckets(): Promise<void> {
  console.log('\n🗑️  Step 4: Cleaning up S3 Buckets');
  console.log('─'.repeat(50));

  const s3Client = new S3Client({
    region: REGION,
    credentials: fromIni({ profile: PROFILE }),
  });

  const bucketNames = [`${DOMAIN}-backup`, `${DOMAIN}-nextcloud`];

  for (const bucketName of bucketNames) {
    try {
      // Check if bucket exists
      try {
        const headCmd = new HeadBucketCommand({ Bucket: bucketName });
        await s3Client.send(headCmd);
      } catch (headError: any) {
        // Bucket doesn't exist, not accessible, or forbidden (likely deleted)
        const httpStatus = headError.$metadata?.httpStatusCode;
        if (
          headError.name === 'NotFound' ||
          httpStatus === 404 ||
          httpStatus === 403 ||
          headError.message?.includes('does not exist') ||
          headError.message?.includes('Forbidden')
        ) {
          await logResult({
            resourceType: 'S3 Bucket',
            resourceName: bucketName,
            status: 'not_found',
          });
          continue;
        }
        // Re-throw if it's a different error
        throw headError;
      }

      console.log(`   Emptying bucket: ${bucketName}`);

      // List and delete all object versions
      let nextKeyMarker: string | undefined;
      let nextVersionIdMarker: string | undefined;
      let deletedCount = 0;

      do {
        const listCmd = new ListObjectVersionsCommand({
          Bucket: bucketName,
          KeyMarker: nextKeyMarker,
          VersionIdMarker: nextVersionIdMarker,
        });
        const listResult = await s3Client.send(listCmd);

        // Delete object versions in batches
        if (listResult.Versions && listResult.Versions.length > 0) {
          const objectsToDelete = listResult.Versions.map((version) => ({
            Key: version.Key!,
            VersionId: version.VersionId,
          }));

          try {
            const deleteCmd = new DeleteObjectsCommand({
              Bucket: bucketName,
              Delete: {
                Objects: objectsToDelete,
                Quiet: true,
              },
            });
            await s3Client.send(deleteCmd);
            deletedCount += objectsToDelete.length;
          } catch (err) {
            // Continue on error
          }
        }

        // Delete delete markers in batches
        if (listResult.DeleteMarkers && listResult.DeleteMarkers.length > 0) {
          const markersToDelete = listResult.DeleteMarkers.map((marker) => ({
            Key: marker.Key!,
            VersionId: marker.VersionId,
          }));

          try {
            const deleteCmd = new DeleteObjectsCommand({
              Bucket: bucketName,
              Delete: {
                Objects: markersToDelete,
                Quiet: true,
              },
            });
            await s3Client.send(deleteCmd);
            deletedCount += markersToDelete.length;
          } catch (err) {
            // Continue on error
          }
        }

        nextKeyMarker = listResult.NextKeyMarker;
        nextVersionIdMarker = listResult.NextVersionIdMarker;
      } while (nextKeyMarker || nextVersionIdMarker);

      console.log(`   Deleted ${deletedCount} object versions`);

      // Delete the bucket
      const deleteBucketCmd = new DeleteBucketCommand({ Bucket: bucketName });
      await s3Client.send(deleteBucketCmd);
      await logResult({
        resourceType: 'S3 Bucket',
        resourceName: bucketName,
        status: 'deleted',
      });
    } catch (error: any) {
      const errorCode = error.name || error.Code;
      const httpStatus = error.$metadata?.httpStatusCode;
      
      if (errorCode === 'NotFound' || httpStatus === 404 || error.message?.includes('does not exist')) {
        await logResult({
          resourceType: 'S3 Bucket',
          resourceName: bucketName,
          status: 'not_found',
        });
      } else {
        // Log the full error for debugging
        const errorMsg = error.message || error.Code || String(error);
        await logResult({
          resourceType: 'S3 Bucket',
          resourceName: bucketName,
          status: 'error',
          error: errorMsg,
        });
      }
    }
  }
}

async function deleteSSMParameters(): Promise<void> {
  console.log('\n🗑️  Step 5: Cleaning up SSM Parameters');
  console.log('─'.repeat(50));

  const ssmClient = new SSMClient({
    region: REGION,
    credentials: fromIni({ profile: PROFILE }),
  });

  const paramPaths = [
    '/k3frame/core/domainName',
    '/k3frame/core/backupBucket',
    '/k3frame/core/nextcloudBucket',
    '/k3frame/core/alarmsTopicArn',
    '/k3frame/core/sesIdentityArn',
    '/k3frame/core/eipAllocationId',
    `/cwagent-linux-${STACK_NAME}`,
    `smtp-username-${STACK_NAME}`,
    `smtp-password-${STACK_NAME}`,
  ];

  for (const paramPath of paramPaths) {
    try {
      const deleteCmd = new DeleteParameterCommand({ Name: paramPath });
      await ssmClient.send(deleteCmd);
      await logResult({
        resourceType: 'SSM Parameter',
        resourceName: paramPath,
        status: 'deleted',
      });
    } catch (error: any) {
      if (error.name === 'ParameterNotFound') {
        await logResult({
          resourceType: 'SSM Parameter',
          resourceName: paramPath,
          status: 'not_found',
        });
      } else {
        await logResult({
          resourceType: 'SSM Parameter',
          resourceName: paramPath,
          status: 'error',
          error: error.message || String(error),
        });
      }
    }
  }
}

async function deleteCloudWatchLogGroups(): Promise<void> {
  console.log('\n🗑️  Step 6: Cleaning up CloudWatch Log Groups');
  console.log('─'.repeat(50));

  const logsClient = new CloudWatchLogsClient({
    region: REGION,
    credentials: fromIni({ profile: PROFILE }),
  });

  const logGroupNames = [
    `/ec2/syslog-${STACK_NAME}`,
    `/aws/lambda/ReverseDnsLambdaFunction-${STACK_NAME}`,
    `/aws/lambda/SMTPCredentialsLambdaFunction-${STACK_NAME}`,
  ];

  for (const logGroupName of logGroupNames) {
    try {
      const deleteCmd = new DeleteLogGroupCommand({ logGroupName });
      await logsClient.send(deleteCmd);
      await logResult({
        resourceType: 'CloudWatch Log Group',
        resourceName: logGroupName,
        status: 'deleted',
      });
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        await logResult({
          resourceType: 'CloudWatch Log Group',
          resourceName: logGroupName,
          status: 'not_found',
        });
      } else {
        await logResult({
          resourceType: 'CloudWatch Log Group',
          resourceName: logGroupName,
          status: 'error',
          error: error.message || String(error),
        });
      }
    }
  }
}

async function deleteSNSTopics(): Promise<void> {
  console.log('\n🗑️  Step 7: Cleaning up SNS Topics');
  console.log('─'.repeat(50));

  const snsClient = new SNSClient({
    region: REGION,
    credentials: fromIni({ profile: PROFILE }),
  });

  const topicName = `ec2-memory-events-${STACK_NAME}`;

  try {
    // List all topics to find the one matching our name
    const listCmd = new ListTopicsCommand({});
    const topics = await snsClient.send(listCmd);

    const topicArn = topics.Topics?.find((t: { TopicArn?: string }) => t.TopicArn?.includes(topicName))?.TopicArn;

    if (topicArn) {
      const deleteCmd = new DeleteTopicCommand({ TopicArn: topicArn });
      await snsClient.send(deleteCmd);
      await logResult({
        resourceType: 'SNS Topic',
        resourceName: topicName,
        status: 'deleted',
      });
    } else {
      await logResult({
        resourceType: 'SNS Topic',
        resourceName: topicName,
        status: 'not_found',
      });
    }
  } catch (error: any) {
    await logResult({
      resourceType: 'SNS Topic',
      resourceName: topicName,
      status: 'error',
      error: error.message || String(error),
    });
  }
}

async function deleteSESIdentity(): Promise<void> {
  console.log('\n🗑️  Step 8: Cleaning up SES Domain Identity');
  console.log('─'.repeat(50));

  const sesClient = new SESClient({
    region: REGION,
    credentials: fromIni({ profile: PROFILE }),
  });

  try {
    const listCmd = new ListIdentitiesCommand({});
    const identities = await sesClient.send(listCmd);

    if (identities.Identities?.includes(DOMAIN)) {
      const deleteCmd = new DeleteIdentityCommand({ Identity: DOMAIN });
      await sesClient.send(deleteCmd);
      await logResult({
        resourceType: 'SES Domain Identity',
        resourceName: DOMAIN,
        status: 'deleted',
      });
    } else {
      await logResult({
        resourceType: 'SES Domain Identity',
        resourceName: DOMAIN,
        status: 'not_found',
      });
    }
  } catch (error: any) {
    await logResult({
      resourceType: 'SES Domain Identity',
      resourceName: DOMAIN,
      status: 'error',
      error: error.message || String(error),
    });
  }
}

async function releaseElasticIPs(): Promise<void> {
  console.log('\n🗑️  Step 9: Cleaning up Elastic IPs');
  console.log('─'.repeat(50));

  const ec2Client = new EC2Client({
    region: REGION,
    credentials: fromIni({ profile: PROFILE }),
  });

  try {
    const describeCmd = new DescribeAddressesCommand({});
    const addresses = await ec2Client.send(describeCmd);

    const k3frameEIPs = addresses.Addresses?.filter(
      (addr) => addr.Tags?.some((tag) => tag.Key === 'MAILSERVER' && tag.Value === DOMAIN)
    );

    if (k3frameEIPs && k3frameEIPs.length > 0) {
      for (const eip of k3frameEIPs) {
        if (eip.AllocationId) {
          try {
            const releaseCmd = new ReleaseAddressCommand({ AllocationId: eip.AllocationId });
            await ec2Client.send(releaseCmd);
            await logResult({
              resourceType: 'Elastic IP',
              resourceName: eip.AllocationId,
              status: 'deleted',
            });
          } catch (error: any) {
            await logResult({
              resourceType: 'Elastic IP',
              resourceName: eip.AllocationId,
              status: 'error',
              error: error.message || String(error),
            });
          }
        }
      }
    } else {
      await logResult({
        resourceType: 'Elastic IP',
        resourceName: `tagged with MAILSERVER=${DOMAIN}`,
        status: 'not_found',
      });
    }
  } catch (error: any) {
    await logResult({
      resourceType: 'Elastic IP',
      resourceName: 'query',
      status: 'error',
      error: error.message || String(error),
    });
  }
}

async function main(): Promise<void> {
  console.log('🧹 K3Frame Core Stack Cleanup');
  console.log('═'.repeat(50));
  console.log(`Stack: ${STACK_NAME}`);
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Region: ${REGION}`);
  console.log(`Profile: ${PROFILE}`);
  console.log('═'.repeat(50));

  try {
    await deleteCloudFormationStack();
    await deleteIAMRoles();
    await deleteLambdaFunctions();
    await deleteS3Buckets();
    await deleteSSMParameters();
    await deleteCloudWatchLogGroups();
    await deleteSNSTopics();
    await deleteSESIdentity();
    await releaseElasticIPs();

    // Summary
    console.log('\n📊 Cleanup Summary');
    console.log('═'.repeat(50));
    const deleted = results.filter((r) => r.status === 'deleted').length;
    const notFound = results.filter((r) => r.status === 'not_found').length;
    const errors = results.filter((r) => r.status === 'error').length;

    console.log(`✅ Deleted: ${deleted}`);
    console.log(`⚪ Not Found: ${notFound}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📦 Total: ${results.length}`);

    if (errors > 0) {
      console.log('\n⚠️  Errors encountered:');
      results
        .filter((r) => r.status === 'error')
        .forEach((r) => {
          console.log(`   ${r.resourceType}: ${r.resourceName}`);
          console.log(`      ${r.error}`);
        });
      process.exit(1);
    } else {
      console.log('\n✅ Cleanup completed successfully!');
      process.exit(0);
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error during cleanup:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

