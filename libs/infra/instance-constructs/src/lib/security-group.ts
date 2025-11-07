import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Creates a security group for Mail-in-a-Box instances
 */
export function createMailServerSecurityGroup(
  scope: Construct,
  id: string,
  vpc: ec2.IVpc
): ec2.SecurityGroup {
  const sg = new ec2.SecurityGroup(scope, id, {
    vpc,
    allowAllOutbound: true,
    description: 'Security Group for Mail-in-a-box Instance',
  });

  // Standard mail server ports
  sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH');
  sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(53), 'DNS (TCP)');
  sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(53), 'DNS (UDP)');
  sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
  sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
  sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(25), 'SMTP (STARTTLS)');
  sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(143), 'IMAP (STARTTLS)');
  sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(993), 'IMAPS');
  sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(465), 'SMTPS');
  sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(587), 'SMTP Submission');
  sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(4190), 'Sieve Mail filtering');

  return sg;
}
