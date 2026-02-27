# Observability Resource Overlap Audit
Date: 2026-02-20
Account/Profile: hepe-admin-mfa
Region: us-east-1
Domain: emcnotary.com

## Scope
- Verify observability-maintenance generated resource names do not overlap with currently deployed names.
- Verify cutover CLI and deploy path is healthy after fixes.

## Findings
1. **No explicit name collisions in new observability stack resources.**
- CloudWatch alarm names are now prefixed with stack name:
  - `emcnotary-com-mailserver-observability-maintenance-InstanceStatusCheck-i-0518bce9a3056e4a6`
  - `emcnotary-com-mailserver-observability-maintenance-SystemStatusCheck-i-0518bce9a3056e4a6`
  - `emcnotary-com-mailserver-observability-maintenance-OOMKillDetected-i-0518bce9a3056e4a6`
  - `emcnotary-com-mailserver-observability-maintenance-MemHigh-i-0518bce9a3056e4a6`
  - `emcnotary-com-mailserver-observability-maintenance-SwapHigh-i-0518bce9a3056e4a6`
- Each prefixed alarm exists exactly once in CloudWatch.

2. **No physical resource ID overlap between stacks.**
- Compared `emcnotary-com-mailserver-ops` vs `emcnotary-com-mailserver-observability-maintenance` CloudFormation resources.
- Intersection of physical IDs: none.

3. **No orphan observability-maintenance Lambdas/Rules detected.**
- Lambda functions listed by prefix match exactly the 7 Lambda resources in CloudFormation.
- EventBridge rules listed by prefix match exactly the 4 rules in CloudFormation.

4. **Cutover deploy path is stable and idempotent.**
- `cdk-emcnotary-instance:deploy:instance` => no changes.
- `cdk-emcnotary-observability-maintenance:deploy` => no changes.

5. **Two patched CLI flows execute successfully.**
- `cdk-emcnotary-instance:admin:credentials:test` now completes (no `cliCheck` crash).
- `cdk-emcnotary-instance:admin:dns:sync-react` resolves `emc-notary-web` output key fallback and runs in dry-run.

## Important Residual Risk
- Both stacks are currently deployed:
  - `emcnotary-com-mailserver-ops` (CREATE_COMPLETE)
  - `emcnotary-com-mailserver-observability-maintenance` (CREATE_COMPLETE)
- This means duplicated monitoring/recovery *behavior* may still exist (old unprefixed alarms + new prefixed alarms), even though names do not collide.

## Recommendation
- After confirming observability-maintenance ownership is complete, remove legacy ops stack to eliminate duplicate automation paths:
  - `pnpm nx run cdk-emcnotary-instance:destroy` (targeted destroy strategy preferred; do **not** destroy instance stack)
  - Or a direct CFN stack delete of `emcnotary-com-mailserver-ops`.
- Keep SSL/manual setup steps out of automation as requested.

## Execution Update (Applied)
- Date: 2026-02-20
- Completed:
  - Removed legacy ops stack wiring from instance app (`apps/cdk-emc-notary/instance/src/main.ts`).
  - Redirected instance operational aliases to observability stack deploy/diff (`apps/cdk-emc-notary/instance/project.json`).
  - Deleted CloudFormation stack: `emcnotary-com-mailserver-ops`.
- Post-delete validation:
  - Active stacks: `emcnotary-com-mailserver-core`, `emcnotary-com-mailserver-instance`, `emcnotary-com-mailserver-observability-maintenance`.
  - Old unprefixed alarms removed.
  - Prefixed observability alarms remain healthy and unique.
  - `admin-stack-info:get` and `admin:availability:report` pass (status remains degraded only due disk usage).
