# EMC Notary Disk Maintenance

This document explains how to use the `emcnotary-disk-maintenance.sh` script to resolve disk space issues on your emcnotary Mail-in-a-Box server.

## Problem Description

Your Mail-in-a-Box server is rejecting incoming emails with the error "452 4.3.1 Insufficient system storage" because the server's disk is full. This prevents Amazon SES from delivering emails to your domain.

## Solution Overview

The maintenance script performs a comprehensive cleanup of your server:

1. **Backup** - Creates a full backup of all mailboxes to your local machine
2. **Analysis** - Shows detailed disk usage information
3. **Cleanup** - Removes old logs, temporary files, and system caches
4. **Restart** - Restarts services and clears memory caches
5. **Verification** - Confirms the system is working properly

## Usage

### Full Maintenance (Recommended)

Run the complete maintenance script:

```bash
cd emcnotary
./emcnotary-disk-maintenance.sh
```

This will backup your data and then clean up the server.

### Backup Only

If you only want to backup without cleaning:

```bash
./emcnotary-disk-maintenance.sh --backup-only
```

### Cleanup Only

If you already have a recent backup and just want to clean:

```bash
./emcnotary-disk-maintenance.sh --cleanup-only
```

### Verbose Output

For detailed logging:

```bash
./emcnotary-disk-maintenance.sh --verbose
```

## What Gets Cleaned Up

The script safely removes:

- **System logs older than 7 days** (compressed)
- **Very old logs older than 30 days** (deleted)
- **Mail-in-a-Box logs** (same retention policy)
- **Temporary files older than 1 day**
- **Package cache and orphaned packages**
- **Old kernels** (keeps last 2)
- **Docker containers and images** (if Docker is present)

## Safety Features

- **Automatic backup** before any cleanup
- **Safe deletion** with confirmation prompts
- **Service verification** after restart
- **Detailed logging** of all operations
- **Error handling** with cleanup on failure

## Prerequisites

Before running the script, ensure:

1. AWS CLI is configured with the `hepe-admin-mfa` profile
2. SSH key is available at `~/.ssh/emcnotary.com-keypair.pem`
3. Instance IP is recorded in `ec2_ipaddress.txt`
4. You have sudo access on the remote server

## Expected Results

After successful maintenance:

- Disk usage should drop significantly (typically 20-50%+ free space)
- Email delivery should resume working
- System performance should improve
- All services should be running properly

## Monitoring

After maintenance:

1. Monitor disk usage: `df -h /`
2. Check mail logs: `sudo tail -f /var/log/mail.log`
3. Verify email delivery with a test message
4. Check Mail-in-a-Box admin panel for any alerts

## Troubleshooting

If issues persist:

1. Check available disk space: `df -h /`
2. Review mail logs: `sudo tail -50 /var/log/mail.log`
3. Verify services are running: `sudo systemctl status postfix`
4. Test SMTP manually: `telnet localhost 25`

## Backup Location

Mailboxes are backed up to:
```
backups/emcnotary.com/mailboxes/mailboxes-backup-maintenance-YYYYMMDD_HHMMSS/
```

Keep these backups safe - they contain all your email data.



