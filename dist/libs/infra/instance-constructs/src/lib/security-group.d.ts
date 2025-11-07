import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
/**
 * Creates a security group for Mail-in-a-Box instances
 */
export declare function createMailServerSecurityGroup(scope: Construct, id: string, vpc: ec2.IVpc): ec2.SecurityGroup;
