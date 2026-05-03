# Public documentation

Operations and reference material intended for external contributors and open-source consumers. Tenant-specific audits, legacy deployment notes, and internal engineering plans have been removed from the tree; durable procedures live here and under [runbooks](../runbooks/README.md).

## Contents

| Document | Description |
|----------|-------------|
| [mail-server-operations.md](./mail-server-operations.md) | **Operations bible** — CDK layout, MIAB lifecycle, monitoring, recovery, restore/disk, DNS (SPF/DMARC/DKIM), bring-up order |
| [nx-cdk-reference.md](./nx-cdk-reference.md) | Domain-aware Nx targets for the reference mailserver CDK apps in this repo |
| [local-operations.md](./local-operations.md) | Ops-runner: MFA, DNS/mail backup, EC2, KMS, cron examples |

## Other `docs/` areas

- [ADR-001: Infrastructure naming](../adr/001-infra-naming-standard.md)
- [Alarm runbooks](../runbooks/observability-maintenance/README.md) — per-alarm playbooks
- [CMS API](../cms-api-reference.md) and [local CMS stack](../cms-outreach-platform.md)
