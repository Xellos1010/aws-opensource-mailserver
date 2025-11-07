import {
  CloudFormationClient,
  DescribeStackEventsCommand,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { fromIni } from '@aws-sdk/credential-providers';
import { getStackInfo, type StackInfoConfig } from '@mm/admin-stack-info';

export type StackEventsConfig = StackInfoConfig & {
  maxResults?: number;
  filterByResourceStatus?: string[]; // e.g., ['CREATE_FAILED', 'UPDATE_FAILED', 'DELETE_FAILED']
};

export type StackEvent = {
  timestamp: Date;
  resourceStatus?: string;
  resourceType?: string;
  logicalResourceId?: string;
  physicalResourceId?: string;
  resourceStatusReason?: string;
  stackName: string;
  eventId: string;
};

/**
 * Gets CloudFormation stack events, optionally filtered by status
 */
export async function getStackEvents(
  config: StackEventsConfig
): Promise<StackEvent[]> {
  const region = config.region || process.env['AWS_REGION'] || 'us-east-1';
  const profile = config.profile || process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
  const maxResults = config.maxResults || 100;

  // Get stack info to resolve stack name
  const stackInfo = await getStackInfo(config);
  const stackName = stackInfo.stackName;

  const credentials = fromIni({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });

  // First, check if stack exists and get its status
  let stackStatus: string | undefined;
  try {
    const stackResp = await cfClient.send(
      new DescribeStacksCommand({ StackName: stackName })
    );
    stackStatus = stackResp.Stacks?.[0]?.StackStatus;
  } catch (error) {
    throw new Error(`Stack ${stackName} not found or inaccessible: ${error}`);
  }

  const events: StackEvent[] = [];
  let nextToken: string | undefined;

  do {
    const command = nextToken
      ? new DescribeStackEventsCommand({
          StackName: stackName,
          NextToken: nextToken,
        })
      : new DescribeStackEventsCommand({ StackName: stackName });

    const response = await cfClient.send(command);

    if (response.StackEvents) {
      for (const event of response.StackEvents) {
        const stackEvent: StackEvent = {
          timestamp: event.Timestamp || new Date(),
          resourceStatus: event.ResourceStatus,
          resourceType: event.ResourceType,
          logicalResourceId: event.LogicalResourceId,
          physicalResourceId: event.PhysicalResourceId,
          resourceStatusReason: event.ResourceStatusReason,
          stackName: event.StackName || stackName,
          eventId: event.EventId || '',
        };

        // Apply filters if specified
        if (
          !config.filterByResourceStatus ||
          config.filterByResourceStatus.length === 0 ||
          (stackEvent.resourceStatus &&
            config.filterByResourceStatus.includes(stackEvent.resourceStatus))
        ) {
          events.push(stackEvent);
        }
      }
    }

    nextToken = response.NextToken;
  } while (nextToken && events.length < maxResults);

  // Sort by timestamp (newest first)
  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return events.slice(0, maxResults);
}

/**
 * Gets only failed events from a stack
 */
export async function getFailedStackEvents(
  config: StackEventsConfig
): Promise<StackEvent[]> {
  return getStackEvents({
    ...config,
    filterByResourceStatus: [
      'CREATE_FAILED',
      'UPDATE_FAILED',
      'DELETE_FAILED',
      'ROLLBACK_IN_PROGRESS',
      'ROLLBACK_COMPLETE',
      'ROLLBACK_FAILED',
    ],
  });
}

/**
 * Formats stack events for console output
 */
export function formatStackEvents(events: StackEvent[]): string {
  if (events.length === 0) {
    return 'No events found.';
  }

  const lines: string[] = [];
  lines.push('='.repeat(100));
  lines.push(`Stack Events (${events.length} total)`);
  lines.push('='.repeat(100));
  lines.push('');

  for (const event of events) {
    const timestamp = event.timestamp.toISOString();
    const status = event.resourceStatus || 'N/A';
    const resourceType = event.resourceType || 'N/A';
    const logicalId = event.logicalResourceId || 'N/A';
    const reason = event.resourceStatusReason || '';

    lines.push(`[${timestamp}] ${status}`);
    lines.push(`  Resource: ${resourceType} (${logicalId})`);
    if (event.physicalResourceId) {
      lines.push(`  Physical ID: ${event.physicalResourceId}`);
    }
    if (reason) {
      lines.push(`  Reason: ${reason}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

