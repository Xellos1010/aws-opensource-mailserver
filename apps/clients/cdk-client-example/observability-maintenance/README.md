# Mail Server Observability-Maintenance Stack

This app owns post-initialization observability, recovery, and maintenance
automation for the sample mailserver mailserver instance.

## Scope

- Daily non-critical system cleanup automation (no scheduled reboot)
- Recovery lambda chain (health check, system reset, service restart, orchestrator, stop/start)
- CloudWatch and Route53 health alarms
- External health monitoring
- Runtime maintenance wrappers (disk monitor/cleanup, availability report)

Launch-time EC2 bootstrap and core infra provisioning remain in:

- `apps/clients/cdk-client-example/instance`
- `apps/clients/cdk-client-example/core`

## Dependencies

This stack requires both of these stacks to be online:

- `cdk-client-example-core` (core parameters and alarms topic)
- `cdk-client-example-instance` (instance metadata parameters)

Metadata contract consumed from SSM:

- `${instanceParamPrefix}/instanceId`
- `${instanceParamPrefix}/instanceDns`
- `${instanceParamPrefix}/stackName`

## Commands

```bash
pnpm nx run cdk-client-example-observability-maintenance:synth
pnpm nx run cdk-client-example-observability-maintenance:deploy
pnpm nx run cdk-client-example-observability-maintenance:diff
pnpm nx run cdk-client-example-observability-maintenance:destroy
```

Maintenance wrappers:

```bash
pnpm nx run cdk-client-example-observability-maintenance:admin:availability:report
pnpm nx run cdk-client-example-observability-maintenance:admin:disk:monitor
pnpm nx run cdk-client-example-observability-maintenance:admin:cleanup:disk-space
pnpm nx run cdk-client-example-observability-maintenance:admin:backup-and-cleanup
```

Runbooks (consolidated under `docs/runbooks/`):

- [Alarm runbooks index](../../../docs/runbooks/observability-maintenance/README.md)
