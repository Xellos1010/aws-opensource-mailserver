# Mailserver Connection Audit — Apple Mail "Connection Timed Out"

**Scope:** `apps/cdk-emc-notary/instance` (EMC Notary mailserver)  
**Symptom:** Apple Mail reports port connection timed out.  
**Date:** 2025-02-19

---

## 1. Executive Summary

The **CDK-defined infrastructure is correct**: the security group allows all required mail ports from any IPv4 address. No misconfiguration was found in code. A **connection timeout** from Apple Mail is therefore likely due to one or more of: **deployed state vs. code**, **instance/application state**, **DNS**, **client/network blocking**, or **wrong host/port in the client**.

---

## 2. What the Code Defines (Audit Results)

### 2.1 Security Group (`@mm/infra-instance-constructs`)

Defined in `libs/infra/instance-constructs/src/lib/security-group.ts`, used by the instance stack.

| Port | Protocol | Source    | Purpose           | Status  |
|------|----------|-----------|-------------------|--------|
| 22   | TCP      | 0.0.0.0/0 | SSH               | OK     |
| 53   | TCP/UDP  | 0.0.0.0/0 | DNS               | OK     |
| 80   | TCP      | 0.0.0.0/0 | HTTP              | OK     |
| 443  | TCP      | 0.0.0.0/0 | HTTPS             | OK     |
| 25   | TCP      | 0.0.0.0/0 | SMTP (STARTTLS)   | OK     |
| 143  | TCP      | 0.0.0.0/0 | IMAP (STARTTLS)   | OK     |
| 993  | TCP      | 0.0.0.0/0 | IMAPS             | OK     |
| 465  | TCP      | 0.0.0.0/0 | SMTPS             | OK     |
| 587  | TCP      | 0.0.0.0/0 | SMTP Submission   | OK     |
| 4190 | TCP      | 0.0.0.0/0 | Sieve             | OK     |

- **Outbound:** `allowAllOutbound: true` — no restriction from the instance.
- **Ingress:** `ec2.Peer.anyIpv4()` — no client IP restriction in code.

**Verdict:** No missing or overly restrictive rules in the CDK security group definition.

### 2.2 Instance Placement

- **VPC:** Default VPC (`ec2.Vpc.fromLookup(..., { isDefault: true })`).
- **Subnet:** Public (`ec2.SubnetType.PUBLIC`).
- **Elastic IP:** EIP from core stack is associated to the instance (`CfnEIPAssociation`).

So the instance is intended to be reachable from the internet on the EIP.

### 2.3 Monitoring (what is checked)

- **Route 53 health check:** HTTPS only, port **443** to `box.<domain>`.
- **Proactive health Lambda:** SSM connectivity + HTTPS to box hostname.
- **No dedicated IMAP/SMTP port checks** in this repo — so 443 can be up while 143/993/587 are down.

---

## 3. Likely Causes of "Connection Timed Out"

A timeout usually means the TCP SYN never gets a SYN-ACK (or the path is blocked before that). Common causes:

| # | Cause | What to check |
|---|--------|----------------|
| 1 | **Deployed SG differs from code** | SG was edited manually or an old deploy is missing rules. |
| 2 | **Instance stopped or wrong EIP** | Instance not running, or EIP not attached / attached to wrong instance. |
| 3 | **Mail-in-a-Box not listening** | MIAB not fully bootstrapped, or dovecot/postfix not bound to 0.0.0.0 or not running. |
| 4 | **Wrong host in Apple Mail** | Using something other than `box.emcnotary.com` (or your actual box hostname). |
| 5 | **Wrong port in Apple Mail** | e.g. using 25 for submission instead of 587; or non-standard port. |
| 6 | **DNS not pointing to EIP** | `box.emcnotary.com` (or box hostname) does not resolve to the instance’s Elastic IP. |
| 7 | **Client/ISP blocking** | Home/corporate firewall or ISP blocking outbound 25, 465, 587, 143, 993. |
| 8 | **NACL** | Custom VPC NACL denying inbound to mail ports (default NACLs allow). |
| 9 | **Region / default VPC** | No default VPC in the deploy region, or wrong region, so lookup fails or wrong VPC used. |

---

## 4. Verification Checklist

Run these in order to see what is actually failing.

### 4.1 Stack and instance (AWS)

