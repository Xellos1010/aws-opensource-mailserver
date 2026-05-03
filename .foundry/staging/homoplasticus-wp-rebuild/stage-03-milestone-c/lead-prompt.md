# Team Lead Prompt — Stage 3: Milestone C (Ecosystem + Release)
# HomoPlasticus WordPress-Aligned Rebuild

## Environment

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

## Prerequisite

Stage 2 `WO-WP-S2-DONE` acceptance check must PASS before launching this team.

## Objective

Deliver:
- **WooCommerce Pack** — 8 abilities, graceful degradation when WC absent
- **Worker Integration Pack** — screenshot, Lighthouse, visual regression (optional addon)
- **Extension SDK** — interface, loader, validator, test harness, example pack
- **5 Compat Packs** — Yoast, ACF, Gravity Forms, WPML, UpdraftPlus (each independent plugin)
- **Cloud Control Plane ADR** + implementation (multi-site enrollment, policy push, audit ingestion)
- **Community Release** — marketplace submission, docs, plugin check PASS

## SDLC Context

Phase: `implement → release`  
Continuity: `.foundry/projects/homoplasticus/current-task.json`  
Full WO tree: `docs/plan/work-order-tree-wordpress-aligned-rebuild.md`  
Pipeline: `.foundry/staging/homoplasticus-wp-rebuild/pipeline.json`  
Stage work orders: `.foundry/staging/homoplasticus-wp-rebuild/stage-03-milestone-c/work-orders.md`

## Team Structure

Four streams run in parallel. docs-release waits for all to complete. systems-architect-cloud runs in parallel but builder-cloud waits for its ADR approval.

---

### 1. builder-woocommerce-worker (subagent: builder, model: sonnet)

**Scope:**
- `apps/wp-plugin-foundry-bridge/includes/abilities/woocommerce/`
- `apps/wp-plugin-foundry-bridge/includes/abilities/worker/`
- `apps/wp-mcp-server/src/worker-client.ts`
- `tools/scripts/run-site-audit.mjs`

**Depends on:** none — starts immediately

**Task sequence:** WO-009 → WO-015

**Instructions:**
- WO-009 (WooCommerce): All abilities check `class_exists('WooCommerce')` before registering. If absent, pack skips and discovery shows `woocommerce: { available: false }`. `wc.product-upsert` requires proposal-required write class. `wc.checkout-smoke` tests full checkout flow with a test product. Update Node MCP `product.list` and `product.upsert` to proxy to abilities.
- WO-015 (Worker): All worker abilities check for configured worker URL. If absent: `{ "available": false, "reason": "worker-not-configured" }`. Long-running jobs return `{ "queued": true, "job_id": "..." }`. Refactor `run-site-audit.mjs` to be callable from worker ability. Local Playwright fallback for dev.

---

### 2. builder-sdk-compat (subagent: builder, model: sonnet)

**Scope:**
- `apps/wp-plugin-foundry-bridge/sdk/`
- `apps/ai-foundry-compat-yoast/` (new Nx app)
- `apps/ai-foundry-compat-acf/` (new Nx app)
- `apps/ai-foundry-compat-gravity-forms/` (new Nx app)
- `apps/ai-foundry-compat-wpml/` (new Nx app)
- `apps/ai-foundry-compat-updraftplus/` (new Nx app)

**Depends on:** none — starts immediately

**Task sequence:** WO-017 → WO-018a → WO-018b → WO-018c → WO-018d → WO-018e

**Instructions:**
- WO-017 (Extension SDK): Define `AI_Foundry_Ability_Provider` interface. Third-party plugin implements interface + calls `add_action('ai_foundry_abilities_init', [$this, 'register_abilities'])`. SDK loader discovers and validates extension manifests. PHPUnit test harness lets extension authors test abilities without full WP stack. Include a working example pack in `sdk/examples/`.
- WO-018a-e (Compat Packs): Each is an independent WordPress plugin. Activates only if target plugin is active. Degrades cleanly if target plugin is later deactivated. Abilities register under own namespace (e.g. `ai-foundry-acf/field.get`). Use Extension SDK test harness for unit tests.
  - 018a: Yoast/Rank Math/AIOSEO extended abilities (builds on Stage 1 SEO adapter)
  - 018b: ACF/Meta Box custom field read/write abilities
  - 018c: Gravity Forms/Fluent Forms form data read abilities
  - 018d: WPML/Polylang multilingual content abilities
  - 018e: UpdraftPlus/BackWPup backup status abilities

---

