# Work Orders — Stage 1: Milestone A (Plugin Foundation)

**Initiative:** HomoPlasticus WordPress-Aligned Rebuild  
**Stage:** 01 — Plugin Foundation  
**Team Config:** `.foundry/staging/homoplasticus-wp-rebuild/stage-01-milestone-a/team-config.json`  
**Full WO Tree:** `docs/plan/work-order-tree-wordpress-aligned-rebuild.md`

---

## WO-WP-S1-001: Plugin Shell & Marketplace Packaging

- **Initiative:** HomoPlasticus WP Rebuild Stage 1
- **Lifecycle Stage:** implement
- **Agent Role:** builder-foundation
- **Subagent Type:** builder
- **Model:** sonnet
- **Scope:**
  - `apps/wp-plugin-foundry-bridge/ai-foundry.php`
  - `apps/wp-plugin-foundry-bridge/uninstall.php`
  - `apps/wp-plugin-foundry-bridge/readme.txt`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-loader.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-activator.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-deactivator.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-migrator.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-admin.php`
  - `apps/wp-plugin-foundry-bridge/languages/ai-foundry.pot`
  - `apps/wp-plugin-foundry-bridge/project.json`
- **Depends On:** none — starts immediately
- **Objective:** Promote the scaffold plugin to a real Nx app. Deliver a clean, marketplace-compliant plugin shell: marketplace header, GPL-2.0+, i18n-ready, activation/deactivation/uninstall lifecycle, version migrator, admin status screen.
- **Source:** `change-orders-to-implement/website_platform_execution_bundle/scaffold/apps/wp-plugin-foundry-bridge/`
- **Acceptance Criteria:**
  - [ ] Plugin installs and activates on clean WordPress 6.4+ with PHP 8.1+
  - [ ] Activation checks minimum WP + PHP version; deactivates gracefully if unmet
  - [ ] Uninstall removes all plugin options, transients, and custom tables — no orphan data
  - [ ] Admin screen (WP Admin > AI Foundry) shows version, WP version, PHP version, module status
  - [ ] All user-facing strings wrapped in `__('...', 'ai-foundry')` or `esc_html__()`
  - [ ] `readme.txt` matches WordPress.org readme format (Tested up to, Stable tag, etc.)
  - [ ] `pnpm nx run wp-plugin-foundry-bridge:build` produces installable `.zip`
  - [ ] Must NOT remove existing `foundry/v1/health` and `foundry/v1/status` endpoints (consumed by current Node MCP server)
- **Verification:**
  - `pnpm nx run wp-plugin-foundry-bridge:build`
  - `pnpm nx run wp-plugin-foundry-bridge:lint`
- **Plan Approval Required:** no

---

## WO-WP-S1-002: Abilities Registry Core

- **Initiative:** HomoPlasticus WP Rebuild Stage 1
- **Lifecycle Stage:** implement
- **Agent Role:** builder-registry-auth
- **Subagent Type:** builder
- **Model:** opus (security-sensitive)
- **Scope:**
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-abilities-registry.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-ability.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-ability-category.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-schema-validator.php`
- **Depends On:** WO-WP-S1-001 (builder-foundation must signal WO-001 complete)
- **Objective:** Implement the Abilities Registry singleton with hook-based registration, write_class enforcement, JSON Schema validation, and forward-compatibility with any WordPress core Abilities API hook.
- **Key Design Rules:**
  - Registry singleton initialized on `plugins_loaded` priority 5
  - Abilities registered via `do_action('ai_foundry_abilities_init', $registry)`
  - write_class enum: `read-only`, `direct-write`, `proposal-required`, `admin-approval-required`
  - Invalid definitions produce `WP_Error` — never silently swallowed
  - Duplicate ID logs warning and skips (no overwrite)
