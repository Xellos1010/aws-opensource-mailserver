import { type StackInfoConfig } from '@mm/admin-stack-info';
export type StackEventsConfig = StackInfoConfig & {
    maxResults?: number;
    filterByResourceStatus?: string[];
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
export declare function getStackEvents(config: StackEventsConfig): Promise<StackEvent[]>;
/**
 * Gets only failed events from a stack
 */
export declare function getFailedStackEvents(config: StackEventsConfig): Promise<StackEvent[]>;
/**
 * Formats stack events for console output
 */
export declare function formatStackEvents(events: StackEvent[]): string;
//# sourceMappingURL=stack-events.d.ts.map