# Team Lead Prompt — Stage 2: Milestone B (Core Packs + MCP + Governance)
# HomoPlasticus WordPress-Aligned Rebuild

## Environment

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

## Prerequisite

Stage 1 `WO-WP-S1-DONE` acceptance check must PASS before launching this team.  
Verify: `pnpm nx run-many -t build lint test --projects=wp-plugin-foundry-bridge,wp-mcp-server`

## Objective

Deliver:
- **Media Pack** — 7 abilities (list, get, upload, alt, caption, focal point, featured image)
- **SEO Pack** — 5 abilities with auto-detect adapter (Yoast / Rank Math / AIOSEO / raw)
- **MCP Adapter (PHP)** — `GET /wp-json/ai-foundry/v1/mcp-tools` auto-generates tool schemas from registry
- **MCP Node Restructure** — Node `tools/list` auto-populated from PHP; all business logic removed from Node
- **Proposal / Approval DB** — `wp_ai_foundry_proposals` table, 4-state FSM, admin approval screen
- **Audit Event System** — `wp_ai_foundry_audit_log` table, append-only, CSV/JSON export

## SDLC Context

Phase: `implement`  
Continuity: `.foundry/projects/homoplasticus/current-task.json`  
Full WO tree: `docs/plan/work-order-tree-wordpress-aligned-rebuild.md`  
Pipeline: `.foundry/staging/homoplasticus-wp-rebuild/pipeline.json`  
Stage work orders: `.foundry/staging/homoplasticus-wp-rebuild/stage-02-milestone-b/work-orders.md`

## Non-Negotiable Architectural Rules (Inherited from Stage 1)

1. Abilities API is canonical — no business logic in Node
2. All URLs are absolute — `AI_Foundry_URL_Builder::validate()` enforced
3. Every write goes through proposal system (WO-013 supersedes JSON file store from Stage 1)
4. Audit hook fires on ALL ability executions (success and failure)
5. Proposal FSM is strict: `proposed → applied | rejected`, `applied → reverted`. No other transitions.

## Team Structure

All three builder streams start simultaneously. verifier-b runs after all three complete.

---

### 1. builder-media-seo (subagent: builder, model: sonnet)

**Scope:**
- `apps/wp-plugin-foundry-bridge/includes/abilities/media/`
- `apps/wp-plugin-foundry-bridge/includes/abilities/seo/`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-seo-adapter.php`

**Depends on:** none — starts immediately (Stage 1 output is the prerequisite)

**Task sequence:** WO-007 → WO-008

**Instructions:**
- WO-007 (Media Pack): `media.upload` accepts base64-encoded file, stores via `wp_handle_sideload`, returns attachment ID + absolute URL. Update Node MCP `media.list` and `media.set_focal_point` to proxy to abilities.
- WO-008 (SEO Pack): SEO adapter auto-detects active plugin: Yoast → Rank Math → AIOSEO → raw post meta. No hard PHP dependency on any SEO plugin. `seo.indexability-report` checks robots.txt, sitemap, llms.txt, noindex flags. `seo.llms-txt-generate` builds `llms.txt` from published pages. Update Node `seo.indexability_report` to proxy to ability.
- Signal lead when both packs complete.

---

### 2. builder-mcp-adapter (subagent: builder, model: sonnet)

**Scope:**
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-mcp-adapter.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-mcp-policy.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-mcp-capability-registry.php`
- `apps/wp-mcp-server/src/server.ts`
- `apps/wp-mcp-server/src/abilities-client.ts`
- `apps/wp-mcp-server/src/rest-facade.ts`

**Depends on:** none — starts immediately

**Task sequence:** WO-010 → WO-011

**Instructions:**
- WO-010 (MCP Adapter PHP): Implement `GET /wp-json/ai-foundry/v1/mcp-tools`. This endpoint auto-generates MCP tool schemas from all registered abilities. Allowlist/blocklist configuration per install. Role-based exposure (editor sees content abilities; admin sees all). Zero manual tool definitions needed in Node after this.
- WO-011 (MCP Node Restructure): Every Node tool that maps to a registered ability becomes a one-liner proxy via `abilities-client.ts`. The `tools/list` handler fetches from `/wp-json/ai-foundry/v1/mcp-tools`. Add new tool `abilities.list` that calls discovery endpoint. Keep WP-CLI transport intact for: `audit.run`, `audit.list_reports`, `email.identities`, `mailpit.list_messages`, low-level bootstrap ops. Typecheck must pass zero errors after restructure.
- Signal lead when both WOs complete. Lead will also complete WO-012 (wizard) at this point using builder-foundation from Stage 1.

