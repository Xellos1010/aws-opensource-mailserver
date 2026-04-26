# Work Orders — Stage 2: Milestone B (Core Packs + MCP + Governance)

**Prerequisite:** Stage 1 `WO-WP-S1-DONE` PASS  
**Team Config:** `.foundry/staging/homoplasticus-wp-rebuild/stage-02-milestone-b/team-config.json`

---

## WO-WP-S2-007: Media Pack

- **Agent Role:** builder-media-seo
- **Subagent Type:** builder | **Model:** sonnet
- **Scope:** `apps/wp-plugin-foundry-bridge/includes/abilities/media/`
- **Depends On:** Stage 1 complete
- **Abilities:** `ai-foundry/media.list`, `.get`, `.upload`, `.update-alt`, `.update-caption`, `.set-focal-point`, `.set-featured-image`
- **Acceptance Criteria:**
  - [ ] `media.upload` accepts base64, stores via `wp_handle_sideload`, returns absolute URL
  - [ ] `media.update-alt` sanitizes alt text; audit logged
  - [ ] `media.set-focal-point` stores focus x/y as post meta
  - [ ] All returned URLs pass `AI_Foundry_URL_Builder::validate()`
  - [ ] Node `media.list` and `media.set_focal_point` proxy to abilities
- **Verification:** `pnpm nx run wp-plugin-foundry-bridge:test && pnpm nx run wp-mcp-server:typecheck`
- **Plan Approval Required:** no

---

## WO-WP-S2-008: SEO Pack

- **Agent Role:** builder-media-seo
- **Subagent Type:** builder | **Model:** sonnet
- **Scope:** `apps/wp-plugin-foundry-bridge/includes/abilities/seo/`, `class-ai-foundry-seo-adapter.php`
- **Depends On:** WO-WP-S2-007
- **Abilities:** `ai-foundry/seo.read`, `.update`, `.indexability-report`, `.sitemap-validate`, `.llms-txt-generate`
- **Adapter Priority:** Yoast → Rank Math → AIOSEO → raw post meta
- **Acceptance Criteria:**
  - [ ] `seo.read` returns data with Yoast active, Rank Math active, no SEO plugin
  - [ ] `seo.update` creates proposal record (proposal-required)
  - [ ] `seo.indexability-report` checks robots.txt, sitemap, llms.txt, noindex
  - [ ] `seo.llms-txt-generate` builds llms.txt from published content
  - [ ] Node `seo.indexability_report` proxies to ability
- **Verification:** `pnpm nx run wp-plugin-foundry-bridge:test`
- **Plan Approval Required:** no

---

## WO-WP-S2-010: MCP Adapter Module (PHP)

- **Agent Role:** builder-mcp-adapter
- **Subagent Type:** builder | **Model:** sonnet
- **Scope:** `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-mcp-adapter.php`, `class-ai-foundry-mcp-policy.php`, `class-ai-foundry-mcp-capability-registry.php`
- **Depends On:** Stage 1 complete
- **Endpoint:** `GET /wp-json/ai-foundry/v1/mcp-tools`
- **Acceptance Criteria:**
  - [ ] Endpoint returns MCP tool schemas auto-generated from registered abilities
  - [ ] Allowlist/blocklist configurable per install
  - [ ] Role-based exposure: editor sees content abilities; admin sees all
  - [ ] Adding new ability auto-adds it to MCP tool list — no Node code change needed
- **Verification:** `curl -u admin:pw http://localhost:8080/wp-json/ai-foundry/v1/mcp-tools | jq 'length'`
- **Plan Approval Required:** no

---

## WO-WP-S2-011: MCP Transport Restructure (Node)

- **Agent Role:** builder-mcp-adapter
- **Subagent Type:** builder | **Model:** sonnet
- **Scope:** `apps/wp-mcp-server/src/server.ts`, `abilities-client.ts`, `rest-facade.ts`, `url-builder.ts`
- **Depends On:** WO-WP-S2-010
- **Restructure Rule:** Every ability-backed tool handler → `abilitiesClient.call('ai-foundry/...', args)`
- **New Tool:** `abilities.list` — calls discovery endpoint, returns live ability list
- **Preserved Node-Only Tools:** `audit.run`, `audit.list_reports`, `email.identities`, `mailpit.list_messages`, WP-CLI bootstrap ops
- **Acceptance Criteria:**
  - [ ] `tools/list` auto-populated from `/wp-json/ai-foundry/v1/mcp-tools`
  - [ ] No inline WP-CLI PHP for business operations in any proxied tool
  - [ ] `abilities.list` tool works end-to-end
  - [ ] `pnpm nx run wp-mcp-server:typecheck` — zero errors
  - [ ] E2E: Claude Desktop → Node MCP → PHP Ability → WP DB for `page.list`
