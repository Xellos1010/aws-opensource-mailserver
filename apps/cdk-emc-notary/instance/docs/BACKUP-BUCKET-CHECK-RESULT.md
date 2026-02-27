# Backup bucket check result (emcnotary.com)

**Date:** 2025-02-19  
**Profile used:** `hepe-admin-mfa`  
**Bucket:** `emcnotary.com-backup` (from SSM `/emcnotary/core/backupBucket`)

---

## Result: no backups in S3

- **Total objects in bucket:** 0  
- **Object versions:** none  
- **Prefixes (instance IDs):** none  

So **no mail or other data was ever uploaded to the backup bucket** for this domain—neither for the current instance nor for any previous (replaced) instance.

---

## Commands used

```bash
export AWS_PROFILE=hepe-admin-mfa

# Bucket name
aws ssm get-parameter --name /emcnotary/core/backupBucket --query Parameter.Value --output text
# → emcnotary.com-backup

# List root (and any instance-ID prefixes)
aws s3 ls s3://emcnotary.com-backup/ --summarize
# → Total Objects: 0, Total Size: 0

# List with API (prefixes)
aws s3api list-objects-v2 --bucket emcnotary.com-backup --max-keys 50 --delimiter '/'
# → KeyCount: 0, no CommonPrefixes

# Versions (in case of versioned bucket)
aws s3api list-object-versions --bucket emcnotary.com-backup --max-keys 20
# → no Versions
```

---

## What this means

- **Emails are not in this S3 bucket.** Recovery would need to come from:
  - Time Machine or another local backup of your Mac (Apple Mail data), or
  - A manual mailbox backup you may have run earlier to a folder like `Archive/backups/emcnotary.com/mailboxes/` (none found in this repo), or
  - Backups on the old instance’s disk (lost when the instance was replaced unless you have a snapshot/AMI).
- To have backups in S3 in the future: ensure Mail-in-a-Box is configured to push to this bucket (and that the backup job runs), or run the manual backup-and-cleanup task regularly and keep the resulting files.
