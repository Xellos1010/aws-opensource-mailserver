# EMC Notary — Email Send/Receive Deliverability Report

**Generated:** 2026-03-12  
**Domain:** emcnotary.com  
**Instance:** box.emcnotary.com (3.229.143.6)  
**Project:** `apps/cdk-emc-notary/instance`  
**Nx project:** `cdk-emcnotary-instance`

---

## Executive Summary

| Area | Status | Notes |
|------|--------|--------|
| **Overall deliverability** | ✅ **Healthy** | Instance online; send and receive paths operational |
| **Send path (SMTP)** | ✅ Healthy | Port 587 reachable; Postfix running; SES verified |
| **Receive path (IMAP)** | ✅ Healthy | Port 993 reachable; Dovecot running |
| **SES (outbound)** | ✅ Configured | Domain + DKIM verified; Mail-From status unknown |
| **MIAB system checks** | ⚠️ Unavailable | status_checks.py failed (psutil missing on instance) |

---

## 1. Availability (NX: `admin:availability:report`)

**Command:**
```bash
pnpm nx run cdk-emcnotary-instance:admin:availability:report
```

**Result:** ✅ **ONLINE**

| Metric | Value |
|--------|--------|
| EC2 state | running |
| Instance ID | i-0518bce9a3056e4a6 |
| Public IP | 3.229.143.6 |
| Services running | 6/6 (nginx, dovecot, postfix, php8.0-fpm, nsd, fail2ban) |
| Health checks passing | 7/7 |
| Disk | 42% used (12G free), status ok |

### Send/Receive–Relevant Health Checks

| Check | Status | Details |
|-------|--------|---------|
| SMTP Submission (587) | ✅ healthy | Connected (30ms) |
| IMAPS (993) | ✅ healthy | Connected (34ms) |
| Webmail (Roundcube) | ✅ healthy | HTTP 200 (874ms) |
| Admin Panel | ✅ healthy | HTTP 200 (439ms) |
| DNS (box.emcnotary.com) | ✅ healthy | Resolved to 3.229.143.6 (13ms) |

**Conclusion:** Send (SMTP 587) and receive (IMAPS 993) endpoints are reachable and healthy.

---

## 2. SES Status (NX: `admin:ses:status`)

**Command:**
```bash
pnpm nx run cdk-emcnotary-instance:admin:ses:status
```

**Result:** ✅ **SES ready for sending**

| Item | Status |
|------|--------|
| Domain verification | ✅ Success |
| DKIM | ✅ Success (3 tokens) |
| Mail-From (mail.emcnotary.com) | ⚠️ Verification status unknown |

**Conclusion:** Outbound mail via SES is configured and domain/DKIM are verified. Mail-From can be rechecked or set via `admin:ses-dns` if needed.

---

## 3. MIAB Status Check (NX: `admin:miab:status-check`)

**Command:**
```bash
OUTPUT_FILE=./emcnotary-deliverability-report-miab.json pnpm nx run cdk-emcnotary-instance:admin:miab:status-check
```

**Result:** ⚠️ **No checks parsed**

- Status checks script on the instance failed: `ModuleNotFoundError: No module named 'psutil'` in `/opt/mailinabox/management/status_checks.py`.
- Deliverability conclusion is based on availability report and SES status only; MIAB dashboard checks were not available.

---

## 4. Send/Receive Summary

### Send (outbound)

- **SMTP submission:** box.emcnotary.com:587 — ✅ reachable (availability report).
- **Postfix:** ✅ running (availability report).
- **SES:** ✅ domain and DKIM verified (SES status).
- **Optional manual test:**  
  `admin:mail:flow:test` (requires `FROM_EMAIL`, `FROM_PASSWORD`, `TO`) or  
  `tools/send-test-email.cli.ts` (requires `FROM_PASSWORD`).

### Receive (inbound)

- **IMAPS:** box.emcnotary.com:993 — ✅ reachable (availability report).
- **Dovecot:** ✅ running (availability report).
- **Webmail:** ✅ Roundcube HTTP 200 (availability report).

---

## 5. NX Tasks Reference (EMC Notary)

| Nx target | Purpose |
|-----------|--------|
| `admin:availability:report` | EC2, services, HTTP/HTTPS, SMTP 587, IMAPS 993, DNS, disk |
| `admin:ses:status` | SES domain, DKIM, Mail-From |
| `admin:miab:status-check` | MIAB status_checks.py output (SSH); currently failing on instance |
| `admin:mail:flow:test` | Send test mail + IMAP auth (requires FROM_EMAIL, FROM_PASSWORD, TO) |

**Regenerate this style of report:**
```bash
# Availability (no secrets)
pnpm nx run cdk-emcnotary-instance:admin:availability:report

# SES
pnpm nx run cdk-emcnotary-instance:admin:ses:status

# MIAB status (writes JSON if OUTPUT_FILE set)
OUTPUT_FILE=./emcnotary-deliverability-report-miab.json pnpm nx run cdk-emcnotary-instance:admin:miab:status-check

# Optional: full send/receive test (requires credentials)
# FROM_EMAIL=admin@emcnotary.com FROM_PASSWORD=*** TO=you@example.com \
#   pnpm nx run cdk-emcnotary-instance:admin:mail:flow:test
```

---

## 6. Artifacts

- Availability (JSON): `availability-report-emcnotary.com-1773332551340.json` (or latest `availability-report-emcnotary.com-*.json`).
- MIAB (JSON): `emcnotary-deliverability-report-miab.json` (summary only; checks empty due to psutil error).

---

## 7. Anti-Spam DNS (avoid being marked as spam)

Run the anti-spam DNS verification to ensure SPF, DMARC, DKIM, and Mail-From are correctly set:

```bash
pnpm nx run cdk-emcnotary-instance:admin:verify:anti-spam-dns
```

This checks: apex SPF, DMARC at _dmarc.\<domain>, Mail-From MX/TXT, and SES DKIM CNAMEs. See **docs/EMCNOTARY-ANTI-SPAM-DNS.md** for required records and how to fix any failures.

---

## 8. Recommendations

1. **Deliverability:** Send and receive paths are up; no change required for basic deliverability.
2. **Anti-spam:** Keep SPF, DMARC, DKIM, and Mail-From in place; re-run `admin:verify:anti-spam-dns` after any DNS changes.
3. **MIAB status checks:** Install or fix `psutil` on the instance so `status_checks.py` runs and `admin:miab:status-check` returns full results.
4. **Mail-From:** Optionally run `admin:ses-dns` and re-run `admin:ses:status` to confirm Mail-From verification.
5. **Ongoing checks:** Run `admin:availability:report`, `admin:ses:status`, and `admin:verify:anti-spam-dns` periodically (e.g. in CI or cron) to monitor deliverability and spam risk.