```bash
# From repo root, with profile/region set
cd /Users/evanmccall/Projects/aws-opensource-mailserver
source ~/.zshrc && source ~/.nvm/nvm.sh && nvm use 20

# Stack outputs (instance ID, EIP, domain)
pnpm exec nx run cdk-emcnotary-instance:admin:info
```

Confirm:

- Instance state is `running`.
- Elastic IP in the output matches what you expect for the mailserver.
- No recent stack failures: `pnpm exec nx run cdk-emcnotary-instance:admin:events:failed`

### 4.2 Security group in AWS (deployed state)

1. In **EC2 → Security Groups**, find the group used by the mailserver instance (name/ID from `admin:info` or instance details).
2. **Inbound rules:** Verify entries for **143, 993, 587, 465, 25** (and 443 if you use webmail) with source **0.0.0.0/0** (or your expected CIDR). If any are missing or restricted to a narrow CIDR, that can explain timeouts from Apple Mail.

### 4.3 DNS

```bash
# Replace with your box hostname if different (e.g. box.emcnotary.com)
dig +short box.emcnotary.com
```

The A record should be the **Elastic IP** of the instance. If it’s wrong or missing, fix DNS first.

### 4.4 Port reachability from your Mac (where Apple Mail runs)

```bash
# Replace box.emcnotary.com and ports if you use a different host/ports
nc -zv box.emcnotary.com 993   # IMAPS (Apple Mail typically uses this)
nc -zv box.emcnotary.com 587   # SMTP submission
nc -zv box.emcnotary.com 443   # HTTPS (sanity check)
```

- If **443 works** but **993 or 587 timeout**, the problem is likely:
  - SG (or NACL) not allowing 993/587, or
  - Dovecot/Postfix not listening or not bound correctly.
- If **all timeout**, then:
  - Instance down / wrong EIP,
  - DNS not pointing to EIP,
  - Or network/ISP blocking outbound to those ports.

### 4.5 Mail-in-a-Box and listening ports (on the server)

If you have SSH or SSM access:

```bash
# Option A: SSH (after admin:ssh:setup)
# Option B: SSM Session Manager from AWS Console → EC2 → Instance → Connect

# On the instance:
sudo ss -tlnp | grep -E ':25|:143|:443|:587|:993|:465'
# Or:
sudo netstat -tlnp | grep -E ':25|:143|:443|:587|:993|:465'
```

You should see dovecot (143, 993), postfix (25, 587, 465), and nginx (443). If a port is missing, the corresponding service may not be running or not listening on 0.0.0.0.

### 4.6 MIAB status (overall health)

From repo root:

```bash
pnpm exec nx run cdk-emcnotary-instance:admin:miab:status-check
VERBOSE=1 pnpm exec nx run cdk-emcnotary-instance:admin:miab:status-check
```

Address any reported errors (e.g. Postfix/Dovecot down, disk, certs).  
Optional: `admin:availability:report` for a broader availability view.

---

## 5. Apple Mail Configuration (Recommended)

Use the **hostname** that resolves to your EIP (e.g. `box.emcnotary.com`), not the raw IP, so TLS and SNI work.

| Setting    | Recommended value |
|-----------|---------------------|
| **Incoming** | IMAP, host: `box.emcnotary.com`, port **993**, SSL/TLS. |
| **Outgoing** | SMTP, host: `box.emcnotary.com`, port **587**, STARTTLS (or SSL if you prefer 465). |

If you use port **143**, use STARTTLS. Avoid relying on port **25** for submission from Apple Mail.

---

## 6. Summary: What Could Be “Failing”

| Layer              | In code | Possible failure in practice |
|--------------------|--------|-----------------------------|
| Security group     | OK     | Deployed SG missing/restricting mail ports. |
| Instance / EIP     | OK     | Instance stopped or EIP not attached. |
| DNS                | N/A    | `box.emcnotary.com` not pointing to EIP. |
| MIAB / services    | N/A    | Not listening on 143/993/587/465 or not running. |
| Client (Apple Mail)| N/A    | Wrong host/port or SSL option. |
| Network            | N/A    | ISP/firewall blocking outbound mail ports. |
| NACL               | N/A    | Custom NACL blocking inbound. |

**Next steps:** Run the verification steps in §4 (especially **admin:info**, **deployed SG rules**, **dig**, **nc**, and **admin:miab:status-check**). Use the results to see whether the failure is at AWS (SG/instance/DNS), at the server (MIAB/ports), or at the client/network.
