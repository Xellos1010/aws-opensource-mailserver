# Nx and CDK reference (reference mailserver apps)

Nx project names below match `apps/clients/cdk-client-example/*/project.json`. Other domains in the monorepo may use different app paths; always check `project.json` for the app you are deploying.

## Domain and context

- **`DOMAIN`** — apex domain (e.g. `example.com`).
- **`INSTANCE_DNS`** — hostname prefix for the box (often `box`).
- **`CORE_PARAM_PREFIX`** — optional override; normally derived via `@mm/infra-naming` from `DOMAIN`.
- **`FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1`** — required for CDK synth/deploy in these apps.

## Core stack (`cdk-client-example-core`)

```bash
pnpm nx run cdk-client-example-core:build
DOMAIN=example.com pnpm nx run cdk-client-example-core:synth
FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1 DOMAIN=example.com \
  pnpm nx run cdk-client-example-core:deploy
pnpm nx run cdk-client-example-core:diff
FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1 DOMAIN=example.com \
  pnpm nx run cdk-client-example-core:destroy
```

Destroy may run S3 empty helpers—read the target’s shell command before use.

## Instance stack (`cdk-client-example-instance`)

```bash
pnpm nx run cdk-client-example-instance:build
DOMAIN=example.com pnpm nx run cdk-client-example-instance:synth
FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1 DOMAIN=example.com \
  pnpm nx run cdk-client-example-instance:deploy
pnpm nx run cdk-client-example-instance:diff
FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1 DOMAIN=example.com \
  pnpm nx run cdk-client-example-instance:destroy
```

Admin targets (MIAB, status, DNS helpers) are defined on this project—inspect:

```bash
pnpm nx show project cdk-client-example-instance
```

## Observability stack (`cdk-client-example-observability-maintenance`)

```bash
pnpm nx run cdk-client-example-observability-maintenance:synth
FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1 DOMAIN=example.com \
  pnpm nx run cdk-client-example-observability-maintenance:deploy
```

Disk and availability helpers are typically under `admin:*` targets on this project.

## Ops-runner stack shortcuts

When wired for your workspace, patterns look like:

```bash
pnpm nx run ops-runner:run -- stack:core:deploy example.com
pnpm nx run ops-runner:run -- stack:instance:deploy example.com
pnpm nx run ops-runner:run -- stack:core:diff example.com
pnpm nx run ops-runner:run -- stack:instance:diff example.com
```

Discover exact subcommands:

```bash
pnpm nx run ops-runner:run -- help
```

## S3 empty and SSH convenience targets

Some `libs/admin/*` projects expose **domain shortcuts** (e.g. presets tied to a default domain). Prefer explicit `DOMAIN` + `APP_PATH` for public automation:

```bash
DOMAIN=example.com APP_PATH=apps/clients/cdk-client-example/core \
  pnpm nx run admin-s3-empty:empty
```

SSH setup targets follow the same pattern—use `pnpm nx show project admin-ssh` (or `admin-ssh-access` / `ssh-access` depending on workspace naming) for accurate target names.
