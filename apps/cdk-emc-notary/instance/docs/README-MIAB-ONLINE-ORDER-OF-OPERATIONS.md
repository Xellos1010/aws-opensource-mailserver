# MIAB Online Order of Operations (Agent Runbook)

## Purpose
Use this runbook when bringing a new Mail-in-a-Box (MIAB) instance online for any business domain in this monorepo.  
It is ordered to minimize downtime, prevent mailbox-permission drift, and ensure observability/recovery is online quickly.

## Scope
- Applies to AWS/Nx/CDK-based MIAB stacks in this workspace.
- Covers automated and manual steps required for a clean go-live.
- SSL certificate setup is intentionally manual.
- If your stack uses a feature flag, set the correct one for that app before deploy steps.

## Required Inputs
- `DOMAIN` (example: `examplebusiness.com`)
- `AWS_PROFILE` (example: `hepe-admin-mfa`)
- `AWS_REGION` (default: `us-east-1`)
- Nx project names:
1. `CORE_PROJECT` (example: `cdk-emcnotary-core`)
2. `INSTANCE_PROJECT` (example: `cdk-emcnotary-instance`)
3. `OBS_PROJECT` (example: `cdk-emcnotary-observability-maintenance`)

## One-Time Guardrail (Already Integrated)
The instance setup flow now includes a mailbox root permission repair task:
- `admin:mailboxes:permissions:check`
- `admin:mailboxes:permissions:repair`

Integration points:
1. `cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance` runs repair immediately after bootstrap.
2. `cdk-emcnotary-instance:admin:bootstrap:confirm` depends on repair.
3. `cdk-emcnotary-instance:admin:verify-and-setup` depends on repair.
4. `ops-runner instance:bootstrap` runs repair after bootstrap.

## Online Bring-Up Sequence
Run commands with `zsh -lc` and keep the same env/profile across steps.

Export project variables once:
```bash
export CORE_PROJECT=cdk-emcnotary-core
export INSTANCE_PROJECT=cdk-emcnotary-instance
export OBS_PROJECT=cdk-emcnotary-observability-maintenance
export OBS_APP_PATH=apps/cdk-emc-notary/observability-maintenance
export STACKS_FEATURE_FLAG=FEATURE_CDK_EMCNOTARY_STACKS_ENABLED
```

1. Preflight: core and instance must exist
```bash
zsh -lc 'AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 pnpm nx run $CORE_PROJECT:admin:test:core-deployed'
zsh -lc 'AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 pnpm nx run $INSTANCE_PROJECT:admin:test:instance-deployed'
```

2. Deploy/refresh instance base stack
```bash
zsh -lc 'env "$STACKS_FEATURE_FLAG=1" DOMAIN=examplebusiness.com pnpm nx run $INSTANCE_PROJECT:deploy'
```

3. Bootstrap MIAB (permission guard auto-runs)
```bash
zsh -lc 'AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 DOMAIN=examplebusiness.com pnpm nx run $INSTANCE_PROJECT:admin:bootstrap-miab-ec2-instance'
```

4. Confirm bootstrap state
```bash
zsh -lc 'AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 DOMAIN=examplebusiness.com pnpm nx run $INSTANCE_PROJECT:admin:bootstrap:confirm'
```

5. Deploy observability + maintenance
```bash
zsh -lc 'env "$STACKS_FEATURE_FLAG=1" DOMAIN=examplebusiness.com pnpm nx run $OBS_PROJECT:deploy'
```

6. Validate observability wiring
```bash
zsh -lc 'AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 APP_PATH=$OBS_APP_PATH DOMAIN=examplebusiness.com pnpm nx run admin-stack-info:get'
zsh -lc 'DOMAIN=examplebusiness.com pnpm nx run $OBS_PROJECT:admin:disk:monitor'
zsh -lc 'DOMAIN=examplebusiness.com pnpm nx run $OBS_PROJECT:admin:availability:report'
```

7. Enforce mailbox permission health explicitly (post-cutover safety check)
```bash
zsh -lc 'AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 DOMAIN=examplebusiness.com pnpm nx run $INSTANCE_PROJECT:admin:mailboxes:permissions:check'
```

## Manual Steps (Required)
Do these after MIAB bootstrap and before final SSL enablement:

1. Set MIAB admin user and credentials in admin panel.
2. Set SES DNS records for mail sending/authentication.
3. Set/verify website `A` record points to intended web target.
4. Wait for DNS propagation and confirm mail + web reachability.
5. Configure SSL certificates manually in MIAB admin.

## Post-Go-Live Verification
1. Send/receive test email with IMAP client (Apple Mail/Webmail).
2. Move message into custom folder and verify no IMAP internal error.
3. Confirm CloudWatch alarm visibility for mailbox permission failures.
4. Confirm recovery automation can repair mailbox root ownership drift.

## Rollback / Recovery
If observability deployment fails during cutover:
1. Destroy observability stack.
2. Re-deploy last known-good instance commit.
3. Re-run bootstrap confirm and mailbox permission check.

## Notes for Other Business Domains
- Keep stack names and app paths domain-specific.
- Reuse shared observability constructs from `libs/infra/mailserver-recovery`.
- Do not bypass the mailbox permission check/repair task in bootstrap workflows.
