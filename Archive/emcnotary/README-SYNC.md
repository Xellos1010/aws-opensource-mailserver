# EMCNotary Mail-in-a-Box Synchronization Guide

This guide explains how to synchronize your mail-in-a-box backup with your current server data, ensuring you have both your old emails and any new emails that have arrived since your last backup.

## 📋 What This Does

The synchronization process:

1. **Downloads** current mailboxes from your running server (includes new emails)
2. **Merges** them with your existing backup (preserves old emails)
3. **Uploads** the merged result back to your server
4. **Restarts** mail services to ensure everything works properly

## 🚀 Quick Start

### Prerequisites
- AWS CLI configured with `hepe-admin-mfa` profile
- `jq`, `rsync` installed on your system
- SSH access to your mail server
- Existing backup in `/backups/emcnotary.com/mailboxes/`

### Run the Sync
```bash
cd /Users/evanmccall/Projects/aws-opensource-mailserver/emcnotary
./sync-mailboxes.sh
```

That's it! The script handles everything automatically.

## 📁 File Structure

```
emcnotary/
├── sync-mailboxes.sh           # 🆕 Main synchronization script
├── upload-mailboxes.sh         # Upload existing backup to server
├── download-mailboxes.sh       # Download current mailboxes from server
├── finalize-mailbox-upload.sh  # Finalize mailbox uploads
├── restart-ec2-instance.sh     # 🆕 Restart your EC2 instance
└── ...

backups/emcnotary.com/mailboxes/
├── mailboxes-backup-20250915_000853/  # Your existing backup
├── current-mailboxes-YYYYMMDD_HHMMSS/ # Downloaded current data
└── merged-mailboxes-YYYYMMDD_HHMMSS/  # Merged result
```

## 🔄 Synchronization Process

### Step 1: Download Current Server Data
- Stops mail services temporarily
- Copies current mailboxes to temporary location
- Downloads them to your local machine
- Restarts mail services

### Step 2: Merge with Existing Backup
- Combines both datasets intelligently
- Preserves all emails (old + new)
- Handles duplicate emails properly
- Creates merged backup directory

### Step 3: Upload Merged Data
- Prepares server for upload
- Backs up existing server data
- Uploads merged mailboxes
- Sets correct permissions
- Restarts mail services

## 📊 What You'll Get

After synchronization, your server will have:

✅ **All your old emails** (from your existing backup)
✅ **All your new emails** (from the current server)
✅ **Properly merged mail directories** (no data loss)
✅ **Correct file permissions** (mail services work properly)
✅ **Restarted mail services** (ready to use immediately)

## 🔧 Manual Options

### Just Download Current Mailboxes
If you only want to download current server data:
```bash
./download-mailboxes.sh
```

### Upload Existing Backup Only
If you only want to upload your old backup:
```bash
./upload-mailboxes.sh
```

### Upload Specific Backup
```bash
./upload-mailboxes.sh emcnotary.com /path/to/specific/backup
```

## 🛠 Troubleshooting

### Common Issues

**"No existing backup found"**
- Check that your backup exists in `/backups/emcnotary.com/mailboxes/`
- Ensure the backup directory contains mail data

**"Could not establish SSH connection"**
- Make sure your server is running: `./restart-ec2-instance.sh`
- Verify your SSH keys are set up: `./setup-ssh-access.sh`
- Check your AWS profile: `aws sts get-caller-identity --profile hepe-admin-mfa`

**"Failed to download/upload"**
- Check your internet connection
- Verify AWS credentials are current
- Ensure your server has enough disk space

### Getting Help

1. **Check the logs**: The script provides detailed colored output
2. **Test connectivity**: `./describe-stack.sh` to check server status
3. **Verify backups**: `ls -la /backups/emcnotary.com/mailboxes/`
4. **Check mail services**: Use `./restart-ec2-instance.sh` to restart your server

## 🔐 Security Features

- ✅ Uses MFA-backed AWS profiles
- ✅ No credentials stored in scripts
- ✅ Proper SSH key management
- ✅ Automatic cleanup of temporary files
- ✅ Safe error handling with rollback

## 📞 Need Help?

If you encounter issues:

1. Run `./describe-stack.sh` to check your server status
2. Run `./restart-ec2-instance.sh` to restart your server
3. Check the AWS CloudFormation console for any issues
4. Review the script output for specific error messages

The synchronization script is designed to be safe and will preserve your data even if something goes wrong!











