# Mail-in-a-Box AWS Deployment with Infrastructure Provisioning

This guide explains how to deploy a Mail-in-a-Box server on AWS using the two-stage CloudFormation deployment approach, which separates infrastructure resources (Elastic IP, KeyPair, S3 buckets) from the application deployment.

## Deployment Architecture

The deployment consists of two CloudFormation templates:

1. **Infrastructure Template (`mailserver-infrastructure.yaml`)**: Creates and manages long-lived AWS resources:
   - Elastic IP address
   - EC2 Key Pair
   - S3 bucket for backups
   - Optional S3 bucket for NextCloud

2. **Mail Server Template (`mailserver-main.yaml`)**: Deploys the Mail-in-a-Box server using the resources created by the infrastructure template:
   - EC2 instance
   - Security Groups
   - IAM roles and policies
   - SES integration (optional)

This two-stage approach provides several benefits:
- Infrastructure resources persist even if you terminate and redeploy the mail server
- Your Elastic IP address remains consistent, which is important for mail server reputation
- Your Key Pair and S3 bucket data are preserved when updating the server

## Deployment Steps

### Step 1: Deploy the Infrastructure Stack

1. Log in to the AWS Management Console
2. Navigate to CloudFormation
3. Click "Create stack" → "With new resources"
4. Upload the `mailserver-infrastructure.yaml` file
5. Enter a stack name (e.g., `mail-infrastructure`)
6. Fill in the parameters:
   - `MailInABoxDomain`: Your domain name (e.g., example.com)
   - `KeyPairName`: Name for the EC2 key pair (default: askdaokapra_opensource_mailservers)
   - `BackupBucketName`: (Optional) Name for S3 backup bucket
   - `NextCloudBucketName`: (Optional) Name for NextCloud S3 bucket

7. Complete the stack creation wizard and click "Create stack"
8. Wait for the infrastructure stack creation to complete

### Step 2: Save the Key Pair PEM File

After the infrastructure stack is created, you need to save the private key (PEM file) for the generated EC2 key pair:

1. Go to the "Outputs" tab of your infrastructure stack
2. Note the values of `ElasticIPAddress`, `KeyPairName`, and `BackupBucketName`
3. From the EC2 console, under Key Pairs, find your key pair and download the PEM file
4. Save this file securely - it will be needed to SSH into your mail server

### Step 3: Deploy the Mail Server Stack

1. Navigate to CloudFormation
2. Click "Create stack" → "With new resources"
3. Upload the `mailserver-main.yaml` file
4. Enter a stack name (e.g., `mail-server`)
5. Fill in the parameters:
   - `MailInABoxDomain`: Your domain name (must match the infrastructure stack)
   - `InfrastructureStackName`: Name of the infrastructure stack you created in Step 1
   - `InstanceType`: EC2 instance type (default: t2.micro, consider t2.small or larger for production)
   - Other parameters as needed

6. Complete the stack creation wizard and click "Create stack"
7. Wait for the mail server stack to complete (this can take 15-30 minutes)

### Step 4: Configure DNS

After both stacks are successfully deployed, you need to configure your domain's DNS:

1. Get the Elastic IP address from the outputs of either stack
2. Configure your domain registrar's DNS settings or create Route 53 records:
   - A record for your mail domain pointing to the Elastic IP
   - MX record pointing to your mail server
   - SPF, DKIM, and DMARC records as guided by Mail-in-a-Box setup

### Step 5: Access Your Mail Server

1. Navigate to `https://box.yourdomain.com/admin`
2. Log in using:
   - Username: `admin@yourdomain.com`
   - Password: 
     - If you provided a password in the CloudFormation parameters, use that
     - If not, retrieve it from AWS SSM Parameter Store: `/MailInABoxAdminPassword-[stack-name]`

## Backup and Restore

The mail server automatically creates backups in the S3 bucket. To restore from a backup:

1. Terminate the existing mail server stack (if running)
2. Deploy a new mail server stack with the `RestorePrefix` parameter set to the backup you want to restore from

## Updating the Server

To update the Mail-in-a-Box software:

1. Delete the mail server stack (the EC2 instance and related resources)
2. Keep the infrastructure stack (Elastic IP, Key Pair, S3 buckets)
3. Deploy a new mail server stack using the same infrastructure stack name

## Security Considerations

- The PEM key file should be stored securely
- Consider hardening the security group rules based on your requirements
- Review IAM permissions regularly
- Enable CloudTrail for auditing
- Implement AWS Config rules

## Resource Management

If you no longer need the mail server:

1. Delete the mail server stack first
2. Delete the infrastructure stack if you no longer need the resources

**NOTE:** Deleting the infrastructure stack will release the Elastic IP, delete the EC2 key pair, and delete the S3 buckets (including all data stored in them).

## Troubleshooting

- Check the CloudFormation stack events for failure details
- Review EC2 instance system logs
- Check the `/var/log/mailinabox_setup.log` file on the mail server
- SSH into the instance using the key pair: `ssh -i path/to/your-keypair.pem ubuntu@your-elastic-ip` 