- **Verification:** `pnpm nx run wp-mcp-server:typecheck && pnpm nx run wp-mcp-server:test`
- **Plan Approval Required:** no

---

## WO-WP-S2-013: Proposal / Approval System (DB)

- **Agent Role:** builder-governance
- **Subagent Type:** builder | **Model:** opus
- **Scope:** `includes/class-ai-foundry-proposal-table.php`, `class-ai-foundry-proposal.php`, `class-ai-foundry-proposal-store.php`, `class-ai-foundry-proposal-diff.php`, `class-ai-foundry-approval-screen.php`, `abilities/proposals/`
- **Depends On:** Stage 1 complete
- **PLAN APPROVAL REQUIRED:** Yes — present DB schema to principal before implementing migration
- **FSM States:** `proposed → applied | rejected`, `applied → reverted`
- **Migration:** import existing `runs/change-proposals/*.json` to DB on upgrade activation
- **Acceptance Criteria:**
  - [ ] DB table created via versioned migrator (not raw SQL in activation hook)
  - [ ] FSM enforced: cannot approve rejected; cannot revert unapplied
  - [ ] Admin screen at WP Admin > AI Foundry > Proposals with diff preview
  - [ ] `proposals.approve` requires `manage_options` capability
  - [ ] JSON file proposals migrated on upgrade
  - [ ] All proposal responses include `preview_url` (absolute) and `canonical_url`
- **Verification:** `pnpm nx run wp-plugin-foundry-bridge:test` — FSM unit tests + migration tests
- **Plan Approval Required:** yes (DB schema)

---

## WO-WP-S2-014: Audit / Event System

- **Agent Role:** builder-governance
- **Subagent Type:** builder | **Model:** sonnet
- **Scope:** `includes/class-ai-foundry-audit-log.php`, `class-ai-foundry-audit-event.php`, `class-ai-foundry-audit-exporter.php`, `class-ai-foundry-audit-screen.php`, `abilities/audit/`
- **Depends On:** WO-WP-S2-013 (audit table needs proposal table to exist first)
- **Acceptance Criteria:**
  - [ ] Every ability execution (success AND failure) writes audit event
  - [ ] Audit log is append-only — no update/delete via abilities
  - [ ] `audit.list` filters by actor, ability, date range
  - [ ] `audit.export` exports JSON or CSV
  - [ ] Admin screen at WP Admin > AI Foundry > Audit Log
- **Verification:** `pnpm nx run wp-plugin-foundry-bridge:test`
- **Plan Approval Required:** no

---

## WO-WP-S2-DONE: Stage 2 Acceptance Check

- **Agent Role:** verifier-b
- **Subagent Type:** verifier | **Model:** sonnet
- **Depends On:** All stage-02 work orders complete
- **Acceptance Criteria:**
  - [ ] `pnpm nx run wp-plugin-foundry-bridge:test` — all pass
  - [ ] `pnpm nx run wp-mcp-server:typecheck` — zero errors
  - [ ] Discovery `abilities.count` >= 32
  - [ ] MCP `tools/list` count matches discovery abilities count
  - [ ] Proposal FSM: attempt approve-on-rejected fails with clear error
  - [ ] Audit log: ability call → record in admin audit screen
  - [ ] SEO adapter: Yoast active → Yoast meta returned; deactivated → raw meta fallback
- **Verification:**
  ```bash
  pnpm nx run-many -t build lint test --projects=wp-plugin-foundry-bridge,wp-mcp-server
  curl http://localhost:8080/wp-json/ai-foundry/v1/discovery | jq '.abilities.count'
  curl http://localhost:8080/wp-json/ai-foundry/v1/mcp-tools | jq 'length'
  ```
- **Post-completion:** Lead updates continuity to signal Stage 3 ready.