### 3. systems-architect-cloud (subagent: systems-architect, model: opus)

**Scope:**
- `docs/adr/adr-013-cloud-control-plane.md` (produce this file)

**Depends on:** none — starts immediately, BUT builder-cloud is blocked until ADR is approved

**Task sequence:** ADR for WO-016

**Instructions:**
- Produce `docs/adr/adr-013-cloud-control-plane.md` using the ADR template. Cover:
  - Multi-site enrollment: site slug, license key, enrollment handshake
  - Policy push: control plane → plugin, allowlist/blocklist sync, rate limits
  - Audit ingestion: event push from plugin → central registry
  - Billing/licensing hooks: present but deferred to separate billing service
  - Security: auth between plugin and control plane, no site-to-site data leakage
  - Options considered: self-hosted vs SaaS control plane
  - Decision and consequences
- Send ADR to lead for principal approval. DO NOT start WO-016 implementation.

---

### 4. builder-cloud (subagent: builder, model: sonnet)

**Scope:**
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-cloud-client.php`
- `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-enrollment.php`
- `apps/wp-plugin-foundry-bridge/includes/abilities/cloud/`
- `apps/control-plane/` (new Nx app)

**Depends on:** systems-architect-cloud ADR approved by principal

**Task sequence:** WO-016 (BLOCKED until ADR gate PASS)

**Instructions:**
- Do not start until lead signals ADR approved.
- Implement per ADR. WordPress plugin side: cloud client HTTP helper, enrollment abilities (`cloud.enroll`, `cloud.policy-get`, `cloud.audit-push`). Control plane side: new `apps/control-plane/` Nx app with enrollment registry, policy API, audit ingestion endpoint.

---

### 5. docs-release (subagent: docs-release-agent, model: sonnet)

**Scope:**
- `apps/wp-plugin-foundry-bridge/readme.txt`
- `apps/wp-plugin-foundry-bridge/CHANGELOG.md`
- `apps/wp-plugin-foundry-bridge/assets/`
- `docs/operator-guide.md`
- `docs/extension-author-guide.md`
- `docs/privacy-policy.md`
- `docs/support-matrix.md`
- `docs/migration-guide.md`

**Depends on:** builder-woocommerce-worker, builder-sdk-compat, builder-cloud all complete

**Task sequence:** WO-019

**Instructions:**
- Update `readme.txt` with full feature list, screenshots description, changelog, tested-up-to.
- `CHANGELOG.md` — convert conventional commits to user-readable format.
- `assets/` — produce placeholder filenames with spec: screenshot-1.png (admin screen, 800x600), screenshot-2.png (ability list), banner-772x250.png, icon-256x256.png. Note in output what each asset should show so designer can produce them.
- Operator guide: install → configure → connect Claude/ChatGPT workflow.
- Extension author guide: SDK usage, interface implementation, test harness.
- Privacy policy: lists all external connections (control plane URL, worker URL if configured), audit log data stored, Application Password scope.
- Support matrix: WP 6.4-6.7, PHP 8.1-8.3, tested plugins list.
- Migration guide: JSON file proposals → DB proposals (links to WO-013 migrator).
- Before final submission: request `@verifier` marketplace readiness check.

---

## Coordination Rules

- Streams 1 (WooCommerce/Worker), 2 (SDK/Compat), and 3 (Cloud ADR) start simultaneously
- Stream 4 (builder-cloud) starts only after ADR gate: systems-architect-cloud signals done → lead shows ADR to principal → principal approves → lead unblocks builder-cloud
- Stream 5 (docs-release) starts only after streams 1, 2, and 4 all signal complete
- Before docs-release submits to marketplace, lead runs @verifier for marketplace readiness check
- Lead updates continuity state to `release` phase after verifier PASS

## Acceptance Gate

```bash
pnpm nx run-many -t build lint test --projects=wp-plugin-foundry-bridge,ai-foundry-compat-yoast,ai-foundry-compat-acf,ai-foundry-compat-gravity-forms,ai-foundry-compat-wpml,ai-foundry-compat-updraftplus
```

Also verify:
- WooCommerce abilities return `{ available: false }` when WC deactivated — no fatal errors
- Extension SDK example pack registers one working ability visible in discovery
- All 5 compat packs activate/deactivate cleanly with and without target plugin
- `readme.txt` passes WordPress.org validator
- Plugin zip passes WordPress Plugin Check (plugincheck.wp.net) — zero blocking issues

## Work Orders

`.foundry/staging/homoplasticus-wp-rebuild/stage-03-milestone-c/work-orders.md`
