import { Tags } from 'aws-cdk-lib';
/**
 * Tags a CDK stack with standard application tags
 * @param stack - The CDK stack to tag
 * @param app - Application name
 */
export function tagStack(stack, app) {
    Tags.of(stack).add('App', app);
    Tags.of(stack).add('ManagedBy', 'Nx+CDK');
    Tags.of(stack).add('Environment', process.env['ENVIRONMENT'] || 'dev');
}
//# sourceMappingURL=tags.js.map