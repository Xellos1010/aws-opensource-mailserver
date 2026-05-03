# Code Extractor (AI Snapshot)

Extracts first-party source/config/docs from a set of workspace roots into a single de-duplicated, minified, and sensitive-data-redacted snapshot file for AI context.

Implementation lives under `support-scripts/code-extractor/`.

## Run

From the monorepo root:

```bash
pnpm exec nx run code-extractor:run -- --config=support-scripts/code-extractor/extractor.config.ts --output=exports/my-snapshot.txt
```

Or directly:

```bash
node --import tsx support-scripts/code-extractor/src/run.ts --config=support-scripts/code-extractor/extractor.config.ts --output=exports/my-snapshot.txt
```

### Night-Agent full-repo snapshot

```bash
pnpm exec nx run code-extractor:run:night-agent-full-repo
```

### Output location override

```bash
pnpm exec nx run code-extractor:run -- --config=support-scripts/code-extractor/extractor.config.ts --output=exports/my-snapshot.txt
```

### Config override

```bash
pnpm exec nx run code-extractor:run -- --config=support-scripts/code-extractor/extractor.night-agent.config.ts --output=exports/night-agent-slice.txt
```

### Roots override

Override configured roots at runtime (workspace-relative, comma-separated):

```bash
pnpm exec nx run code-extractor:run -- \
  --config=support-scripts/code-extractor/extractor.night-agent.config.ts \
  --roots=apps/agent-runner-rust \
  --output=exports/agent-runner-rust-ai-context.txt
```

## Target AI platform (post-split for uploads)

After the snapshot is written, the extractor can **split** the output into multiple UTF-8 text files at **newline boundaries** (so lines are never torn). This mirrors the intent of `support-scripts/export-cleaned-context.sh`, which calls `context_export.py` with `--platform chatgpt --account-level business`.

### CLI flags

| Flag | Purpose |
|------|---------|
| `--platform=none` | Default: emit a single snapshot file (no split). |
| `--platform=chatgpt` | Use ChatGPT-oriented default chunk sizes (see `--account-level`). |
| `--account-level=business` | With `--platform=chatgpt`, picks a conservative per-part size (default `business` if omitted). Supported: `business`, `team`, `enterprise`, `plus`, `free`, `consumer`. |
| `--split-max-mb=8` | **Overrides** tier defaults: maximum UTF-8 bytes per output part (MiB). If set, splitting happens even when `--platform=none`. |

**Precedence:** `--split-max-mb` or config `splitMaxChunkBytes` wins over tier defaults. Otherwise, `--platform=chatgpt` uses tier defaults. Otherwise no split.

### Example (ChatGPT Business–style)

```bash
node --import tsx support-scripts/code-extractor/src/run.ts \
  --config=support-scripts/code-extractor/extractor.night-agent.config.ts \
  --roots=apps/agent-runner-rust \
  --output=exports/agent-runner-rust-ai-context.txt \
  --platform=chatgpt \
  --account-level=business
```

Outputs `exports/agent-runner-rust-ai-context-part-001.txt`, `…-part-002.txt`, … and **removes** the unsplit `agent-runner-rust-ai-context.txt` after a successful split. Part `001` keeps the original snapshot header and body; later parts begin with a short continuation header.

### Config file defaults

Optional fields on `ExtractorConfig` (CLI overrides when passed):

- `targetAiPlatform?: 'none' | 'chatgpt'`
- `targetAiAccountLevel?: 'business' | 'team' | 'plus' | 'free' | 'enterprise'`
- `splitMaxChunkBytes?: number` — fixed cap in bytes (overrides tier defaults)

### Run metadata

Each run still writes `${outputPath}.run-start` with the resolved platform/split plan; after a split it appends the list of part paths.

## What it includes

The extractor walks `includedRoots` + `includedFiles`, applies `includeExtensions` / `includeFileNames`, and uses `excludeDirs` + `excludeFilePathRegexSources` to skip build/cache noise.

## How it redacts/minifies

For TS/JS, it strips `//` and `/* ... */` comments, then normalizes whitespace.
For JSON/YAML, it minifies when parseable and otherwise normalizes whitespace.

Sensitive literals are replaced with typed placeholders (non-exhaustive): `[EMAIL]`, `[URL]`, `[JWT]`, `[PEM_BLOCK]`, `[DATABASE_OR_BROKER_URL]`, GitHub/Slack/Stripe/Google/OpenAI/Anthropic-style tokens, `Authorization:` / `Bearer` / `Basic`, `.env`-style `KEY=value` lines for common provider env names, and key/value pairs for passwords, API keys, connection strings, etc. This is **heuristic redaction**, not a certified secret scanner — review exports before sharing.

## Snapshot format

The output is a single text file with stable parseable sections:

- `## SYSTEM_HIERARCHY` (includes a Mermaid diagram of group-level import edges)
- `## EXTERNAL_DEPENDENCIES_*`
- `## INTERNAL_ADJACENCY_PER_GROUP`
- `## CODE_SNAPSHOT` (de-duplicated blocks referenced by `contentHash`)

## Tests

```bash
pnpm exec nx run code-extractor:test
```

(`transform.test.ts` still uses Vitest APIs; install Vitest locally if you want to run that file directly. The Nx `code-extractor:test` target runs `node:test` for the split helper.)
