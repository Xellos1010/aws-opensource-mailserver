# Commit history and public release

## Public snapshot policy

This repository is maintained as an **open-source–oriented snapshot** of a larger internal workspace. For publication:

- **Git history** may be **condensed to a single root commit** (or a short linear history) so the default branch does not carry years of private iteration, tenant identifiers, or superseded experiments.
- **Older history** exists only in forks or private mirrors retained by maintainers. If you need provenance for compliance, request an export from the project owners rather than inferring it from this public tree.

### Maintainer note (squash already applied)

If you still have a local branch named `main_pre_squash_backup`, it points at the **pre–single-commit** tip of `main` and can be used to cherry-pick or inspect old SHAs. Delete it when no longer needed. Publishing to GitHub/GitLab after a history rewrite requires **`git push --force-with-lease`** (or delete and recreate the default branch) so the remote matches this tree.

### 2026-05-02 — consolidated release commit on `main`

All prior commits on `main` were squashed into **one root commit** for a clean public default branch.

| Item | Value |
|------|--------|
| **Current `main` tip** | Single root commit; subject `release: public open-source Mail-in-a-Box AWS automation snapshot` (resolve object id with `git rev-parse HEAD` on this branch) |
| **Local backup (pre-squash tip)** | Branch `backup-main-pre-release-squash-2026-05-02` → `e2e70af6` |

**Former SHAs absorbed into that single commit (newest first):**

- `e2e70af6` — chore(nx.json): update installation version and add plugin dependencies; remove obsolete status report files
- `bd044cb0` — fix(tsconfig): moduleResolution for commonjs CDK roots; drop tools rootDir
- `22e0bc69` — chore(clients): gitignore private client stacks; publish cdk-client-example paths
- `9c9692c9` — chore: scrub tenant strings and align sample CDK paths
- `9b168361` — chore: initial public open-source snapshot

## What was removed from version control (policy)

The following are intentionally **not** published here:

- Tenant-specific CDK apps under `apps/` (see root `.gitignore` — e.g. proprietary `cdk-*` trees kept private).
- `Archive/`, mailbox backups, credentials, local env files (`.env`, `.env.*` except documented examples), `.aws-config.local.json`, OS cruft (`.DS_Store`), and Cursor plan dumps under `.cursor/plans/`.
- Generated build/cache trees (`dist/`, `node_modules/`, `.nx/cache`, `cdk.out/`, etc.) per `.gitignore`.

## How to work with a shallow public clone

```bash
git clone <public-url>
git log --oneline   # expect a short history on default branch
```

Use [docs/README.md](./README.md) and [docs/public/README.md](./public/README.md) for operational documentation aligned with this tree.

## Changelog

For **user-visible product changes** after the public snapshot, prefer a root **`CHANGELOG.md`** (or GitHub Releases) maintained alongside small follow-up commits. This file describes **repository policy**, not every feature change.
