# Backup Local Apple Mail (emcnotary.com) Before Reconnecting

If the mailserver was reset and you still have mail **only** in Apple Mail on your Mac, back it up **before** reconnecting. Once you reconnect, Mail may sync and remove or overwrite local messages with the (empty) server state.

---

## 1. Disconnect or Prevent Sync First

- **Option A:** In Apple Mail → Settings → Accounts → select each emcnotary.com account → **uncheck "Enable this account"** (or remove the account temporarily). This stops sync until you’re ready.
- **Option B:** Disconnect from the internet or block Mail from the network until the backup is done.

Do **not** open the account or trigger a sync until the backup is complete.

---

## 2. Where Apple Mail Stores Your Data

- **Primary location:** `~/Library/Mail/`
- Contains local copies of messages, attachments, and mailbox structure for all accounts.
- Folder names are version-specific (e.g. `V10`, `V13`). Back up the **entire** `~/Library/Mail/` folder to capture every account.

---

## 3. Full Backup (Recommended)

Creates a full snapshot you can restore from or re-import later.

1. **Quit Apple Mail** (Mail → Quit Mail, or Cmd+Q).
2. In Finder, press **Cmd+Shift+G**, go to: `~/Library/Mail`
3. Copy the **entire `Mail` folder** to a safe location, e.g.:
   - External drive: `/Volumes/YourDrive/emcnotary-apple-mail-backup-YYYYMMDD/`
   - Or a folder in your home: `~/Documents/emcnotary-apple-mail-backup-YYYYMMDD/`
4. Rename the copied folder to something clear, e.g. `Mail-emcnotary-backup-YYYYMMDD`.

**Terminal option (run with Mail quit):**

```bash
BACKUP_DIR=~/Documents/emcnotary-apple-mail-backup-$(date +%Y%m%d)
mkdir -p "$BACKUP_DIR"
cp -R ~/Library/Mail "$BACKUP_DIR/Mail-full"
# Optional: compress to save space
tar -czf "$BACKUP_DIR/Mail-full.tar.gz" -C "$BACKUP_DIR" Mail-full
```

---

## 4. Export Mailboxes (Extra Safety)

Gives you `.mbox` archives per mailbox, which are easy to re-import or upload later.

1. Open **Apple Mail**.
2. In the sidebar, expand the **emcnotary.com** account(s).
3. For each mailbox (Inbox, Sent, Drafts, custom folders):
   - **Right‑click the mailbox** → **Export Mailbox…**
   - Save to a folder, e.g. `~/Documents/emcnotary-mbox-export-YYYYMMDD/`
   - Use a clear name (e.g. `Inbox.mbox`, `Sent.mbox`, `FolderName.mbox`).

Repeat for every emcnotary.com account and every mailbox you care about.

---

## 5. After Backup: Before Reconnecting

- Verify the backup: confirm the copied `Mail` folder (and any `.mbox` exports) exist and have recent dates/sizes.
- Keep the backup in at least two places (e.g. Mac + external or cloud) until you’ve restored mail to the server and confirmed it.

---

## 6. Restoring Mail Back to the Server Later

After the mailserver is back online and the account is reconnected:

- **From .mbox exports:** In Mail, you can **File → Import Mailboxes…** and choose the `.mbox` files. Import into the emcnotary.com account; messages will upload to the server via IMAP.
- **From full Mail folder:** Restoring the whole `~/Library/Mail` folder is more invasive (replaces all Mail data). Safer approach: use the **.mbox** exports to re-import into the emcnotary account so only that account gets the messages back and they sync up to the server.

---

## 7. Checklist

- [ ] Disable each emcnotary.com account (or block sync) so Mail doesn’t sync before backup.
- [ ] Quit Apple Mail.
- [ ] Copy `~/Library/Mail` to a dated backup folder (and optionally compress).
- [ ] Re-open Mail and export each important mailbox (Inbox, Sent, etc.) as `.mbox` for each emcnotary.com account.
- [ ] Store backups in a second location.
- [ ] Re-enable the account only when ready to reconnect and, if needed, import the .mbox files into the emcnotary.com account so mail uploads to the server.
