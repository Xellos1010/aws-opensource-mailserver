# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

An Nx monorepo that automates deployment and lifecycle management of [Mail-in-a-Box](https://mailinabox.email/) on AWS. It covers infrastructure-as-code (CDK/CloudFormation), a custom CMS for managing mail server fleets, and many operational CLI tools for backup/restore, DNS, cost reporting, and incident management. For **adding a new CDK deployment** (`apps/clients/<name>`), see [docs/public/creating-a-mail-deployment-client.md](docs/public/creating-a-mail-deployment-client.md).

## Common Commands

```bash
# Format
pnpm format          # write
pnpm format:check    # check only

# Local infrastructure (Postgres, MinIO, LocalStack, Mailhog)
pnpm cms:infra:up
pnpm cms:infra:down

# CMS development
pnpm cms:apps:serve  # runs cms-api, cms-worker, cms-web, cms-telephony-sim in parallel
pnpm cms:migrate     # apply DB migrations
pnpm cms:seed        # seed database

# Nx targets (build, test, lint, typecheck)
pnpm nx run <project>:<target>
pnpm nx run-many --target=build --all
pnpm nx affected --target=test   # only projects affected by current changes

# Run a single tool script
pnpm exec tsx --tsconfig tools/tsconfig.json tools/<name>.cli.ts
```

## Architecture

### Monorepo Layout

```
apps/          # Deployable: CDK stacks, CMS apps, ops-runner
libs/          # Shared libraries (admin, cms, infra, support-scripts)
tools/         # 100+ standalone *.cli.ts scripts, run via tsx
scripts/       # Bash helpers for dev setup and mail debugging
docs/          # ADRs, guides, runbooks (`docs/runbooks/`), handoff docs — see docs/README.md
.codex/        # SDLC continuity state (machine-readable)
.claude/       # SDLC charter + pointer to docs/runbooks (read before starting work)
.cursor/rules/ # Architectural guardrails (authoritative rules)
```

### Application Layer (`apps/`)

| App | Purpose |
|-----|---------|
| `cdk-*` | AWS CDK stacks (reference mailserver example under `apps/clients/cdk-client-example/`; other domain apps may be gitignored in public snapshots) |
| `cms-api` | REST API for CMS (esbuild + Node.js) |
| `cms-web` | React 19 + Vite 7 frontend |
| `cms-worker` | Background job processor |
| `cms-telephony-sim` | Twilio SMS simulator for local testing |
| `cms-platform` | Docker Compose orchestration |
| `ops-runner` | Operational command runner |

### Library Layer (`libs/`)

- **`admin/`** — AWS SDK wrappers: EC2, IAM, SSM, KMS, SES, S3, Route53, MIAB API client, DNS backup/restore, SSL provisioning, SSH key management. Import via `@mm/admin-*` path aliases.
- **`infra/`** — CDK constructs and config: `@mm/infra-shared-constructs`, `@mm/infra-core-params`, `@mm/infra-naming`, `@mm/infra-mailserver-recovery`.
- **`cms/`** — CMS domain: `@mm/cms-contracts` (types), `@mm/cms-core` (auth/hashing), `@mm/cms-persistence` (PG migrations + queries).
- **`support-scripts/aws/`** — Low-level AWS auth helpers.

### Tools Layer (`tools/`)

Each `*.cli.ts` is an independently executable script. Run any with:
```bash
pnpm exec tsx --tsconfig tools/tsconfig.json tools/<script-name>.cli.ts
```
Categories: cost reporting, mail server ops, CMS migration/seeding, DNS audit, SSL, incident response, S3 backup/restore.

### Key Dependency Rules

Libraries use Nx tags (`scope:*`, `type:*`) enforced by ESLint module boundaries. Import only from a library's `index.ts` — never deep paths. Layer constraint: `feature → data-access → util/config`.

## Tech Stack

| Layer | Stack |
|-------|-------|
| Infrastructure | AWS CDK 2.150, TypeScript, CloudFormation |
| Backend | Node.js (ES2022), TypeScript strict |
| Frontend | React 19, Vite 7, TailwindCSS |
| Database | PostgreSQL via `pg` |
| Testing | Jest (unit), Vitest (frontend), Playwright (e2e) |
| Monorepo | Nx 22, pnpm 9 |
| AWS SDKs | `@aws-sdk/*` v3 |

TypeScript target is ES2022 with `moduleResolution: bundler`. All path aliases are declared in `tsconfig.base.json`.

## SDLC Conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
- Always run `nx affected` rather than full builds during development
- The `.claude/CLAUDE.md` charter and `.codex/projects/*/current-task.json` track phase state — read them before resuming in-progress work
- Architecture decisions live in `docs/adr/`; runbooks and guides are indexed in `docs/README.md`. Consult `.cursor/rules/` for authoritative layer and error-handling standards