- **Acceptance Criteria:**
  - [ ] `AI_Foundry_Abilities_Registry::instance()` accessible after `plugins_loaded`
  - [ ] Registering ability with invalid schema produces actionable `WP_Error`
  - [ ] Registering duplicate ID logs warning, does not overwrite
  - [ ] `write_class` enum enforced — invalid value rejected on register
  - [ ] `$registry->get_all()` returns all registered abilities with full schema
  - [ ] Unit tests cover: singleton, validation, duplicate handling, error paths
- **Verification:**
  - `pnpm nx run wp-plugin-foundry-bridge:test`
  - `pnpm nx run wp-plugin-foundry-bridge:lint`
- **Plan Approval Required:** no
- **Post-completion:** Broadcast to lead. Lead schedules security-reviewer gate concurrently with WO-WP-S1-004.

---

## WO-WP-S1-003: Discovery & Metadata Endpoint

- **Initiative:** HomoPlasticus WP Rebuild Stage 1
- **Lifecycle Stage:** implement
- **Agent Role:** builder-foundation
- **Subagent Type:** builder
- **Model:** sonnet
- **Scope:**
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-discovery.php`
- **Depends On:** WO-WP-S1-002 (registry must exist to enumerate abilities)
- **Objective:** Implement `GET /wp-json/ai-foundry/v1/discovery` — single endpoint clients use to determine plugin state, auth modes, registered abilities, MCP availability, and compatibility fingerprint.
- **Acceptance Criteria:**
  - [ ] Returns 200 with valid JSON on clean WP install
  - [ ] `abilities.summary` reflects live registered abilities (not hardcoded)
  - [ ] `home_url` is absolute and correct for the active site
  - [ ] Endpoint is public — returns only metadata, no sensitive data
  - [ ] `compatibility_fingerprint` changes when plugin version or ability set changes
- **Verification:**
  - `curl http://localhost:8080/wp-json/ai-foundry/v1/discovery | jq .`
  - `pnpm nx run wp-plugin-foundry-bridge:test`
- **Plan Approval Required:** no

---

## WO-WP-S1-004: Auth & Authorization Layer

- **Initiative:** HomoPlasticus WP Rebuild Stage 1
- **Lifecycle Stage:** implement
- **Agent Role:** builder-registry-auth
- **Subagent Type:** builder
- **Model:** opus (auth is security-critical)
- **Scope:**
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-auth.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-permissions.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-audit-hook.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-capability-map.php`
- **Depends On:** WO-WP-S1-002
- **Objective:** Implement per-ability permission callbacks, role-to-write-class mapping, Application Password + nonce auth support, and lightweight execution audit hook. Fail closed on all auth checks.
- **Permission Model:**
  - `read-only` → authenticated user with `read` cap
  - `direct-write` → `edit_posts` cap
  - `proposal-required` → `edit_posts` cap (writes enter proposal queue)
  - `admin-approval-required` → `manage_options` cap
- **Acceptance Criteria:**
  - [ ] Unauthenticated request to any non-public ability returns 401
  - [ ] Editor role cannot call `admin-approval-required` abilities directly
  - [ ] Administrator role can call all abilities
  - [ ] Every execution logs: actor ID, ability ID, write class, timestamp, result
  - [ ] Application Password auth works end-to-end
  - [ ] Nonce auth works for same-origin admin UI calls
- **Verification:**
  - `pnpm nx run wp-plugin-foundry-bridge:test`
  - Integration: `curl` with/without auth, verify 401/200
- **Plan Approval Required:** no
- **Post-completion:** Broadcast to lead. Lead triggers `security-reviewer` gate. Do NOT allow builder-content to start WO-006 until gate PASS.

---

## WO-WP-S1-GATE: Security Review Gate

- **Initiative:** HomoPlasticus WP Rebuild Stage 1
- **Lifecycle Stage:** verify
- **Agent Role:** security-reviewer
- **Subagent Type:** security-reviewer
- **Model:** sonnet
- **Scope:**
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-abilities-registry.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-ability.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-schema-validator.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-auth.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-permissions.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-capability-map.php`
- **Depends On:** WO-WP-S1-002 and WO-WP-S1-004 both complete
- **Objective:** Independently validate the permission model and auth layer. Confirm: fail-closed defaults, no privilege escalation paths, correct capability mapping, audit hook fires on all paths.
- **Acceptance Criteria:**
  - [ ] No ability reachable without appropriate capability check
  - [ ] No path to bypass `write_class` enforcement
  - [ ] Audit hook fires on success AND failure paths
  - [ ] No hardcoded credentials, secrets, or unsafe defaults
  - [ ] Produces written findings report (PASS or list of required fixes)
