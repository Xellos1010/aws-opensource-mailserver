# Mail server operations bible

Consolidated, domain-neutral guidance for running Mail-in-a-Box on AWS using this monorepo’s CDK apps and tooling. Replace `example.com` with your apex domain and set `DOMAIN` consistently.

## 1. Reference CDK layout

This repository ships a **three-app** reference pattern under `apps/clients/cdk-client-example/`:

| Nx project | Role |
|------------|------|
| `cdk-client-example-core` | SES identity, S3 (backup / Nextcloud), SNS for alarms, CloudWatch logs/agent config, SSM parameters shared with the instance |
| `cdk-client-example-instance` | EC2, security groups, Elastic IP, key pair, IAM, alarms and emergency automation wired in CDK |
| `cdk-client-example-observability-maintenance` | Post-bootstrap observability, recovery helpers, disk cleanup wrappers |

**Feature flag:** set `FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1` for synth/deploy/destroy of these stacks (see each app’s `project.json`).

**Typical order:** core → instance → observability-maintenance. Use `DOMAIN=example.com` (and optional `INSTANCE_DNS`, `CORE_PARAM_PREFIX`) so SSM paths and stack names follow `@mm/infra-naming` (see [ADR-001](../adr/001-infra-naming-standard.md)).

## 2. Synth and deploy (minimal)

```bash
export FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1
export DOMAIN=example.com
export CDK_DEFAULT_ACCOUNT=<account-id>
export CDK_DEFAULT_REGION=us-east-1

pnpm nx run cdk-client-example-core:synth
pnpm nx run cdk-client-example-core:deploy

pnpm nx run cdk-client-example-instance:synth
pnpm nx run cdk-client-example-instance:deploy

pnpm nx run cdk-client-example-observability-maintenance:deploy
```

For more targets and ops-runner stack commands, see [nx-cdk-reference.md](./nx-cdk-reference.md).

## 3. Mail-in-a-Box bootstrap and repair

Bootstrap runs via SSM after the instance exists and core parameters are published:

```bash
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=example.com \
  pnpm nx run ops-runner:run -- instance:bootstrap
```

**Cleanup and re-bootstrap** (preserves `/home/user-data` in the default cleanup mode):

```bash
pnpm nx run cdk-client-example-instance:admin:miab:cleanup
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 \
  pnpm nx run cdk-client-example-instance:admin:bootstrap-miab-ec2-instance
pnpm nx run cdk-client-example-instance:admin:miab:audit
```

Aggressive cleanup (still oriented around data preservation) may be exposed via env vars on the same target—check the task definition in `apps/clients/cdk-client-example/instance/project.json`.

## 4. Bring-up order of operations (high level)

1. Deploy **core**, then **instance**; confirm SSM parameters exist for your `DOMAIN`.
2. **Bootstrap** MIAB on the instance (`ops-runner` or `cdk-client-example-instance` admin bootstrap target).
3. Complete **TLS/DNS** in MIAB admin as required for your registrar split.
4. Deploy **observability-maintenance** so recovery and disk jobs match your SSM contract.
5. Run **mailbox permission checks** if your pipeline includes them (`admin:mailboxes:permissions:*` targets on the instance app—see `project.json`).

Keep the same `AWS_PROFILE` / `AWS_REGION` across steps.

## 5. Monitoring and OOM

**Alarms (conceptual):** instance status, system status, OOM-kill metric from syslog, memory and swap high-water marks, routed to the SNS topic created in core.

**OOM:** syslog is tailed into CloudWatch; a metric filter increments on “Out of memory”. Treat sustained memory pressure with disk cleanup, service checks, then controlled **stop/start** (not only reboot) if the instance is wedged.

**Health checks:** use CloudWatch, SSM `describe-instance-information`, and HTTPS checks to the box web UI. If EC2 status is OK but SSM and HTTP fail, treat as **zombie-like** (next section).

## 6. Zombie-like instances and recovery

Symptoms: EC2 state and status checks OK, but SSM `ConnectionLost`, webmail HTTPS fails, or mail ports unreachable.

**Recovery:** perform a full **EC2 stop → wait stopped → start → wait running** cycle. Use AWS CLI or your approved automation; avoid relying solely on reboot for this class of fault.

**Prevention:** combine infrastructure metrics with **application-level** signals (HTTPS health checks, SSM connectivity, proactive Lambdas if deployed in your observability stack).

## 7. Emergency auto-restart (pattern)

Critical alarms (instance status, system status, OOM kill) can invoke a Lambda that **stops then starts** the instance. Exact wiring depends on your synthesized template; validate in the CDK app before production.

For **domain-scoped** manual stop/start via ops-runner (when implemented for your domain):

```bash
pnpm nx run ops-runner:run -- ec2:stop-start example.com
```

## 8. Restore workflow and disk space

Before large restores, run disk cleanup where your stack exposes it, for example:

```bash
pnpm nx run cdk-client-example-observability-maintenance:admin:cleanup:disk-space
# DRY_RUN=1 ... for a dry run if supported
```

Restore flows generally: ensure stacks healthy → bootstrap if needed → restore DNS from backup → **create mail users then restore maildirs** to avoid permission and quota issues. Prefer the restore orchestration targets or `tools/*.cli.ts` scripts documented in `project.json` for your domain.

## 9. DNS: SPF, DMARC, DKIM, Mail-From (SES + MIAB)

Use your DNS provider or MIAB’s DNS as appropriate.

| Record | Host | Type | Typical value / notes |
|--------|------|------|------------------------|
| Apex SPF | `@` | TXT | `v=spf1 mx include:amazonses.com ~all` — authorizes MIAB MX and SES |
| DMARC | `_dmarc` | TXT | e.g. `v=DMARC1; p=none` or `quarantine` plus `rua=` for reports |
| SES DKIM | (three CNAMEs from SES) | CNAME | Print with your stack’s SES DNS helper target, e.g. `cdk-client-example-instance:admin:ses-dns:print` if defined |
| MAIL FROM | `mail` (or chosen subdomain) | MX | SES region feedback endpoint, e.g. `feedback-smtp.us-east-1.amazonses.com` priority 10 |
| MAIL FROM SPF | same host | TXT | `v=spf1 include:amazonses.com ~all` |

Re-run your stack’s **anti-spam / SES verification** admin target after changes.

## 10. Testing

Prefer `pnpm nx affected` for day-to-day work. For mail stacks, use the **instance** app’s `test` / `e2e` targets and any `admin:miab:status-check` style tasks. Pass real `--domain` and backup paths only in secured environments; never commit customer paths.

## 11. Backup bucket sanity check

To confirm backups are landing in the expected bucket (replace placeholders):

```bash
aws ssm get-parameter --name /<your-domain-tld>/core/backupBucket --query Parameter.Value --output text
aws s3 ls "s3://<bucket-name>/" --summarize
aws s3api list-objects-v2 --bucket <bucket-name> --max-keys 20 --delimiter '/'
```

## 12. Apple Mail and client cutovers

Before changing DNS or TLS endpoints, export or sync important mail locally and quit Mail so caches do not mask connectivity issues during cutover.

## 13. Further reading

- [local-operations.md](./local-operations.md) — ops-runner catalog
- [nx-cdk-reference.md](./nx-cdk-reference.md) — Nx task matrix
- [Alarm runbooks](../runbooks/observability-maintenance/README.md)
- [Flagship agent orchestration](../runbooks/flagship-agent-orchestration.md) (maintainer SDLC)
