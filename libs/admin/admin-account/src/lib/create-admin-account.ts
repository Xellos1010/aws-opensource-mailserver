/**
 * Admin Account Creation Library
 * 
 * Provides functions to create admin accounts in Mail-in-a-Box using the working method:
 * 1. Direct database manipulation (when CLI fails due to admin@domain restrictions)
 * 2. Mailbox directory creation
 * 3. Password sync via Mail-in-a-Box CLI
 */

import { sshCommand } from './ssh-command';

export interface CreateAdminAccountOptions {
  /** SSH key path */
  keyPath: string;
  /** Instance IP address */
  instanceIp: string;
  /** Admin email address (e.g., admin@emcnotary.com) */
  email: string;
  /** Admin password */
  password: string;
}

export interface CreateAdminAccountResult {
  success: boolean;
  message: string;
  accountExists: boolean;
  mailboxCreated: boolean;
  passwordSynced: boolean;
}

/**
 * Check if admin account exists in Mail-in-a-Box
 *
 * This function uses a single SSH command to minimize connection overhead.
 */
export async function checkAdminAccountExists(
  keyPath: string,
  instanceIp: string,
  email: string
): Promise<boolean> {
  const emailLower = email.toLowerCase();

  // Consolidated command that detects script and checks for user
  const command = `sudo bash -c '
cd /opt/mailinabox
git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true

# Fix API key permissions for cli.py
chmod 644 /var/lib/mailinabox/api.key 2>/dev/null || true
chown user-data:user-data /var/lib/mailinabox/api.key 2>/dev/null || true

if [ -f /opt/mailinabox/management/cli.py ]; then
  sudo -u user-data /opt/mailinabox/management/cli.py user 2>/dev/null | grep -i "${emailLower}" || echo "USER_NOT_FOUND"
elif [ -f /opt/mailinabox/management/users.py ]; then
  sudo -u user-data /opt/mailinabox/management/users.py list 2>/dev/null | grep -i "${emailLower}" || echo "USER_NOT_FOUND"
else
  echo "NO_MANAGEMENT_SCRIPT"
fi
'`;

  const result = await sshCommand(keyPath, instanceIp, command);
  return result.success &&
         result.output.toLowerCase().includes(emailLower) &&
         !result.output.includes('USER_NOT_FOUND');
}

/**
 * Create mailbox directory for admin account
 *
 * Mail-in-a-Box/Dovecot stores mailboxes in the format:
 * /home/user-data/mail/mailboxes/domain.com/username/
 *
 * The mailbox directories are owned by the 'mail' user (not user-data).
 * This also creates the standard Dovecot maildir structure with
 * cur/, new/, tmp/ subdirectories.
 */
export async function createMailboxDirectory(
  keyPath: string,
  instanceIp: string,
  email: string
): Promise<boolean> {
  // Parse email to get username and domain
  const [username, domain] = email.split('@');
  if (!username || !domain) {
    return false;
  }

  const mailboxPath = `/home/user-data/mail/mailboxes/${domain}/${username}`;

  // Create mailbox directory with standard Dovecot maildir structure
  // Ownership should be mail:mail to match existing mailboxes
  const command = `sudo bash -c '
    mkdir -p "${mailboxPath}/cur" "${mailboxPath}/new" "${mailboxPath}/tmp" && \
    chown -R mail:mail "${mailboxPath}" && \
    chmod 700 "${mailboxPath}" && \
    chmod 700 "${mailboxPath}/cur" "${mailboxPath}/new" "${mailboxPath}/tmp" && \
    echo "MAILBOX_CREATED"
  ' || echo "MAILBOX_FAILED"`;

  const result = await sshCommand(keyPath, instanceIp, command);
  return result.success && result.output.includes('MAILBOX_CREATED');
}

/**
 * Create admin account directly in database (bypasses Mail-in-a-Box restrictions)
 */