- **Verification:** READ-ONLY — produces findings report, does not modify code
- **Plan Approval Required:** no
- **Post-completion:** Lead receives findings. If PASS, unblock builder-content (WO-006) and builder-foundation (WO-005). If FAIL, assign fixes back to builder-registry-auth before proceeding.

---

## WO-WP-S1-005: Site Admin Pack

- **Initiative:** HomoPlasticus WP Rebuild Stage 1
- **Lifecycle Stage:** implement
- **Agent Role:** builder-foundation
- **Subagent Type:** builder
- **Model:** sonnet
- **Scope:**
  - `apps/wp-plugin-foundry-bridge/includes/abilities/site-admin/`
- **Depends On:** WO-WP-S1-GATE (security gate PASS)
- **Objective:** Register 11 Site Admin Pack abilities. Update Node MCP `system.health_report`, `plugin.*` tools to proxy to abilities via REST.
- **Abilities:**
  - `ai-foundry/system.health-report`, `ai-foundry/system.site-status`
  - `ai-foundry/plugin.list`, `.install`, `.activate`, `.deactivate`
  - `ai-foundry/theme.status`
  - `ai-foundry/settings.get`, `ai-foundry/settings.update-safe`
  - `ai-foundry/events.list`, `ai-foundry/analytics.report`
- **Acceptance Criteria:**
  - [ ] All 11 abilities appear in `/wp-json/ai-foundry/v1/discovery`
  - [ ] `plugin.install` enforces admin-approval-required write class
  - [ ] `settings.update-safe` blocks update of `siteurl` and `admin_email`
  - [ ] Node MCP `system.health_report` calls ability REST endpoint (not WP-CLI inline)
- **Verification:**
  - `pnpm nx run wp-plugin-foundry-bridge:test`
  - `pnpm nx run wp-mcp-server:typecheck`
- **Plan Approval Required:** no

---

## WO-WP-S1-006: Content Pack (Block-Editor Aligned)

- **Initiative:** HomoPlasticus WP Rebuild Stage 1
- **Lifecycle Stage:** implement
- **Agent Role:** builder-content
- **Subagent Type:** builder
- **Model:** sonnet
- **Scope:**
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-url-builder.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-block-sanitizer.php`
  - `apps/wp-plugin-foundry-bridge/includes/abilities/content/`
  - `apps/wp-theme-homoplasticus-base/theme.json`
  - `apps/wp-theme-homoplasticus-base/patterns/`
  - `apps/wp-theme-homoplasticus-base/functions.php`
  - `apps/wp-mcp-server/src/url-builder.ts`
  - `apps/wp-mcp-server/src/server.ts`
- **Depends On:** WO-WP-S1-GATE (security gate PASS)
- **Objective:** Deliver the block-editor-aligned Content Pack — 11 abilities, centralized URL builder, block sanitizer, HomoPlasticus theme patterns. Update Node MCP page tools to proxy to PHP abilities.
- **Non-Negotiable Rules:**
  - All URLs in responses MUST pass `AI_Foundry_URL_Builder::validate()` — test fails on relative URL
  - Raw HTML input auto-wrapped in `wp:html` block with `block_warnings: ["raw-html-wrapped"]`
  - Proposal response MUST include `proposal_id`, `entity_id`, `preview_url`, `canonical_url`, `status`
- **Block Patterns to Register (promote from scaffold):**
  - `hero.php`, `hero-book.php` (already scaffolded), `about-section.php`, `services-section.php`, `contact-section.php`, `cta-section.php`
- **Acceptance Criteria:**
  - [ ] All 11 content abilities in discovery endpoint
  - [ ] `content.create-draft` creates WP draft with block-serialized content
  - [ ] `content.preview` returns absolute preview URL
  - [ ] `content.publish` requires admin-approval-required, returns canonical URL
  - [ ] `content.revert` restores prior WP revision
  - [ ] All proposal responses contain absolute URLs — no relative URLs
  - [ ] Block patterns visible in WP editor Insert > Patterns panel
  - [ ] Node `page.propose_update` proxies to `ai-foundry/content.propose-update` REST endpoint
  - [ ] `pnpm nx run wp-mcp-server:typecheck` passes
- **Verification:**
  - `pnpm nx run wp-plugin-foundry-bridge:test`
  - `pnpm nx run wp-mcp-server:typecheck`
  - Integration: create draft → preview → publish → revert; check URLs are absolute
  - Visual: open WP block editor, confirm HomoPlasticus patterns in Insert panel
- **Plan Approval Required:** no

---

## WO-WP-S1-012: Setup / Export Wizard

- **Initiative:** HomoPlasticus WP Rebuild Stage 1
- **Lifecycle Stage:** implement
- **Agent Role:** builder-foundation
- **Subagent Type:** builder
- **Model:** haiku
- **Scope:**
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-wizard.php`
  - `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-export.php`
  - `apps/wp-plugin-foundry-bridge/includes/templates/`
