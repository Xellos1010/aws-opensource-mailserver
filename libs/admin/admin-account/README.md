# Admin Account Library

Library for creating and managing admin accounts in Mail-in-a-Box.

## Features

- **Create admin accounts** using the working method (direct database manipulation + mailbox directory creation)
- **Sync passwords** via Mail-in-a-Box CLI (ensures proper password hash format)
- **Check account existence** using Mail-in-a-Box management scripts
- **Create mailbox directories** with proper permissions

## Usage

```typescript
import { createAdminAccount, checkAdminAccountExists } from '@mm/admin-account';

// Create admin account
const result = await createAdminAccount({
  keyPath: '/path/to/ssh/key',
  instanceIp: '1.2.3.4',
  email: 'admin@emcnotary.com',
  password: 'secure-password',
});

// Check if account exists
const exists = await checkAdminAccountExists(
  '/path/to/ssh/key',
  '1.2.3.4',
  'admin@emcnotary.com'
);
```

## Methods

### `createAdminAccount(options)`

Creates an admin account using the working method:
1. Checks if account already exists
2. Creates account in database (bypasses Mail-in-a-Box restrictions)
3. Creates mailbox directory
4. Syncs password via Mail-in-a-Box CLI

### `checkAdminAccountExists(keyPath, instanceIp, email)`

Checks if an admin account exists in Mail-in-a-Box.

### `createMailboxDirectory(keyPath, instanceIp, email)`

Creates the mailbox directory for an admin account.

### `syncPassword(keyPath, instanceIp, email, password)`

Syncs the password using Mail-in-a-Box CLI (ensures proper password hash format).

## Why This Library?

Mail-in-a-Box has restrictions on creating `admin@domain` accounts when other users exist. This library uses a working method that:
- Creates accounts directly in the database (bypassing restrictions)
- Creates mailbox directories with proper permissions
- Syncs passwords via CLI to ensure proper hash format

This ensures admin accounts can be created reliably even when Mail-in-a-Box CLI blocks creation.


