# MCP Modules Design — aws-opensource-mailserver

A feature map of every generic utility and pipeline in this monorepo, organized as
candidate MCP (Model Context Protocol) server modules. Each module wraps a cohesive
cluster of existing library, tool, or API capability and exposes it as callable MCP tools.

---

## Summary Table

| Module | Source Roots | Tool Count |
|--------|-------------|-----------|
| [mcp-aws-ec2](#mcp-aws-ec2) | `libs/admin/admin-ec2`, `apps/ops-runner` | 6 |
| [mcp-aws-ssm](#mcp-aws-ssm) | `libs/admin/admin-credentials`, ops-runner cmds | 5 |
| [mcp-aws-cfn](#mcp-aws-cfn) | `libs/admin/admin-stack-info`, `admin-stack-events`, `admin-s3-empty` | 6 |
| [mcp-aws-kms](#mcp-aws-kms) | `libs/admin/admin-kms` | 3 |
| [mcp-aws-cost](#mcp-aws-cost) | `tools/aws-account-cfn-cost-report.cli.ts`, `aws-stack-cost-activity-report.cli.ts`, `hepe-aws-report.cli.ts` | 3 |
| [mcp-dns](#mcp-dns) | `libs/admin/admin-dns-api`, `admin-dns-backup`, `admin-dns-restore`, `godaddy-dns`, `ses-dns`, `admin-reverse-dns` | 12 |
| [mcp-ssl](#mcp-ssl) | `libs/admin/admin-ssl-check`, `admin-ssl-provision`, `tools/ssl-*.cli.ts` | 5 |
| [mcp-mail-backup](#mcp-mail-backup) | `libs/admin/admin-mail-backup`, `admin-mailbox-restore`, `admin-users-backup` | 6 |
| [mcp-mail-users](#mcp-mail-users) | `tools/manage-miab-users.cli.ts`, `*-via-ssm` variants, password tools | 12 |
| [mcp-mail-flow](#mcp-mail-flow) | `tools/check-mail-*.cli.ts`, `repair-mail-delivery`, `fix-postgrey`, `fix-mailbox-permissions` | 8 |
| [mcp-webmail](#mcp-webmail) | `tools/check-webmail-*.cli.ts`, `diagnose-roundcube-*.cli.ts`, `fix-webmail-*.cli.ts` | 6 |
| [mcp-instance-lifecycle](#mcp-instance-lifecycle) | `libs/admin/instance-provision`, `support-scripts/aws/instance-bootstrap`, `tools/bootstrap-*.cli.ts`, `tools/disk/*.cli.ts` | 9 |
| [mcp-ssh](#mcp-ssh) | `libs/admin/admin-ssh`, `ssh-access` | 5 |
| [mcp-cdk-stacks](#mcp-cdk-stacks) | `apps/cdk-*`, `libs/infra/naming`, `libs/infra/core-params`, `libs/infra/config-loader` | 8 |
| [mcp-cms](#mcp-cms) | `libs/cms/core`, `libs/cms/contracts`, `libs/cms/persistence`, `apps/cms-api` | 22 |
| [mcp-health](#mcp-health) | `tools/health-gate.cli.ts`, `system-status-report.cli.ts`, `availability-report.cli.ts`, `miab-status-check.cli.ts`, `monitor-disk-space.cli.ts` | 5 |
| [mcp-incident-response](#mcp-incident-response) | `tools/repair-mail-delivery.cli.ts`, recovery Lambdas, `cleanup-disk-space.cli.ts`, `expand-root-volume.cli.ts` | 7 |
| [mcp-domain-bringup](#mcp-domain-bringup) | `tools/verify-and-setup-*.cli.ts`, `restore-emcnotary.cli.ts`, `restore-k3frame.cli.ts` | 4 |

---

## Module Specifications

### mcp-aws-ec2

**Purpose:** Control EC2 instances by domain name or instance ID. Abstracts stack-output
resolution so callers never need to know instance IDs directly.

**Source:** `libs/admin/admin-ec2/src/lib/ec2.ts`, `apps/ops-runner/src/commands/ec2.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `ec2_start` | `domain` or `instanceId` | Start a stopped instance |
| `ec2_stop` | `domain` or `instanceId` | Stop a running instance |
| `ec2_restart` | `domain` or `instanceId` | Stop then start |
| `ec2_stop_start` | `domain` or `instanceId` | Graceful stop+start cycle |
| `ec2_change_type` | `domain`, `instanceType` | Change instance type (requires stop) |
| `ec2_describe` | `domain` or `instanceId` | Return state, IP, type, launch time |

**Shared dependencies:** `admin-stack-info.getStackInfo` for domain→instance resolution.

---

### mcp-aws-ssm

**Purpose:** Execute RunCommand scripts on instances and read/write SSM Parameter Store.

**Source:** `libs/admin/admin-credentials`, `libs/admin/admin-account/src/lib/ssh-command.ts` (SSM RunCommand path), `tools/list-smtp-params.cli.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `ssm_run_command` | `instanceId`, `commands[]`, `timeout?` | Send SSM RunCommand and stream output |
| `ssm_get_parameter` | `name`, `withDecryption?` | Read a single SSM parameter |
| `ssm_put_parameter` | `name`, `value`, `type` | Write/update a parameter |
| `ssm_list_parameters` | `pathPrefix` | List params under a path prefix |
| `ssm_get_admin_credentials` | `domain` | Return `{ email, password }` from SSM for a domain |

---

### mcp-aws-cfn

**Purpose:** Inspect and operate on CloudFormation stacks — resolve outputs, surface
failure events, and safely destroy stacks (including bucket emptying).

**Source:** `libs/admin/admin-stack-info`, `admin-stack-events`, `admin-s3-empty`

| Tool | Input | Description |
|------|-------|-------------|
| `cfn_get_stack_info` | `domain`, `app?` | Return stack name, status, and all outputs |
| `cfn_get_stack_outputs` | `stackName` | Return raw key→value output map |
| `cfn_get_failed_events` | `stackName` | Return only FAILED resource events |
| `cfn_get_all_events` | `stackName`, `limit?` | Return recent events formatted |
| `cfn_list_stack_buckets` | `stackName` | Return all S3 buckets in a stack |
| `cfn_empty_stack_buckets` | `stackName` | Empty (purge versions + delete markers) all buckets before stack destroy |

---

### mcp-aws-kms

**Purpose:** Manage KMS key rotation state.

**Source:** `libs/admin/admin-kms/src/lib/kms.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `kms_enable_rotation` | `keyId` | Enable automatic key rotation |
| `kms_disable_rotation` | `keyId` | Disable automatic key rotation |
| `kms_rotation_status` | `keyId` | Return rotation enabled/disabled + last rotation date |

---

### mcp-aws-cost

**Purpose:** Generate cost and inventory reports scoped to CloudFormation stacks,
orphan-tagged resources, and cost allocation tags.

**Source:** `tools/aws-account-cfn-cost-report.cli.ts`, `aws-stack-cost-activity-report.cli.ts`, `hepe-aws-report.cli.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `cost_account_report` | `profile`, `startDate?`, `endDate?` | CFN stacks + orphan resources + Cost Explorer totals |
| `cost_stack_report` | `stackName`, `profile` | Per-stack cost allocation + CloudWatch usage |
| `cost_hepe_report` | `profile` | HEPE-scoped inventory and cost summary |

---

### mcp-dns

**Purpose:** Full DNS lifecycle — MIAB API records, GoDaddy registrar control, SES DNS
provisioning, SPF/DKIM/DMARC audit, backup and restore.

**Source:** `libs/admin/admin-dns-api`, `admin-dns-backup`, `admin-dns-restore`, `godaddy-dns`, `ses-dns`, `admin-reverse-dns`, plus `tools/add-custom-dns-record.cli.ts`, `list-miab-dns.cli.ts`, `audit-miab-nameserver.cli.ts`, `set-ses-dns-miab.cli.ts`, `verify-anti-spam-dns.cli.ts`, `setup-website-dns.cli.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `dns_list_records` | `domain` | List all DNS records via MIAB API |
| `dns_add_record` | `domain`, `name`, `type`, `value`, `ttl?` | Add custom DNS record via MIAB API |
| `dns_backup` | `domain`, `destPath` | Export all MIAB DNS records to JSON backup |
| `dns_restore` | `domain`, `backupPath` | Restore DNS records from backup |
| `dns_set_ses_records` | `domain` | Push SES DKIM/SPF/DMARC records via MIAB API |
| `dns_verify_anti_spam` | `domain` | Check SPF, DKIM, DMARC, Mail-From; return pass/fail per check |
| `dns_setup_website` | `domain`, `ip` | Set A records for website via MIAB API |
| `dns_godaddy_get_records` | `domain` | Fetch DNS records from GoDaddy |
| `dns_godaddy_set_hostnames` | `domain`, `records[]` | Set A/CNAME records in GoDaddy |
| `dns_godaddy_set_nameservers` | `domain`, `nameservers[]` | Delegate domain to custom nameservers |
| `dns_set_reverse_dns` | `allocationId`, `ptr` | Set EC2 EIP reverse DNS PTR record |
| `dns_audit_nameserver` | `domain` | Audit NSD authoritative config on MIAB |

---

### mcp-ssl

**Purpose:** Check and provision TLS certificates via MIAB Let's Encrypt integration.

**Source:** `libs/admin/admin-ssl-check`, `admin-ssl-provision`, `tools/ssl-provision.cli.ts`, `ssl-provision-api.cli.ts`, `ssl-status.cli.ts`, `audit-miab-ssl-provision.cli.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `ssl_check` | `hostname`, `port?` | Return cert issuer, expiry, SANs, days remaining |
| `ssl_domains_needing_certs` | `domain` | List domains without valid certs on MIAB |
| `ssl_provision` | `domain`, `domains[]` | Run MIAB SSL provision script for listed domains |
| `ssl_deploy` | `domain`, `certPath`, `keyPath` | Upload and activate cert via MIAB API |
| `ssl_audit` | `domain` | Full audit: check + status + provision state |

---

### mcp-mail-backup

**Purpose:** IMAP mailbox backup to S3, restore from S3, user list backup, and
multi-folder aggregation for domain migrations.

**Source:** `libs/admin/admin-mail-backup`, `admin-mailbox-restore`, `admin-users-backup`, `tools/archive-master-backup.cli.ts`, `sync-master-backup.cli.ts`, `restore-aggregated-mailboxes.cli.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `mail_backup_mailboxes` | `domain`, `s3Bucket`, `profile` | IMAP → S3 incremental backup |
| `mail_backup_users` | `domain`, `destPath` | Export user list to JSON |
| `mail_restore_mailboxes` | `domain`, `s3Bucket`, `profile` | Restore mailboxes from S3 |
| `mail_aggregate_backups` | `backupRoot`, `destPath` | Merge backup folders from multiple runs |
| `mail_restore_aggregated` | `domain`, `aggregatedPath` | Restore from aggregated backup |
| `mail_sync_master_backup` | `localRoot`, `s3Bucket` | Sync master backup archive to S3 |

---

### mcp-mail-users

**Purpose:** CRUD on MIAB user accounts via HTTP API and SSM fallback paths, plus
password sync and verification.

**Source:** `tools/manage-miab-users.cli.ts`, `create-admin-account.cli.ts`, `create-admin-via-ssm.cli.ts`, `create-multiple-users.cli.ts`, `recreate-users.cli.ts`, `recreate-users-via-ssm.cli.ts`, `remove-all-users.cli.ts`, `set-user-password.cli.ts`, `sync-admin-password.cli.ts`, `verify-admin-password.cli.ts`, `verify-user-password.cli.ts`, `diagnose-password.cli.ts`, `get-admin-credentials.cli.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `users_list` | `domain` | List all MIAB users |
| `users_create` | `domain`, `email`, `password`, `role?` | Create a single user |
| `users_create_bulk` | `domain`, `users[]` | Create multiple users from list |
| `users_create_admin` | `domain` | Create admin@domain account (HTTP or SSM fallback) |
| `users_recreate_all` | `domain`, `userList[]` | Remove and recreate all users |
| `users_remove_all` | `domain`, `safelist[]` | Remove all users except safelist |
| `users_set_password` | `domain`, `email`, `password` | Set user password via SSM |
| `users_sync_admin_password` | `domain` | Pull password from SSM → push to MIAB |
| `users_verify_admin_password` | `domain` | Confirm SSM password matches MIAB |
| `users_verify_password` | `domain`, `email`, `password` | Test credentials against MIAB |
| `users_diagnose_password` | `domain`, `email` | Diagnose password storage issues |
| `users_get_admin_credentials` | `domain` | Return admin email + password from SSM |

---

### mcp-mail-flow

**Purpose:** Inspect and repair the Postfix/Dovecot mail pipeline.

**Source:** `tools/check-mail-filter.cli.ts`, `check-mail-queue.cli.ts`, `repair-mail-delivery.cli.ts`, `send-test-email.cli.ts`, `test-email-deliverability.cli.ts`, `test-mail-flow.cli.ts`, `test-imap-auth.cli.ts`, `verify-dovecot-users.cli.ts`, `fix-postgrey.cli.ts`, `fix-mailbox-permissions.cli.ts`, `check-mailbox-root-permissions.cli.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `mail_check_queue` | `domain` | Return Postfix queue status and recent logs |
| `mail_check_filter` | `domain` | Inspect content filter / port 10023 |
| `mail_repair_delivery` | `domain` | Apply common delivery repairs |
| `mail_send_test` | `domain`, `to` | Send test email via SMTP |
| `mail_test_deliverability` | `domain`, `to` | Full send + receive verification |
| `mail_test_imap_auth` | `domain`, `email` | Test IMAP auth via doveadm |
| `mail_verify_dovecot_users` | `domain` | Check Dovecot userdb mappings |
| `mail_fix_postgrey` | `domain` | Repair postgrey lock/permissions and restart |

---

### mcp-webmail

**Purpose:** Diagnose and repair Roundcube webmail.

**Source:** `tools/check-webmail-installation.cli.ts`, `diagnose-roundcube-login.cli.ts`, `fix-roundcube-session.cli.ts`, `fix-webmail-401.cli.ts`, `diagnose-webmail-401.cli.ts`, `pull-webmail-logs.cli.ts`, `pull-dovecot-logs.cli.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `webmail_check_install` | `domain` | Verify Roundcube installation and config |
| `webmail_diagnose_login` | `domain` | Inspect PHP sessions + logs for login failures |
| `webmail_fix_session` | `domain` | Ensure PHP session dir is writable |
| `webmail_diagnose_401` | `domain` | Diagnose 401 response causes |
| `webmail_fix_401` | `domain` | Apply 401 fixes |
| `webmail_pull_logs` | `domain` | Retrieve webmail and Dovecot logs |

---

### mcp-instance-lifecycle

**Purpose:** Full instance lifecycle from provisioning through ongoing maintenance:
bootstrap, status polling, disk management, nightly reboot scheduling.

**Source:** `libs/admin/instance-provision`, `libs/support-scripts/aws/instance-bootstrap`, `libs/support-scripts/aws/instance`, `tools/instance-bootstrap.cli.ts`, `instance-setup.cli.ts`, `bootstrap-confirm.cli.ts`, `bootstrap-logs.cli.ts`, `bootstrap-status.cli.ts`, `test-bootstrap-complete.cli.ts`, `monitor-disk-space.cli.ts`, `cleanup-disk-space.cli.ts`, `expand-root-volume.cli.ts`, `fix-ssm-agent.cli.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `instance_provision` | `domain`, `config` | Full provision: SSH + SES DNS setup |
| `instance_bootstrap` | `domain` | Run MIAB bootstrap via SSM and enforce mailbox-permissions |
| `instance_bootstrap_status` | `domain` | Return latest SSM command ID for bootstrap |
| `instance_bootstrap_logs` | `domain`, `commandId` | Stream bootstrap log output |
| `instance_bootstrap_confirm` | `domain` | Confirm bootstrap completed via SSH |
| `instance_test_bootstrap_complete` | `domain` | Automated pass/fail for bootstrap completion |
| `instance_monitor_disk` | `domain`, `threshold?` | Report disk usage; return warning if above threshold |
| `instance_cleanup_disk` | `domain` | Remove old logs and temp files |
| `instance_expand_volume` | `domain` | Expand EBS root volume |

---

### mcp-ssh

**Purpose:** SSH key management, agent integration, connection testing.

**Source:** `libs/admin/admin-ssh`, `libs/admin/ssh-access`

| Tool | Input | Description |
|------|-------|-------------|
| `ssh_get_key_path` | `domain` | Return path to SSH private key for domain |
| `ssh_setup_key` | `domain` | Provision and store SSH key |
| `ssh_setup_for_stack` | `domain` | Setup SSH key + known_hosts for stack |
| `ssh_test_connection` | `domain` | Verify SSH connectivity returns pass/fail |
| `ssh_setup_access` | `domain` | Full setup + test in one call |

---

### mcp-cdk-stacks

**Purpose:** Deploy, destroy, diff, and inspect CDK stacks across all apps, using
centralized naming and parameter resolution.

**Source:** `apps/cdk-emc-notary`, `apps/cdk-k3frame`, `apps/cdk-askdaokapra`, `apps/cdk-cms-outreach`, `apps/cdk-mailservers-backups`, `libs/infra/naming`, `libs/infra/core-params`, `libs/infra/config-loader`

| Tool | Input | Description |
|------|-------|-------------|
| `cdk_deploy` | `app`, `stackType`, `domain`, `profile` | `cdk deploy` for core/instance/observability stack |
| `cdk_destroy` | `app`, `stackType`, `domain`, `profile` | `cdk destroy` (empties S3 first) |
| `cdk_diff` | `app`, `stackType`, `domain`, `profile` | `cdk diff` and return change summary |
| `cdk_synth` | `app`, `stackType`, `domain` | `cdk synth` and return template |
| `cdk_resolve_stack_name` | `domain`, `stackType` | Return canonical stack name for a domain |
| `cdk_get_core_params` | `domain` | Return all SSM core parameter names for a domain |
| `cdk_get_deployment_config` | `profile?` | Load deployment config with account/region |
| `cdk_get_instance_stack_name` | `domain` | Shortcut for instance stack name resolution |

---

### mcp-cms

**Purpose:** Full CMS platform API — authentication, contact/account management, outbound
calling pipeline, AI transcript extraction, messaging, feature flags, and audit logs.
Wraps `CmsService` and maps to `cms-api` REST routes.

**Source:** `libs/cms/core`, `libs/cms/contracts`, `libs/cms/persistence`, `apps/cms-api/src/server.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `cms_login` | `email`, `password` | Authenticate → return `AuthTokens` |
| `cms_refresh` | `refreshToken` | Refresh access token |
| `cms_get_me` | *(bearer)* | Return authenticated user profile |
| `cms_list_contacts` | *(bearer)*, `filters?` | List contacts with optional filter |
| `cms_create_contact` | *(bearer)*, `ContactDTO` | Create contact |
| `cms_get_contact` | *(bearer)*, `id` | Get single contact |
| `cms_patch_contact` | *(bearer)*, `id`, `patch` | Update contact fields |
| `cms_add_note` | *(bearer)*, `contactId`, `text` | Add note to contact |
| `cms_add_follow_up` | *(bearer)*, `contactId`, `followUp` | Schedule follow-up |
| `cms_transition_stage` | *(bearer)*, `contactId`, `targetStage` | Move contact through pipeline stage |
| `cms_list_accounts` | *(bearer)* | List accounts |
| `cms_list_stages` | *(bearer)* | List pipeline stages |
| `cms_start_call` | *(bearer)*, `contactId`, `OutboundCallInput` | Initiate outbound call |
| `cms_end_call` | *(bearer)*, `callId` | End active call |
| `cms_get_call` | *(bearer)*, `callId` | Get call record |
| `cms_get_transcript` | *(bearer)*, `callId` | Get call transcript |
| `cms_extract_call` | *(bearer)*, `callId` | Run AI extraction on call |
| `cms_get_ai_summary` | *(bearer)*, `callId` | Get AI-generated call summary |
| `cms_approve_ai_summary` | *(bearer)*, `callId` | Approve AI summary |
| `cms_send_email` | *(bearer)*, `to`, `subject`, `body` | Send outbound email |
| `cms_send_sms` | *(bearer)*, `to`, `body` | Send outbound SMS |
| `cms_get_audit_logs` | *(bearer)*, `filters?` | Return audit log entries (owner/manager) |

---

### mcp-health

**Purpose:** System-wide health reporting — MIAB status checks, availability reports,
disk monitoring, and post-deploy health gates.

**Source:** `tools/health-gate.cli.ts`, `system-status-report.cli.ts`, `availability-report.cli.ts`, `miab-status-check.cli.ts`, `monitor-disk-space.cli.ts`, `check-ses-status.cli.ts`, `poll-ses-status.cli.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `health_gate` | `domain`, `checks[]?` | Run all health checks; return pass/fail gating result |
| `health_system_status` | `domain` | Comprehensive MIAB system status report |
| `health_availability_report` | `domain` | Availability uptime report |
| `health_miab_status` | `domain` | Parse MIAB `/admin/status` checks |
| `health_ses_status` | `domain` | SES identity verification status; optionally poll until verified |

---

### mcp-incident-response

**Purpose:** Composite incident response — combines health detection with repair and
recovery actions. Maps to Lambda-backed recovery orchestrator and service restart paths.

**Source:** `tools/repair-mail-delivery.cli.ts`, `fix-mailbox-permissions.cli.ts`, `fix-ses-iam-permissions.cli.ts`, `cleanup-disk-space.cli.ts`, `expand-root-volume.cli.ts`, `fix-ssm-agent.cli.ts`, `libs/infra/mailserver-recovery` (EmergencyAlarms, RecoveryOrchestratorLambda, ServiceRestartLambda, SystemResetLambda)

| Tool | Input | Description |
|------|-------|-------------|
| `incident_repair_mail` | `domain` | Apply all standard mail-delivery repair steps |
| `incident_fix_permissions` | `domain` | Fix mailbox ownership and permission |
| `incident_fix_ses_iam` | `domain` | Repair SMTP IAM user permissions |
| `incident_cleanup_disk` | `domain` | Remove logs/temp to reclaim disk |
| `incident_expand_volume` | `domain` | Expand EBS root volume on a live instance |
| `incident_fix_ssm_agent` | `domain` | Reinstall SSM agent via SSH |
| `incident_trigger_recovery_lambda` | `domain`, `action` | Invoke recovery orchestrator Lambda directly |

---

### mcp-domain-bringup

**Purpose:** End-to-end domain bring-up pipeline — a composite of all lower-level tools
in the correct order: stack check → DNS → users → SSL → health gate.

**Source:** `tools/verify-and-setup-emcnotary.cli.ts`, `verify-and-setup-k3frame.cli.ts`, `restore-emcnotary.cli.ts`, `restore-k3frame.cli.ts`, `test-and-restore-e2e.cli.ts`

| Tool | Input | Description |
|------|-------|-------------|
| `bringup_verify_and_setup` | `domain`, `profile`, `options` | Full verify+setup pipeline: stack → DNS → mailboxes → users → SSL → health gate |
| `bringup_restore` | `domain`, `backupBucket`, `profile` | Restore domain from backup: DNS + mailboxes + users |
| `bringup_test_e2e` | `domain`, `profile` | End-to-end test + restore verification pipeline |
| `bringup_diagnose_deployment` | `domain`, `app` | Diagnose CFN early-validation failures for a domain's CDK app |

---

## Implementation Notes

### Transport
All modules should be implemented as a single MCP server binary with namespace-prefixed
tools (e.g. `ec2_start`, `dns_list_records`). Grouping into separate server processes is
optional for isolation but a monolithic server with namespace prefixes is easier to
maintain.

### Authentication
All AWS-touching tools accept an optional `profile` parameter defaulting to the current
AWS SDK credential chain. The CMS module uses bearer-token authentication passed as a
tool input or stored in MCP session context.

### Observability
The `godaddy-dns` lib already contains generic `logger`, `withSpan`, and metrics
primitives. These should be extracted to a shared `libs/observability` package and used
by all MCP tool handlers for structured logging and trace correlation.

### HEPE Guard
Any tool that touches EC2 instances, S3 buckets, CloudFormation stacks, or EIPs must
call a shared `assertNotHepe(resource)` guard before performing destructive operations.
The guard list is defined in `memory/project_hepe_production.md`:
- Instance: `i-0a1ff83f513575ed4`
- EIP: `44.194.23.56`
- Stacks: `hepefoundation-org-*` (7 stacks)
- Buckets: `hepefoundation-*`, `transcribe-files-hepe`

### Priority Order for Implementation

1. **mcp-aws-ec2** + **mcp-aws-ssm** + **mcp-aws-cfn** — foundational, everything else uses them
2. **mcp-dns** — highest operational value, covers MIAB + GoDaddy + SES
3. **mcp-mail-users** + **mcp-mail-flow** — daily operational tooling
4. **mcp-health** + **mcp-incident-response** — ops automation
5. **mcp-ssl** + **mcp-instance-lifecycle** — provisioning path
6. **mcp-cdk-stacks** — deployment automation
7. **mcp-cms** — CMS platform tooling
8. **mcp-domain-bringup** — composite, built last from lower-level tools
9. **mcp-mail-backup** + **mcp-ssh** + **mcp-aws-kms** + **mcp-aws-cost** — supporting utilities
10. **mcp-webmail** — narrow scope, implement last