---

### 3. builder-governance (subagent: builder, model: opus)

**Scope:**
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-proposal-table.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-proposal.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-proposal-store.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-proposal-diff.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-approval-screen.php`
- `apps/wp-plugin-foundry-bridge/includes/abilities/proposals/`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-audit-log.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-audit-event.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-audit-exporter.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-audit-screen.php`
- `apps/wp-plugin-foundry-bridge/includes/abilities/audit/`

**Depends on:** none — starts immediately, BUT must get PLAN APPROVAL before implementing WO-013

**Task sequence:** WO-013 (plan approval required) → WO-014

**Instructions:**
- BEFORE IMPLEMENTING WO-013: Present the DB schema to lead for principal approval. Schema:
  ```sql
  CREATE TABLE wp_ai_foundry_proposals (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    proposal_id VARCHAR(80) UNIQUE NOT NULL,
    kind VARCHAR(40) NOT NULL,
    status ENUM('proposed','applied','rejected','reverted') NOT NULL DEFAULT 'proposed',
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT UNSIGNED,
    entity_slug VARCHAR(200),
    actor_id BIGINT UNSIGNED NOT NULL,
    before_json LONGTEXT,
    after_json LONGTEXT,
    diff LONGTEXT,
    preview_url VARCHAR(2083) NOT NULL,
    canonical_url VARCHAR(2083),
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_entity (entity_type, entity_id)
  );
  ```
  Do not run migration until principal approves.
- WO-013: Implement FSM strictly. States: `proposed → applied | rejected`, `applied → reverted`. Enforce: cannot approve a rejected proposal, cannot revert an unapplied proposal, cannot skip states. Migration: on plugin activation upgrade, import existing `runs/change-proposals/*.json` files into DB table. Admin screen at WP Admin > AI Foundry > Proposals.
- WO-014 (Audit): Implement append-only audit log table. Hook into all ability executions via `class-ai-foundry-audit-hook.php` from Stage 1. Every execution (success AND failure) writes an event. Admin screen at WP Admin > AI Foundry > Audit Log.
- Use opus model for WO-013 — FSM correctness is non-negotiable.
- Signal lead when both WOs complete.

---

### 4. verifier-b (subagent: verifier, model: sonnet)

**Depends on:** all three builder streams signal complete

**Instructions:**
- READ-ONLY verification. Run the full Stage 2 acceptance criteria:
  ```bash
  pnpm nx run wp-plugin-foundry-bridge:test
  pnpm nx run wp-mcp-server:typecheck
  curl http://localhost:8080/wp-json/ai-foundry/v1/mcp-tools | jq '.[].name'
  curl http://localhost:8080/wp-json/ai-foundry/v1/discovery | jq '.abilities.count'
  ```
- Verify: MCP tools/list auto-populated (count should match discovery abilities count). Proposal FSM transitions enforced (test proposed→rejected→approve fails). Audit log writes on ability execution.
- Produce evidence bundle. Report PASS or list of failures to lead.

---

## Coordination Rules

- All three builder streams start simultaneously (no deps between them within Stage 2)
- builder-governance must show DB schema to lead before implementing WO-013; lead shows principal for approval
- builder-mcp-adapter completion also triggers lead to resume Stage 1 builder-foundation for WO-012 (wizard)
- verifier-b only starts after all three builder streams report complete
- Lead updates continuity state after verifier-b reports PASS; signals Stage 3 ready

## Acceptance Gate

```bash
pnpm nx run-many -t build lint test --projects=wp-plugin-foundry-bridge,wp-mcp-server
curl http://localhost:8080/wp-json/ai-foundry/v1/mcp-tools | jq 'length'
# Must match discovery abilities.count
```

Also verify manually:
- Proposal FSM: attempt approve on rejected proposal → must fail with clear error
- Audit log: call any ability → audit record appears in WP Admin > AI Foundry > Audit Log
- SEO adapter: activate Yoast → `seo.read` returns Yoast meta; deactivate → falls back to raw meta

## Work Orders

`.foundry/staging/homoplasticus-wp-rebuild/stage-02-milestone-b/work-orders.md`
