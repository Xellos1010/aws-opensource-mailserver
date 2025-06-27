# Ask Dao Kapra Mail Server Deployment Scripts

This directory contains deployment and management scripts for the [Ask Dao Kapra](https://askdaokapra.com/) mail server infrastructure. Each script is a wrapper that invokes the corresponding script from the `administration/` folder with the domain `askdaokapra.com`.

## 🌟 About Ask Dao Kapra

Based on [askdaokapra.com](https://askdaokapra.com/), Ask Dao Kapra is a transformative personal development platform focused on **Attention Awareness & Successful Development (A.A & S.D)**. 

### Key Features:
- **Letters with Dao Kapra** - Poetic wisdom inspired by faith and deep understanding to rescue your inner child
- **My Journal** - Secure journaling with personal PIN protection for self-discovery
- **Cycles** - Revolutionary coaching to identify your life patterns using clock time concepts
- **Rewards** - Personal development tracking and achievement system

### Philosophy:
The app is inspired by the book **"Té Azul El Poder del Darte"** (The Power of Giving Yourself) and guides users to understand their life cycles by connecting past patterns with current experiences. This method helps identify deeply rooted memories and change molecular and cellular information, allowing connection and resolution of emotions that resurface in present life.

**Founded by Dao Kapra**, who has been writing since age 7, this platform focuses on **Subconsciousness Emotional Intelligence** and community empowerment.

## 📁 Existing S3 Buckets

This deployment is configured to work with **existing S3 buckets**:
- **Backup Bucket**: `askdaokapra-opensource-mailserver-backup`
- **NextCloud Bucket**: `askdaokapra-opensource-mailserver-nextcloud`

⚠️ **Important**: The current CloudFormation template expects bucket names following the pattern `${DomainName}-backup` and `${DomainName}-nextcloud`. Since your existing buckets use different names, the deploy script will warn you about this and require manual post-deployment configuration.

## 📋 Available Scripts

### Core Deployment
- **`deploy-stack.sh`** - ⭐ **CUSTOM DEPLOY SCRIPT** - Deploy the CloudFormation stack for askdaokapra.com with existing S3 bucket handling
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
  - `askdaokapra-opensource-mailserver-backup`
  - `askdaokapra-opensource-mailserver-nextcloud`

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
   ssh -i ~/.ssh/askdaokapra.com-keypair.pem ubuntu@<INSTANCE_IP>
   ```

2. **Update backup configuration** to use your existing bucket:
   ```bash
   # Edit the backup configuration
   sudo nano /home/user-data/backup/backup.conf
   # Change S3 bucket reference to: askdaokapra-opensource-mailserver-backup
   ```

3. **Update NextCloud configuration** to use your existing bucket:
   ```bash
   # Edit NextCloud S3 configuration
   sudo nano /home/user-data/owncloud/config.php
   # Update S3 bucket to: askdaokapra-opensource-mailserver-nextcloud
   ```

## 📝 Notes

- All scripts automatically use the domain `askdaokapra.com`
- The CloudFormation stack will be named `askdaokapra-com-mailserver`
- SSH keys and configuration files are managed locally in `~/.ssh/`
- DNS records may need to be manually configured on your DNS server
- Uses the `hepe-admin-mfa` AWS profile for all AWS CLI operations

## 🔗 Related Links

- [Ask Dao Kapra Website](https://askdaokapra.com/)
- [HEPE Foundation](https://hepefoundation.org/) - Partner organization
- Ask Dao Kapra focuses on personal development through subconsciousness emotional intelligence
- Founded by Dao Kapra, also founder of HEPE Foundation

## 🎯 Mission & Values

**Primary Goal**: Community empowerment through innovative techniques that rekindle trust within themselves and society.

**Participants** not only embark on a journey of self-development and self-healing but also become **Ambassadors of change**, spreading motivation, understanding, and love.

The platform helps participants embrace the tools they need to remain grounded and secure in various life scenarios, creating a community able to share their own stories and connect with people around the world.

---

*"Bridging Technology, Emotions, and Communities through Attention Awareness & Successful Development"* 