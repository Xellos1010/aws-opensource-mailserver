#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { fromIni } from '@aws-sdk/credential-providers';

interface CheckSesStatusOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

interface SesStatus {
  identity: string;
  verificationStatus: 'Success' | 'Pending' | 'Failed' | 'TemporaryFailure' | 'NotStarted';
  dkimEnabled: boolean;
  dkimVerificationStatus: 'Success' | 'Pending' | 'Failed' | 'TemporaryFailure' | 'NotStarted';
  mailFromDomain?: string;
  mailFromVerificationStatus?: 'Success' | 'Pending' | 'Failed' | 'TemporaryFailure' | 'NotStarted';
  dkimTokens?: string[];
}

/**
 * Check SES identity status
 */
async function checkSesStatus(options: CheckSesStatusOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('📧 Check SES Status');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

  try {
    // Get stack info to get domain
    const stackInfo = await getStackInfoFromApp(appPath, {
      domain,
      region,
      profile,
    });

    const domainName = domain || stackInfo.domainName;
    if (!domainName) {
      throw new Error('Domain name not found');
    }

    // Import AWS SDK dynamically
    const { SESClient, GetIdentityVerificationAttributesCommand, GetIdentityDkimAttributesCommand, GetIdentityMailFromDomainAttributesCommand } = await import('@aws-sdk/client-ses');

    // Create SES client
    const sesClient = new SESClient({
      region,
      credentials: fromIni({ profile }),
    });

    console.log('📋 Step 1: Checking domain verification status...\n');

    // Get verification attributes
    const verificationCommand = new GetIdentityVerificationAttributesCommand({
      Identities: [domainName],
    });
    const verificationResponse = await sesClient.send(verificationCommand);

    // Get DKIM attributes
    const dkimCommand = new GetIdentityDkimAttributesCommand({
      Identities: [domainName],
    });
    const dkimResponse = await sesClient.send(dkimCommand);

    // Get Mail-From domain attributes
    const mailFromCommand = new GetIdentityMailFromDomainAttributesCommand({
      Identities: [domainName],
    });
    const mailFromResponse = await sesClient.send(mailFromCommand);

    // Parse results
    const verificationAttrs = verificationResponse.VerificationAttributes?.[domainName];
    const dkimAttrs = dkimResponse.DkimAttributes?.[domainName];
    const mailFromAttrs = mailFromResponse.MailFromDomainAttributes?.[domainName];

    const status: SesStatus = {
      identity: domainName,
      verificationStatus: verificationAttrs?.VerificationStatus || 'NotStarted',
      dkimEnabled: dkimAttrs?.DkimEnabled || false,
      dkimVerificationStatus: dkimAttrs?.DkimVerificationStatus || 'NotStarted',
      mailFromDomain: mailFromAttrs?.MailFromDomain,
      mailFromVerificationStatus: mailFromAttrs?.MailFromDomainStatus?.MailFromDomainVerificationStatus,
      dkimTokens: dkimAttrs?.DkimTokens,
    };

    // Display status
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SES Status Report');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`Domain: ${status.identity}\n`);

    // Domain Verification Status
    const verificationIcon = status.verificationStatus === 'Success' ? '✅' : 
                            status.verificationStatus === 'Pending' ? '⏳' : 
                            status.verificationStatus === 'Failed' ? '❌' : '⚠️';
    console.log(`${verificationIcon} Domain Verification: ${status.verificationStatus}`);
    if (status.verificationStatus === 'Success') {
      console.log('   Domain is verified and ready to send emails\n');
    } else if (status.verificationStatus === 'Pending') {
      console.log('   Domain verification is pending - DNS records may need time to propagate\n');
    } else {
      console.log('   Domain verification failed - check DNS records\n');
    }

    // DKIM Status
    const dkimIcon = status.dkimVerificationStatus === 'Success' ? '✅' : 
                     status.dkimVerificationStatus === 'Pending' ? '⏳' : 
                     status.dkimVerificationStatus === 'Failed' ? '❌' : '⚠️';
    console.log(`${dkimIcon} DKIM Status: ${status.dkimVerificationStatus}`);
    console.log(`   DKIM Enabled: ${status.dkimEnabled ? 'Yes' : 'No'}`);
    if (status.dkimTokens && status.dkimTokens.length > 0) {
      console.log(`   DKIM Tokens: ${status.dkimTokens.length} token(s)`);
      status.dkimTokens.forEach((token, index) => {
        console.log(`     Token ${index + 1}: ${token}`);
      });
    }
    console.log('');

    // Mail-From Domain Status
    if (status.mailFromDomain) {
      const mailFromIcon = status.mailFromVerificationStatus === 'Success' ? '✅' : 
                          status.mailFromVerificationStatus === 'Pending' ? '⏳' : 
                          status.mailFromVerificationStatus === 'Failed' ? '❌' : '⚠️';
      console.log(`${mailFromIcon} Mail-From Domain: ${status.mailFromDomain}`);
      console.log(`   Verification Status: ${status.mailFromVerificationStatus || 'Unknown'}\n`);
    } else {
      console.log('⚠️  Mail-From Domain: Not configured\n');
    }

    // Get DNS records from stack (if available)
    console.log('📋 Step 2: Checking DNS records from stack...\n');
    
    try {
      const { CloudFormationClient, DescribeStacksCommand } = await import('@aws-sdk/client-cloudformation');
      const cfClient = new CloudFormationClient({
        region,
        credentials: fromIni({ profile }),
      });

      // Try to find core stack
      const coreStackName = `emcnotary-com-mailserver-core`;
      const describeCommand = new DescribeStacksCommand({
        StackName: coreStackName,
      });
      
      try {
        const stackResponse = await cfClient.send(describeCommand);
        const stack = stackResponse.Stacks?.[0];
        
        if (stack?.Outputs) {
          const outputs = stack.Outputs;
          const dkim1Name = outputs.find(o => o.OutputKey === 'DkimDNSTokenName1')?.OutputValue;
          const dkim1Value = outputs.find(o => o.OutputKey === 'DkimDNSTokenValue1')?.OutputValue;
          const mailFromDomain = outputs.find(o => o.OutputKey === 'MailFromDomain')?.OutputValue;
          
          if (dkim1Name && dkim1Value) {
            console.log('✅ DNS Records Available in Stack:\n');
            console.log(`   DKIM CNAME 1: ${dkim1Name} -> ${dkim1Value}`);
            
            const dkim2Name = outputs.find(o => o.OutputKey === 'DkimDNSTokenName2')?.OutputValue;
            const dkim2Value = outputs.find(o => o.OutputKey === 'DkimDNSTokenValue2')?.OutputValue;
            if (dkim2Name && dkim2Value) {
              console.log(`   DKIM CNAME 2: ${dkim2Name} -> ${dkim2Value}`);
            }
            
            const dkim3Name = outputs.find(o => o.OutputKey === 'DkimDNSTokenName3')?.OutputValue;
            const dkim3Value = outputs.find(o => o.OutputKey === 'DkimDNSTokenValue3')?.OutputValue;
            if (dkim3Name && dkim3Value) {
              console.log(`   DKIM CNAME 3: ${dkim3Name} -> ${dkim3Value}`);
            }
            
            if (mailFromDomain) {
              console.log(`   Mail-From Domain: ${mailFromDomain}`);
            }
            
            console.log('\n💡 To set DNS records, run:');
            console.log(`   nx run cdk-emcnotary-instance:admin:ses-dns\n`);
          }
        }
      } catch (error) {
        console.log('⚠️  Could not retrieve DNS records from stack\n');
      }
    } catch (error) {
      console.log('⚠️  Could not check stack outputs\n');
    }

    // Summary and recommendations
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Summary & Recommendations');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (status.verificationStatus === 'Success' && status.dkimVerificationStatus === 'Success') {
      console.log('✅ SES is fully configured and ready!\n');
      console.log('   Domain verification: ✅');
      console.log('   DKIM verification: ✅');
      if (status.mailFromVerificationStatus === 'Success') {
        console.log('   Mail-From verification: ✅\n');
      }
    } else {
      console.log('⚠️  SES configuration needs attention:\n');
      
      if (status.verificationStatus !== 'Success') {
        console.log(`   • Domain verification: ${status.verificationStatus}`);
        console.log('     Action: Set DNS records using:');
        console.log('       nx run cdk-emcnotary-instance:admin:ses-dns\n');
      }
      
      if (status.dkimVerificationStatus !== 'Success') {
        console.log(`   • DKIM verification: ${status.dkimVerificationStatus}`);
        console.log('     Action: Ensure DKIM CNAME records are set correctly\n');
      }
      
      if (status.mailFromDomain && status.mailFromVerificationStatus !== 'Success') {
        console.log(`   • Mail-From verification: ${status.mailFromVerificationStatus}`);
        console.log('     Action: Ensure Mail-From MX and TXT records are set correctly\n');
      }
    }

  } catch (error) {
    console.error('\n❌ Failed to check SES status:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: CheckSesStatusOptions = {};

// Parse --domain
const domainIndex = args.indexOf('--domain');
if (domainIndex !== -1 && args[domainIndex + 1]) {
  options.domain = args[domainIndex + 1];
}

// Run if executed directly
if (require.main === module) {
  checkSesStatus(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

