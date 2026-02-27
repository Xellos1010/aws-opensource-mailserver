# How to Know If a Backup Ran

There are **two different** backup mechanisms. You need to check the one that applies.

---

## 1. Mail-in-a-Box automatic backup (server → S3 or local)

Mail-in-a-Box can back up to:
- **On the server:** `/home/user-data/backup/` (and `/home/user-data/owncloud/`)
- **S3:** If configured during bootstrap, the instance has `BACKUP_BUCKET` and can push to the core stack’s S3 backup bucket. Objects are stored under a prefix (typically the **instance ID**).

### How to check if MIAB backup ran

**A. Check S3 for objects (server → S3)**

1. Get your **instance ID** and **backup bucket name**:
   ```bash
   cd /Users/evanmccall/Projects/aws-opensource-mailserver
   source ~/.zshrc && nvm use 20
   pnpm exec nx run cdk-emcnotary-instance:admin:info
   ```
   Note the **InstanceId** (or **RestorePrefixValue** — same value).

2. Get the backup bucket name (from core stack SSM):
   ```bash
   AWS_PROFILE=hepe-admin-mfa aws ssm get-parameter --name /emcnotary/core/backupBucket --query Parameter.Value --output text
   ```

3. List objects in the bucket under your instance ID (replace `BUCKET_NAME` and `i-xxxxxxxxx`):
   ```bash
   AWS_PROFILE=hepe-admin-mfa aws s3 ls s3://BUCKET_NAME/i-xxxxxxxxx/ --summarize
   ```
   If you see objects and **LastModified** dates that are recent (e.g. before the reset), a backup ran to S3. Empty or no prefix means no S3 backup for that instance.

**B. Check on the server (local MIAB backup)**

If you have SSH or SSM access to the instance:
- List recent files: `ls -la /home/user-data/backup/`
- Check MIAB backup cron/logs (e.g. `grep -i backup /var/log/syslog` or Mail-in-a-Box’s `daily_tasks` logs).

If `/home/user-data/backup/` has recent dated files or archives, a local backup ran.

---

## 2. Manual backup (you run a command → pull to your Mac)

The **admin:backup-and-cleanup** (or **admin:backup-and-cleanup** on the observability-maintenance app) task **pulls** mailboxes from the server to your **local machine** via SSH/rsync. It does not run by itself.

### How to know if a manual backup ran

- Check for a local backup folder. Default location:
  ```text
  Archive/backups/emcnotary.com/mailboxes/
  ```
  or whatever you passed as `--destination-dir`. Look for folders like `mailboxes-backup-YYYYMMDD-HHMMSS` or a `.tar.gz` from the backup report.
- If that folder exists and has content (and dates from before the reset), then a manual backup was run at some point.

---

## Summary

| What you mean by “backup” | How to verify it ran |
|---------------------------|------------------------|
| **Server pushed to S3** (MIAB automatic) | S3: `aws s3 ls s3://BUCKET_NAME/INSTANCE_ID/` shows objects with recent dates. Or on server: recent files in `/home/user-data/backup/`. |
| **You pulled to your Mac** (manual) | Local folder exists: `Archive/backups/emcnotary.com/mailboxes/` (or your `DESTINATION_DIR`) with dated backup folders or a report. |

If the **instance was replaced** (new instance ID after reset), the **old** instance ID’s S3 prefix may still have backups from before the reset. Use the **old** instance ID when listing S3 to see if any backup ran for the previous instance.