- **Depends On:** WO-WP-S1-003, WO-WP-S1-005, and Stage 2 WO-010 + WO-011
- **Objective:** Deliver a 3-step WP Admin wizard that creates an Application Password, tests the connection to the discovery endpoint, and exports ready-to-use config files for Claude Desktop, Claude.ai Projects, and ChatGPT Custom GPT.
- **Acceptance Criteria:**
  - [ ] Wizard accessible from WP Admin > AI Foundry > Setup
  - [ ] Step 1 creates Application Password with correct capabilities
  - [ ] Step 2 tests discovery endpoint, reports pass/fail
  - [ ] Step 3 exports: Claude Desktop JSON, Claude.ai system prompt, ChatGPT instructions
  - [ ] All exported configs contain absolute URLs (no localhost in production)
- **Verification:**
  - `pnpm nx run wp-plugin-foundry-bridge:lint`
  - Manual: run wizard on local stack, download all 3 config outputs
- **Plan Approval Required:** no

---

## WO-WP-S1-DONE: Stage 1 Acceptance Check

- **Initiative:** HomoPlasticus WP Rebuild Stage 1
- **Lifecycle Stage:** verify
- **Agent Role:** lead
- **Subagent Type:** verifier
- **Model:** sonnet
- **Scope:** All of the above
- **Depends On:** All stage-01 work orders complete
- **Objective:** Run the full stage-01 acceptance criteria suite and produce an evidence bundle before signaling stage-02 can begin.
- **Acceptance Criteria:**
  - [ ] `pnpm nx run wp-plugin-foundry-bridge:build` — zero errors, zip produced
  - [ ] `pnpm nx run wp-plugin-foundry-bridge:lint` — zero WPCS violations
  - [ ] `pnpm nx run wp-plugin-foundry-bridge:test` — all unit tests pass
  - [ ] `pnpm nx run wp-mcp-server:typecheck` — zero TypeScript errors
  - [ ] Discovery endpoint returns `abilities.count >= 22`
  - [ ] Block patterns visible in WP editor
  - [ ] Content proposal returns absolute URLs in all environments
  - [ ] Security reviewer findings: PASS
  - [ ] `readme.txt` format validated
- **Verification:**
  - `pnpm nx run-many -t build lint test --projects=wp-plugin-foundry-bridge,wp-mcp-server`
  - `curl http://localhost:8080/wp-json/ai-foundry/v1/discovery | jq '.abilities.count'`
- **Plan Approval Required:** no
- **Post-completion:** Update `.foundry/projects/homoplasticus/current-task.json` — set Stage 1 status to `complete`, signal stage-02 ready.
