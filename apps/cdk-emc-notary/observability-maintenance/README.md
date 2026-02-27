# Mail Server Observability-Maintenance Stack

This app owns post-initialization observability, recovery, and maintenance
automation for the EMC Notary mailserver instance.

## Scope

- Nightly reboot automation
- Recovery lambda chain (health check, system reset, service restart, orchestrator, stop/start)
- CloudWatch and Route53 health alarms
- External health monitoring
- Runtime maintenance wrappers (disk monitor/cleanup, availability report)

Launch-time EC2 bootstrap and core infra provisioning remain in:

- `apps/cdk-emc-notary/instance`
- `apps/cdk-emc-notary/core`

## Dependencies

This stack requires both of these stacks to be online:

- `cdk-emcnotary-core` (core parameters and alarms topic)
- `cdk-emcnotary-instance` (instance metadata parameters)

Metadata contract consumed from SSM:

- `${instanceParamPrefix}/instanceId`
- `${instanceParamPrefix}/instanceDns`
- `${instanceParamPrefix}/stackName`

## Commands

```bash
pnpm nx run cdk-emcnotary-observability-maintenance:synth
pnpm nx run cdk-emcnotary-observability-maintenance:deploy
pnpm nx run cdk-emcnotary-observability-maintenance:diff
pnpm nx run cdk-emcnotary-observability-maintenance:destroy
```

Maintenance wrappers:

```bash
pnpm nx run cdk-emcnotary-observability-maintenance:admin:availability:report
pnpm nx run cdk-emcnotary-observability-maintenance:admin:disk:monitor
pnpm nx run cdk-emcnotary-observability-maintenance:admin:cleanup:disk-space
pnpm nx run cdk-emcnotary-observability-maintenance:admin:backup-and-cleanup
```
