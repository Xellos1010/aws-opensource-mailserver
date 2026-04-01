# EMC Notary — Anti-Spam DNS (SPF, DKIM, DMARC, Mail-From)

To reduce the chance of mail from **emcnotary.com** being marked as spam, ensure these DNS records are published and correct.

## Quick check (Nx)

```bash
pnpm nx run cdk-emcnotary-instance:admin:verify:anti-spam-dns
```

This verifies apex SPF, DMARC, Mail-From MX/TXT, and SES DKIM CNAMEs. Fix any reported failures using the records below.

---

## 1. Apex SPF (root domain)

**Purpose:** Tells receivers which hosts are allowed to send mail for `emcnotary.com`.

| Field   | Value |
|--------|--------|
| **Name/Host** | `@` or `emcnotary.com` |
| **Type**      | TXT |
| **Value**     | `v=spf1 mx include:amazonses.com ~all` |
| **TTL**       | 3600 (or default) |

- `mx` – Your Mail-in-a-Box server (e.g. `box.emcnotary.com`) is allowed.
- `include:amazonses.com` – AWS SES is allowed (outbound via SES).
- `~all` – SoftFail for other hosts (recommended; use `-all` only if you want hard reject).

---

## 2. DMARC (receiver policy)

**Purpose:** Tells receivers what to do with mail that fails SPF/DKIM alignment (reduces spoofing and improves trust).

| Field   | Value |
|--------|--------|
| **Name/Host** | `_dmarc` or `_dmarc.emcnotary.com` |
| **Type**      | TXT |
| **Value**     | `v=DMARC1; p=quarantine; rua=mailto:admin@emcnotary.com` |
| **TTL**       | 3600 (or default) |

- **p=quarantine** – Put failing mail in spam/junk. Use **p=reject** for strictest policy once you’re confident.
- **p=none** – Monitor only; less protection against spam classification by receivers.
- **rua=** – Where to send aggregate reports (optional but useful).

---

## 3. SES DKIM (3 CNAMEs)

**Purpose:** Sign outbound mail so receivers can verify it’s from you. Required for good deliverability with SES.

Get exact names and targets from the core stack:

```bash
pnpm nx run cdk-emcnotary-instance:admin:ses-dns:print
```

Then add the 3 CNAME records shown (e.g. `*._domainkey.emcnotary.com` → `*.dkim.amazonses.com`). If you use GoDaddy, add them in the DNS panel for `emcnotary.com`.

---

## 4. Mail-From (SES custom MAIL FROM)

**Purpose:** Bounce and complaint handling and alignment with your domain; improves reputation.

**4a. MX for mail.emcnotary.com**

| Field     | Value |
|----------|--------|
| **Name/Host** | `mail` or `mail.emcnotary.com` |
| **Type**      | MX |
| **Priority**  | 10 |
| **Value**     | `feedback-smtp.us-east-1.amazonses.com` (or your SES region) |
| **TTL**       | 3600 |

**4b. TXT (SPF) for mail.emcnotary.com**

| Field   | Value |
|--------|--------|
| **Name/Host** | `mail` or `mail.emcnotary.com` |
| **Type**      | TXT |
| **Value**     | `v=spf1 include:amazonses.com ~all` |
| **TTL**       | 3600 |

---

## Where to add records (EMC Notary)

- **GoDaddy:** DNS management for `emcnotary.com` → add the records above.  
- **Mail-in-a-Box (NSD):** Only if the domain is a DNS-managed domain in MIAB; otherwise use GoDaddy.

After changing DNS, wait 5–60 minutes and re-run:

```bash
pnpm nx run cdk-emcnotary-instance:admin:verify:anti-spam-dns
pnpm nx run cdk-emcnotary-instance:admin:ses:status
```

---

## Summary table

| Record        | Host            | Type | Purpose |
|---------------|-----------------|------|--------|
| Apex SPF      | `@`             | TXT  | Authorize MX + SES |
| DMARC         | `_dmarc`        | TXT  | Policy (quarantine/reject) |
| DKIM 1–3      | (from stack)    | CNAME| SES signing |
| Mail-From MX  | `mail`          | MX   | SES bounces |
| Mail-From SPF | `mail`          | TXT  | SPF for MAIL FROM |

Consistent SPF, DKIM, DMARC, and Mail-From alignment significantly reduce the risk of legitimate mail being marked as spam.
