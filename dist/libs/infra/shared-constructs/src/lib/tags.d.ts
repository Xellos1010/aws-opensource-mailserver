import type { Stack } from 'aws-cdk-lib';
/**
 * Tags a CDK stack with standard application tags
 * @param stack - The CDK stack to tag
 * @param app - Application name
 */
export declare function tagStack(stack: Stack, app: string): void;