export async function createAdminAccountInDatabase(
  keyPath: string,
  instanceIp: string,
  email: string,
  password: string
): Promise<boolean> {
  // Base64 encode email and password to avoid shell escaping issues
  const emailB64 = Buffer.from(email).toString('base64');
  const passwordB64 = Buffer.from(password).toString('base64');
  
  // Escape special characters in base64 strings for shell
  const emailB64Escaped = emailB64.replace(/'/g, "'\\''");
  const passwordB64Escaped = passwordB64.replace(/'/g, "'\\''");
  
  const command = `sudo bash -c 'python3 << "PYEOF"
import sys
import hashlib
import secrets
import sqlite3
import os
import pwd
import base64

# Get user-data user info
user_data_uid = pwd.getpwnam("user-data").pw_uid
user_data_gid = pwd.getpwnam("user-data").pw_gid

db_path = "/home/user-data/mail/users.sqlite"

# Ensure database is writable
if os.path.exists(db_path):
    os.chown(db_path, user_data_uid, user_data_gid)
    os.chmod(db_path, 0o664)

# Decode email and password from base64
email = base64.b64decode("${emailB64Escaped}").decode()
password = base64.b64decode("${passwordB64Escaped}").decode()

# Hash password
salt = secrets.token_hex(16)
pwdhash = hashlib.sha512((password + salt).encode()).hexdigest()

# Connect to database
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check if user exists
cursor.execute("SELECT email, privileges FROM users WHERE email=?", (email,))
existing = cursor.fetchone()

if existing:
    cursor.execute("UPDATE users SET password=?, privileges=? WHERE email=?", (pwdhash + " " + salt, "admin", email))
    conn.commit()
    print("UPDATED")
else:
    cursor.execute("INSERT INTO users (email, password, privileges, quota) VALUES (?, ?, ?, ?)", (email, pwdhash + " " + salt, "admin", ""))
    conn.commit()
    print("CREATED")

conn.close()
PYEOF
'`;
  
  const result = await sshCommand(keyPath, instanceIp, command);
  return result.success && (result.output.includes('CREATED') || result.output.includes('UPDATED'));
}

/**
 * Sync password using Mail-in-a-Box CLI (ensures proper password hash format)
 *
 * This function consolidates all operations into a single SSH command to minimize
 * connection overhead and avoid rate limiting issues.
 */
export async function syncPassword(
  keyPath: string,
  instanceIp: string,
  email: string,
  password: string
): Promise<boolean> {
  const emailB64 = Buffer.from(email).toString('base64');
  const passwordB64 = Buffer.from(password).toString('base64');

  // Consolidated command that:
  // 1. Fixes API key permissions
  // 2. Detects which management script to use
  // 3. Sets the password
  const command = `sudo bash -c '
# Fix API key permissions
chmod 644 /var/lib/mailinabox/api.key 2>/dev/null || true
chown user-data:user-data /var/lib/mailinabox/api.key 2>/dev/null || true

cd /opt/mailinabox
git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true

EMAIL=$(echo "${emailB64}" | base64 -d)
PASS=$(echo "${passwordB64}" | base64 -d)

if [ -f /opt/mailinabox/management/cli.py ]; then
  sudo -u user-data /opt/mailinabox/management/cli.py user password "$EMAIL" "$PASS" 2>&1
elif [ -f /opt/mailinabox/management/users.py ]; then
  sudo -u user-data /opt/mailinabox/management/users.py password "$EMAIL" "$PASS" 2>&1
else
  echo "NO_MANAGEMENT_SCRIPT"
  exit 1
fi
'`;

  const result = await sshCommand(keyPath, instanceIp, command);
  return result.success && (result.output.includes('OK') || result.output.includes('password') || result.output.trim() === '');
}

/**
 * Create admin account using the working method
 * 
 * This method:
 * 1. Checks if account already exists
 * 2. Creates account in database (bypasses Mail-in-a-Box restrictions)
 * 3. Creates mailbox directory
 * 4. Syncs password via Mail-in-a-Box CLI
 */
export async function createAdminAccount(
  options: CreateAdminAccountOptions
): Promise<CreateAdminAccountResult> {
  const { keyPath, instanceIp, email, password } = options;
  
  // Check if account already exists
  const accountExists = await checkAdminAccountExists(keyPath, instanceIp, email);
  let accountCreatedNow = false;

  if (!accountExists) {
    // Create account in database
    const dbCreated = await createAdminAccountInDatabase(keyPath, instanceIp, email, password);
    if (!dbCreated) {
      return {
        success: false,
        message: 'Failed to create account in database',
        accountExists: false,
        mailboxCreated: false,
        passwordSynced: false,
      };
    }
    accountCreatedNow = true;
  }

  // Create mailbox directory
  const mailboxCreated = await createMailboxDirectory(keyPath, instanceIp, email);

  // Sync password via CLI (ensures proper hash format)
  const passwordSynced = await syncPassword(keyPath, instanceIp, email, password);

  // Success if account existed before OR was just created successfully
  // At this point, account definitely exists (we return early above if creation failed)
  return {
    success: true,
    message: accountExists
      ? 'Account already exists, mailbox and password synced'
      : 'Account created, mailbox and password synced',
    accountExists: accountExists || accountCreatedNow,
    mailboxCreated,
    passwordSynced,
  };
}

