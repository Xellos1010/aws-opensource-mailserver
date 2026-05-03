# Creating a new mail deployment (CDK “client”)

This guide explains **what this repository is for** and how to add a **new deployment environment** under `apps/clients/` (often called a “client” folder in this monorepo: one domain’s CDK apps, Nx targets, and operational scripts).

## What this system is for

| Layer | Purpose |
|-------|--------|
| **Mail-in-a-Box on AWS** | Automate a single-instance open-source mail stack (Postfix/Dovecot, webmail, DNS, optional Nextcloud) with backups to S3 and optional SES relay. |
| **CDK apps under `apps/clients/`** | Infrastructure-as-code for **one logical mail deployment** (domain, buckets, EC2, alarms, post-bootstrap maintenance). The public tree ships **`cdk-client-example`** as a copy-paste template. |
| **Shared libraries (`libs/`)** | Reusable AWS admin helpers, infra naming, CDK constructs, CMS contracts, etc. |
| **`tools/`** | Dozens of operational CLIs (backup/restore, DNS, cost, incidents). |
| **CMS apps (`apps/cms-*`)** | Optional fleet / outreach tooling for teams who run many servers—not required for a single MIAB deployment. |

**Two common entry paths:**

1. **CloudFormation only** — Follow the [root README](../../README.md) and the companion [AWS Open Source Blog](https://aws.amazon.com/blogs/opensource/fully-automated-deployment-of-an-open-source-mail-server-on-aws/) for a minimal, console-driven install (no monorepo build required for that path).
2. **CDK + Nx (this repo)** — Use `apps/clients/cdk-client-example` as the reference; copy it when you need your own naming, domains, and CI/CD.

---

## When to create a new `apps/clients/<name>` tree

Create a new sibling of `cdk-client-example` when you need:

- A **production** mail domain separate from the `example.com` reference, or
- Multiple **independent** MIAB deployments each with their own Nx project names and SSM parameter prefixes.

Private or org-specific trees should live under `apps/clients/<your-name>/` and are **gitignored by default** except for paths you explicitly un-ignore (see [root `.gitignore`](../../.gitignore)).

---

## Walkthrough: copy `cdk-client-example` to `<your-client>`

Replace `<your-client>` with a short slug (e.g. `acme-corp-mail`). Use lowercase and hyphens for folder names.

### 1. Copy the directory

```bash
cp -R apps/clients/cdk-client-example "apps/clients/<your-client>"
```

### 2. Allow Git to track it (if this copy is meant for the public repo)

In the root `.gitignore`, private clients are ignored with `apps/clients/**` and an exception only for `cdk-client-example`. For a **new** tracked template or open-source client, add:

```gitignore
!apps/clients/<your-client>/
!apps/clients/<your-client>/**
```

Keep proprietary deployments **out** of the public remote; use a private fork or mirror if needed.

### 3. Rename Nx projects

Each of `core/`, `instance/`, and `observability-maintenance/` has a `project.json` with a `"name"` field, for example `cdk-client-example-core`. Rename consistently:

| Old name | New pattern |
|----------|-------------|
| `cdk-client-example-core` | `<your-client>-core` |
| `cdk-client-example-instance` | `<your-client>-instance` |
| `cdk-client-example-observability-maintenance` | `<your-client>-observability-maintenance` |

Use **find-and-replace** across the new tree for the string `cdk-client-example` in:

- Every `project.json` (`name`, `outputs`, `command` paths, `APP_PATH=...`, cross-references to other Nx projects)
- `jest.config.ts`, `tsconfig*.json`, `cdk.json`, and `README*.md` files
- Any `pnpm nx run cdk-client-example-...` examples you keep in docs

Run:

```bash
rg "cdk-client-example" "apps/clients/<your-client>"
```

until no stale references remain (except intentional mentions in comments you update).

### 4. Set domain and SSM prefixes

The reference uses **`example.com`** and SSM prefixes such as `/example/core` and `/example/instance`. For your domain:

- Export `DOMAIN=yourdomain.com` (or pass `--context domain=...` as in [nx-cdk-reference.md](./nx-cdk-reference.md)).
- Ensure `coreParamPrefix` / `instanceParamPrefix` follow [ADR-001: Infrastructure naming](../adr/001-infra-naming-standard.md) (helpers live in `@mm/infra-naming`).

### 5. CDK deploy safety flag

Synth/deploy/destroy commands for the reference apps require:

`FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1`

This is an **intentional guard** so accidental deploys from a clone do not touch AWS. When you fork the template for your own org, consider renaming the variable in every `project.json`, test, and doc that references it (search the repository for the string above and update consistently).

### 6. Verify from the repo root

```bash
pnpm install
pnpm nx run "<your-client>-core":build
FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1 DOMAIN=yourdomain.com pnpm nx run "<your-client>-core":synth
```

Then follow [mail-server-operations.md](./mail-server-operations.md) for deploy order (core → instance → observability-maintenance) and runbooks.

### 7. Documentation and runbooks

- Copy or adapt sections under `docs/runbooks/observability-maintenance/` if alarm names or Nx targets change.
- Prefer `example.com` / `example.org` in **published** docs, never real customer domains.

---

## Related reading

- [Mail server operations bible](./mail-server-operations.md)
- [Nx / CDK reference](./nx-cdk-reference.md)
- [Commit history and public release policy](../COMMIT-HISTORY.md)
- [Repository documentation index](../README.md)
