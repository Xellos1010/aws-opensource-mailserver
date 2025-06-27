# HEPE Foundation Mail Server Deployment Scripts

This directory contains deployment and management scripts for the [HEPE Foundation](https://hepefoundation.org/) mail server infrastructure. Each script is a wrapper that invokes the corresponding script from the `administration/` folder with the domain `hepefoundation.org`.

## 🌟 About HEPE Foundation

Based on [hepefoundation.org](https://hepefoundation.org/), HEPE is a nonprofit charity organization with a 501c3 status, founded by Karina Rodriguez (Dao Kapra) to expand charitable work that has been conducted for nearly two decades. HEPE is a worldwide movement that seeks to recover lost hope, both in ourselves and in humanity.

## 📁 Existing S3 Buckets

This deployment is configured to work with **existing S3 buckets**:
- **Backup Bucket**: `hepefoundation-aws-opensource-mailserver-backup`
- **NextCloud Bucket**: `hepefoundation-aws-opensource-mailserver-nextcloud`

⚠️ **Important**: The current CloudFormation template expects bucket names following the pattern `${DomainName}-backup` and `${DomainName}-nextcloud`. Since your existing buckets use different names, the deploy script will warn you about this and require manual post-deployment configuration.

## 📋 Available Scripts

### Core Deployment
- **`deploy-stack.sh`** - ⭐ **CUSTOM DEPLOY SCRIPT** - Deploy the CloudFormation stack for hepefoundation.org with existing S3 bucket handling
- **`describe-stack.sh`** - Show current stack status and outputs
- **`delete-stack.sh`** - Delete the CloudFormation stack

### SSH Access
- **`setup-ssh-access.sh`** - Set up SSH access to the EC2 instance
- **`cleanup-keys.sh`** - Clean up local SSH keys and known_hosts entries

### Email Configuration
- **`get-ses-config.sh`** - Get SES configuration details
- **`generate_ses_smtp_credentials.sh`** - Generate SMTP credentials for SES
- **`print-ses-dns-records.sh`** - Print required DNS records for SES
- **`set-ses-dns-records.sh`** - Configure DNS records for SES

### DNS and Network
- **`set-reverse-dns-elastic-ip.sh`** - Set reverse DNS for the Elastic IP
- **`test-dns-api.sh`** - Test DNS API connectivity

### Admin Access
- **`get-admin-password.sh`** - Retrieve the admin password for Mail-in-a-Box

## 🚀 Usage

All scripts are executable and can be run directly:

```bash
# Deploy the infrastructure (handles existing S3 buckets)
./deploy-stack.sh

# Check deployment status
./describe-stack.sh

# Set up SSH access
./setup-ssh-access.sh

# Get admin password
./get-admin-password.sh
```

## ⚙️ Prerequisites

- AWS CLI configured with the `hepe-admin-mfa` profile
- CloudFormation template `mailserver-infrastructure-mvp.yaml` in the project root
- Python 3 for the SES credentials script
- Access to existing S3 buckets:
  - `hepefoundation-aws-opensource-mailserver-backup`
  - `hepefoundation-aws-opensource-mailserver-nextcloud`

## 🔧 Special Deployment Notes

### S3 Bucket Configuration

The `deploy-stack.sh` script includes special handling for your existing S3 buckets:

1. **Pre-deployment verification** - Checks that both existing buckets are accessible
2. **Warning system** - Alerts about bucket name mismatch with CloudFormation template
3. **Post-deployment steps** - Provides instructions for manual configuration

### Post-Deployment Configuration Required

After successful CloudFormation deployment, you'll need to:

1. **SSH into the EC2 instance**:
   ```bash
   ./setup-ssh-access.sh
   ssh -i ~/.ssh/hepefoundation.org-keypair.pem ubuntu@<INSTANCE_IP>
   ```

2. **Update backup configuration** to use your existing bucket:
   ```bash
   # Edit the backup configuration
   sudo nano /home/user-data/backup/backup.conf
   # Change S3 bucket reference to: hepefoundation-aws-opensource-mailserver-backup
   ```

3. **Update NextCloud configuration** to use your existing bucket:
   ```bash
   # Edit NextCloud S3 configuration
   sudo nano /home/user-data/owncloud/config.php
   # Update S3 bucket to: hepefoundation-aws-opensource-mailserver-nextcloud
   ```

## 📝 Notes

- All scripts automatically use the domain `hepefoundation.org`
- The CloudFormation stack will be named `hepefoundation-org-mailserver`
- SSH keys and configuration files are managed locally in `~/.ssh/`
- DNS records may need to be manually configured on your DNS server
- Uses the `hepe-admin-mfa` AWS profile for all AWS CLI operations

## 🔗 Related Links

- [HEPE Foundation Website](https://hepefoundation.org/)
- HEPE Foundation focuses on spreading hope and supporting various communities through charitable work
- Founded by Dao Kapra (Karina Rodriguez) with nearly two decades of charitable experience

---

*"Your life is lost only when HOPE is lost, that is why we created HEPE." - Dao Kapra* 