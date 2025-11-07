# TelAssistMD Mail Server Deployment Scripts

This directory contains deployment and management scripts for the TelAssistMD mail server infrastructure. Each script is a wrapper that invokes the corresponding script from the `administration/` folder with the domain `telassistmd.com`.

## Available Scripts

### Core Deployment
- **`deploy-stack.sh`** - Deploy the CloudFormation stack for telassistmd.com
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

## Usage

All scripts are executable and can be run directly:

```bash
# Deploy the infrastructure
./deploy-stack.sh

# Check deployment status
./describe-stack.sh

# Set up SSH access
./setup-ssh-access.sh

# Get admin password
./get-admin-password.sh
```

## Prerequisites

- AWS CLI configured with the `hepe-admin-mfa` profile
- CloudFormation template `mailserver-infrastructure-mvp.yaml` in the project root
- Python 3 for the SES credentials script

## Notes

- All scripts automatically use the domain `telassistmd.com`
- The CloudFormation stack will be named `telassistmd-com-mailserver`
- SSH keys and configuration files are managed locally in `~/.ssh/`
- DNS records may need to be manually configured on your DNS server 