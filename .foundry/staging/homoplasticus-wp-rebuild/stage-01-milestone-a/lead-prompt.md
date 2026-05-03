# Team Lead Prompt — Stage 1: Milestone A (Plugin Foundation)
# HomoPlasticus WordPress-Aligned Rebuild

## Environment

Ensure the following is set before launching:
```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

## Objective

Deliver a marketplace-ready WordPress plugin (`ai-foundry`) with:
- Plugin shell (GPL-2.0+, WP 6.4+, PHP 8.1+, i18n-ready, clean lifecycle)
- Abilities Registry — singleton, hook-based, write_class enforcement, fail-closed
- Auth layer — Application Password + nonce, per-ability permission callbacks, audit hook
- Discovery endpoint — `GET /wp-json/ai-foundry/v1/discovery`
- Site Admin Pack — 11 abilities (health, plugins, settings, themes, events, analytics)
- Content Pack — 11 abilities (list, get, draft, propose, preview, publish, revert, schedule, diff)
- HomoPlasticus block patterns registered in theme editor (hero, about, services, contact, cta)
- Setup wizard — 3 steps, exports Claude Desktop / Claude.ai / ChatGPT configs

When this stage is complete, `/wp-json/ai-foundry/v1/discovery` is live and all 22+ abilities are registered. The block editor shows HomoPlasticus patterns. Content proposals return absolute URLs.

## SDLC Context

Cycle: `.foundry` (discover → define → visualize → architect → plan → implement → verify → release → operate → diagnose → improve)  
Current phase: `implement`  
Continuity state: `.foundry/projects/homoplasticus/current-task.json`  
Full work order tree: `docs/plan/work-order-tree-wordpress-aligned-rebuild.md`  
Pipeline manifest: `.foundry/staging/homoplasticus-wp-rebuild/pipeline.json`  
Stage work orders: `.foundry/staging/homoplasticus-wp-rebuild/stage-01-milestone-a/work-orders.md`

## Non-Negotiable Architectural Rules

1. **Abilities API is canonical** — every WP operation is an `ai-foundry/*` ability
2. **Fail closed on auth** — permission callbacks return `false` by default
3. **All URLs are absolute** — `AI_Foundry_URL_Builder::validate()` rejects relative URLs; tests fail on violation
4. **Block-editor content only** — raw HTML auto-wrapped in `wp:html` block with `block_warnings`
5. **Proposal shape required** — every content write returns `proposal_id`, `entity_id`, `preview_url`, `canonical_url`, `status`
6. **Marketplace compliance** — all strings i18n-ready, no dynamic code execution, clean uninstall, GPL-2.0+

## Team Structure

Spawn the following teammates in order:

---

### 1. builder-foundation (subagent: builder, model: sonnet)

**Scope:**
- `apps/wp-plugin-foundry-bridge/` — plugin shell files (WO-001)
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-discovery.php` (WO-003)
- `apps/wp-plugin-foundry-bridge/includes/abilities/site-admin/` (WO-005)
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-wizard.php` + `templates/` (WO-012)
- Source scaffold: `change-orders-to-implement/website_platform_execution_bundle/scaffold/apps/wp-plugin-foundry-bridge/`

**Depends on:** none — starts immediately

**Task sequence:** WO-001 → WO-003 (after registry ready) → WO-005 (after security gate PASS) → WO-012 (after WO-010 + WO-011 also complete — this is the last task)

**Instructions:**
- Start with WO-001. Promote the scaffold to `apps/wp-plugin-foundry-bridge/`. Create the Nx `project.json` with a `build` target that zips the plugin. Do NOT remove the existing `foundry/v1/health` and `foundry/v1/status` REST endpoints — they're consumed by the current Node MCP server.
- Signal lead when WO-001 is complete. Lead will signal builder-registry-auth to start WO-002.
- Hold WO-003 until lead signals registry is ready (WO-002 done).
- Hold WO-005 until lead signals security gate PASS.
- Hold WO-012 until lead signals WO-010 and WO-011 complete (Stage 2 dependencies).

---

### 2. builder-registry-auth (subagent: builder, model: opus)

**Scope:**
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-abilities-registry.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-ability.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-ability-category.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-schema-validator.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-auth.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-permissions.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-audit-hook.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-capability-map.php`

**Depends on:** builder-foundation signals WO-001 complete

**Task sequence:** WO-002 → WO-004

**Instructions:**
- Use opus model — this is security-critical code. Fail closed everywhere. No `__return_true` on any ability that is not explicitly read-only public.
- WO-002: implement the Abilities Registry. Hook: `do_action('ai_foundry_abilities_init', $registry)`. write_class enum must be enforced on registration — invalid values produce `WP_Error`. Include PHPUnit tests for all validation paths.
- Signal lead when WO-002 is complete. Lead will trigger security-reviewer gate concurrently with WO-004.
- WO-004: implement auth layer. Application Password + nonce. Permission callback factory keyed to write_class. Audit hook fires on all paths (success AND failure). Capability map: read-only→`read`, direct-write→`edit_posts`, proposal-required→`edit_posts`, admin-approval-required→`manage_options`.
- Signal lead when WO-004 is complete. Lead will wait for security-reviewer PASS before unblocking builder-content.

---

### 3. security-reviewer (subagent: security-reviewer, model: sonnet)

**Scope:** READ-ONLY
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-abilities-registry.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-ability.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-schema-validator.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-auth.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-permissions.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-capability-map.php`

**Depends on:** builder-registry-auth signals WO-002 AND WO-004 both complete

**Instructions:**
- READ-ONLY. Do not modify any files.
- Validate: (1) no ability reachable without appropriate capability check, (2) no privilege escalation path, (3) `write_class` enforcement cannot be bypassed, (4) audit hook fires on all paths, (5) no hardcoded secrets or unsafe defaults.
- Produce a written findings report. Report PASS or list required fixes with file references.
- Send findings to lead via direct message.
- Lead decision: if PASS → unblock builder-content and builder-foundation (for WO-005 and WO-006). If FAIL → assign required fixes to builder-registry-auth before proceeding.

---

### 4. builder-content (subagent: builder, model: sonnet)

**Scope:**
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-url-builder.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-block-sanitizer.php`
- `apps/wp-plugin-foundry-bridge/includes/abilities/content/`
- `apps/wp-theme-homoplasticus-base/theme.json`
- `apps/wp-theme-homoplasticus-base/patterns/`
- `apps/wp-theme-homoplasticus-base/functions.php`
- `apps/wp-mcp-server/src/url-builder.ts`
- `apps/wp-mcp-server/src/server.ts`

**Depends on:** lead signals security gate PASS

**Task sequence:** WO-006

**Instructions:**
- Do not start until lead signals security-reviewer PASS.
- This is the highest-value delivery in Milestone A. Take care with the URL builder — it is the single centralized utility used by ALL abilities. Implement `AI_Foundry_URL_Builder` with: `page_preview_url()`, `page_canonical_url()`, `proposal_preview_url()`, `validate()`. The validate method must reject relative URLs and localhost URLs when `WP_ENVIRONMENT_TYPE === 'production'`.
- Block sanitizer: use `has_blocks()` + `parse_blocks()` to validate incoming content. Raw HTML not in a block wrapper triggers auto-wrap in `wp:html` and adds `"raw-html-wrapped"` to `block_warnings`.
- Theme patterns: promote from scaffold (`hero.php`, `hero-book.php`). Add `about-section.php`, `services-section.php`, `contact-section.php`, `cta-section.php`. Register all patterns in `functions.php` under the `HomoPlasticus` category.
- Node MCP: update `server.ts` so `page.propose_update` calls `ai-foundry/content.propose-update` REST endpoint via a new `abilities-client.ts` module. Do not remove WP-CLI transport — it stays for other operations.
- Signal lead when WO-006 is complete.

---

## Coordination Rules

**Execution order:**
1. Lead spawns builder-foundation immediately (WO-001, no deps)
2. builder-foundation signals WO-001 done → lead spawns builder-registry-auth
3. builder-registry-auth signals WO-002 done → lead spawns security-reviewer AND builder-registry-auth continues to WO-004
4. builder-registry-auth signals WO-004 done → lead waits for security-reviewer findings
5. security-reviewer reports → lead decides: PASS = unblock builder-content (WO-006) + builder-foundation (WO-005). FAIL = fixes required first.
6. builder-foundation (WO-003) can start when WO-002 is done (parallel with security review)
7. When WO-005 + WO-006 are both done → lead runs WO-WP-S1-DONE acceptance check
8. WO-012 (wizard) deferred to after MCP adapter work (Stage 2 WO-010 + WO-011 must complete first)

**Shared findings protocol:**
- Each teammate sends a direct message to lead on task completion
- Lead maintains a shared task list with WO statuses
- Security findings are broadcast to all teammates after lead decision

**Continuity updates:**
- Lead updates `.foundry/projects/homoplasticus/current-task.json` after each wave completes
- Mark individual WO statuses in `nextWorkOrders` array

## Acceptance Gate

Before marking Stage 1 complete and signaling Stage 2 to begin:

```bash
pnpm nx run-many -t build lint test --projects=wp-plugin-foundry-bridge,wp-mcp-server
curl http://localhost:8080/wp-json/ai-foundry/v1/discovery | jq '.abilities.count'
# Must be >= 22
```

Also verify manually:
- WP block editor shows HomoPlasticus patterns in Insert > Patterns
- Content proposal returns `preview_url` starting with `https://` (not `localhost` in production)
- `readme.txt` format passes WordPress.org validator

## Work Orders

Full work order details: `.foundry/staging/homoplasticus-wp-rebuild/stage-01-milestone-a/work-orders.md`  
Full WO tree (all 3 stages): `docs/plan/work-order-tree-wordpress-aligned-rebuild.md`  
Pipeline manifest: `.foundry/staging/homoplasticus-wp-rebuild/pipeline.json`
