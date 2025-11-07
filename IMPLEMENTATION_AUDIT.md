# Implementation Audit - EIP & Backup Stack Refactoring

## Date: 2025-01-XX
## Task: Move EIP to core stack, create separate backup stack, ensure graceful deletion

---

## ✅ Completed Items

### 1. EIP Moved to Core Stack
- ✅ EIP created in `EmcNotaryCoreStack` (line 46-54)
- ✅ EIP allocation ID stored in SSM: `/emcnotary/core/eipAllocationId`
- ✅ EIP outputs: `ElasticIPAddress` and `ElasticIPAllocationId`
- ✅ Instance stack reads EIP from SSM and associates via `allocationId` (not `eip.ref`)

### 2. Reverse DNS Setup in Core Stack
- ✅ Reverse DNS Lambda created (`ReverseDnsLambdaFunction`)
- ✅ Custom resource triggers reverse DNS setup on EIP creation
- ✅ Reverse DNS cleared on stack deletion (graceful error handling)
- ✅ Handles missing/released EIPs gracefully

### 3. Removal Policies Updated
- ✅ All buckets: `RemovalPolicy.DESTROY` + `autoDeleteObjects: true`
- ✅ Log groups: `RemovalPolicy.DESTROY`
- ✅ No RETAIN policies remain

### 4. Backup Stack Created
- ✅ New stack: `cdk-mailservers-backups`
- ✅ Central backup bucket: `mailservers-backups`
- ✅ SSM parameter: `/mailservers/backups/bucketName`
- ✅ Lifecycle policy: 90 days retention with IA/Glacier transitions
- ✅ All configuration files created (project.json, cdk.json, tsconfig files)

### 5. Core Stack References Backup Stack
- ✅ Attempts to read backup bucket from SSM parameter
- ✅ Graceful fallback if backup stack doesn't exist
- ✅ Outputs central backup bucket name if available

### 6. Error Handling
- ✅ Reverse DNS Lambda handles all error cases gracefully
- ✅ Empty buckets handled by CDK's `autoDeleteObjects`
- ✅ Missing EIPs handled in reverse DNS Lambda

---

## ⚠️ Gaps Identified

### 1. SSM Parameter Reference Issue
**Location**: `apps/cdk-emcnotary-core/src/stacks/core-stack.ts:244-250`

**Status**: ✅ FIXED

**Solution**: Changed from SSM parameter lookup (which fails at synthesis) to CDK context/environment variable lookup:
```typescript
const centralBackupBucket =
  this.node.tryGetContext('centralBackupBucket') ||
  process.env['CENTRAL_BACKUP_BUCKET'] ||
  undefined;
```

**Usage**: 
- Via CDK context: `cdk deploy --context centralBackupBucket=mailservers-backups`
- Via environment: `CENTRAL_BACKUP_BUCKET=mailservers-backups cdk deploy`
- If not provided, stack works without it (undefined)

### 2. Instance Stack Backup on Deletion
**Status**: NOT IMPLEMENTED

**Requirement**: When instance stack is deleted (not hot-swap), backup mailboxes, DNS, and users to central backup bucket.

**Missing**:
- No Lambda or custom resource to trigger backups before instance deletion
- No integration with `admin-mail-backup`, `admin-dns-backup`, `admin-users-backup`
- Instance stack doesn't reference central backup bucket

**Action Required**: Add backup logic to instance stack deletion handler.

### 3. Local Backup Management Tools
**Status**: NOT IMPLEMENTED

**Requirement**: Admin tools to manage backups locally (list, download, upload, delete) without incurring AWS write operations.

**Missing**:
- No `admin-backup-manager` library created
- No CLI tools for backup management
- No integration with existing backup libraries

**Action Required**: Create `admin-backup-manager` library with:
- `list-backups.ts` - List backups in central bucket
- `download-backup.ts` - Download backup locally
- `upload-backup.ts` - Upload local backup to S3
- `delete-backup.ts` - Delete backup from S3

### 4. Backup Stack Info Retrieval
**Status**: PARTIALLY IMPLEMENTED

**Requirement**: Before deleting a stack, describe the backup stack to get bucket information.

**Current**: Core stack attempts to read SSM parameter, but no explicit stack description logic.

**Missing**: No admin tool to describe backup stack before deletion.

---

## 📋 Verification Checklist

### Core Stack
- [x] EIP created in core stack
- [x] EIP allocation ID in SSM
- [x] Reverse DNS Lambda created
- [x] Reverse DNS custom resource created
- [x] All RETAIN policies removed
- [x] Buckets set to DESTROY + autoDeleteObjects
- [x] Log groups set to DESTROY
- [x] Backup stack SSM parameter reference (with try/catch)
- [x] Central backup bucket output (conditional)

### Backup Stack
- [x] Stack created: `cdk-mailservers-backups`
- [x] Bucket created: `mailservers-backups`
- [x] SSM parameter created: `/mailservers/backups/bucketName`
- [x] Lifecycle policy configured
- [x] All config files created
- [x] README created

### Instance Stack
- [x] Reads EIP allocation ID from SSM
- [x] Associates instance with EIP via allocationId
- [x] No EIP creation in instance stack
- [ ] Backup logic on deletion (NOT DONE)
- [ ] Reference to central backup bucket (NOT DONE)

### Admin Tools
- [ ] Backup manager library (NOT DONE)
- [ ] List backups tool (NOT DONE)
- [ ] Download backup tool (NOT DONE)
- [ ] Upload backup tool (NOT DONE)
- [ ] Delete backup tool (NOT DONE)

### Error Handling
- [x] Reverse DNS Lambda handles missing EIPs
- [x] Reverse DNS Lambda handles released EIPs
- [x] Reverse DNS Lambda always succeeds on delete
- [x] Empty buckets handled by CDK
- [x] SSM parameter lookup has fallback

---

## 🔧 Required Fixes

### Priority 1: SSM Parameter Lookup
The try/catch for SSM parameter might not work correctly. Need to verify or use alternative approach.

### Priority 2: Instance Stack Backup
Add backup logic to instance stack deletion to backup mailboxes, DNS, and users.

### Priority 3: Admin Tools
Create backup management tools for local operations.

---

## 📝 Notes

- The reverse DNS Lambda only handles EIP information (no bucket logic) ✅
- All resources will delete cleanly with empty buckets ✅
- Backup stack is separate and can be managed independently ✅
- Core stack can be deleted even if backup stack doesn't exist ✅

