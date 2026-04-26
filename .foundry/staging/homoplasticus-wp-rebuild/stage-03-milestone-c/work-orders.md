# Work Orders — Stage 3: Milestone C (Ecosystem + Release)

**Prerequisite:** Stage 2 `WO-WP-S2-DONE` PASS  
**Team Config:** `.foundry/staging/homoplasticus-wp-rebuild/stage-03-milestone-c/team-config.json`

---

## WO-WP-S3-009: WooCommerce Pack

- **Agent Role:** builder-woocommerce-worker
- **Subagent Type:** builder | **Model:** sonnet
- **Scope:** `apps/wp-plugin-foundry-bridge/includes/abilities/woocommerce/`
- **Depends On:** Stage 2 complete
- **Abilities:** `ai-foundry/woocommerce.product-list`, `.product-get`, `.product-upsert`, `.inventory-report`, `.order-list`, `.order-get`, `.coupon-list`, `.checkout-smoke`
- **Acceptance Criteria:**
  - [ ] All abilities skip registration when WooCommerce inactive — no fatal errors
  - [ ] Discovery shows `woocommerce: { available: false }` when WC absent
  - [ ] `wc.product-upsert` requires proposal-required write class
  - [ ] `wc.checkout-smoke` returns pass/fail + error details for full checkout flow
  - [ ] Node `product.list` and `product.upsert` proxy to abilities
- **Verification:** `pnpm nx run wp-plugin-foundry-bridge:test` — degradation tests
- **Plan Approval Required:** no

---

## WO-WP-S3-015: Worker Integration Pack

- **Agent Role:** builder-woocommerce-worker
- **Subagent Type:** builder | **Model:** sonnet
- **Scope:** `apps/wp-plugin-foundry-bridge/includes/abilities/worker/`, `apps/wp-mcp-server/src/worker-client.ts`, `tools/scripts/run-site-audit.mjs`
- **Depends On:** WO-WP-S3-009
- **Abilities:** `ai-foundry/worker.screenshot`, `ai-foundry/worker.lighthouse-run`, `ai-foundry/worker.visual-regression`
- **Acceptance Criteria:**
  - [ ] All abilities return `{ available: false, reason: "worker-not-configured" }` when worker URL absent
  - [ ] `worker.screenshot` uses configured worker URL or local Playwright fallback
  - [ ] Long-running jobs return `{ queued: true, job_id: "..." }`
  - [ ] `run-site-audit.mjs` callable from worker ability
- **Verification:** `pnpm nx run wp-plugin-foundry-bridge:test` — degradation tests
- **Plan Approval Required:** no

---

## WO-WP-S3-ADR: Cloud Control Plane ADR

- **Agent Role:** systems-architect-cloud
- **Subagent Type:** systems-architect | **Model:** opus
- **Scope:** `docs/adr/adr-013-cloud-control-plane.md`
- **Depends On:** Stage 2 complete
- **Output:** ADR covering enrollment, policy push, audit ingestion, billing hooks, security model, options considered
- **Acceptance Criteria:**
  - [ ] ADR follows standard format: Context, Options, Decision, Consequences
  - [ ] Enrollment flow specified (site slug, license key, handshake)
  - [ ] Policy push mechanism specified (pull vs push, frequency, auth)
  - [ ] Security: plugin-to-control-plane auth specified, no site-to-site data leakage
  - [ ] Principal approval received before builder-cloud starts WO-016
- **Plan Approval Required:** yes (principal must approve ADR)

---

## WO-WP-S3-016: Cloud Control Plane Implementation

- **Agent Role:** builder-cloud
- **Subagent Type:** builder | **Model:** sonnet
- **Scope:** `apps/wp-plugin-foundry-bridge/includes/class-ai-foundry-cloud-client.php`, `class-ai-foundry-enrollment.php`, `abilities/cloud/`, `apps/control-plane/`
- **Depends On:** WO-WP-S3-ADR approved by principal
- **Acceptance Criteria:**
  - [ ] Plugin can enroll with control plane using site slug + license key
  - [ ] Control plane can push allowlist/blocklist policy updates to enrolled sites
  - [ ] Audit events pushable via `cloud.audit-push`
  - [ ] `apps/control-plane/` Nx app runs independently of WordPress
- **Plan Approval Required:** no (ADR approval gates start, not plan approval)

---

## WO-WP-S3-017: Extension SDK

- **Agent Role:** builder-sdk-compat
- **Subagent Type:** builder | **Model:** sonnet
- **Scope:** `apps/wp-plugin-foundry-bridge/sdk/`
- **Depends On:** Stage 2 complete
- **Acceptance Criteria:**
  - [ ] `AI_Foundry_Ability_Provider` interface defined
  - [ ] Extension loader discovers third-party extensions via hook
  - [ ] Extension validator rejects malformed manifests with actionable error
  - [ ] PHPUnit test harness works without full WP stack
  - [ ] Example pack installs and registers one working ability
- **Verification:** `pnpm nx run wp-plugin-foundry-bridge:test` — SDK + example tests
- **Plan Approval Required:** no

---

## WO-WP-S3-018a: Yoast/Rank Math/AIOSEO Compat Pack

- **Agent Role:** builder-sdk-compat | **Model:** sonnet
- **Scope:** `apps/ai-foundry-compat-yoast/`
- **Depends On:** WO-WP-S3-017 (Extension SDK)
- **Acceptance Criteria:** [ ] Extends SEO adapter with plugin-specific extended abilities [ ] Activates only if Yoast, Rank Math, or AIOSEO active [ ] Degrades if target plugin deactivated
- **Plan Approval Required:** no

---

## WO-WP-S3-018b: ACF / Meta Box Compat Pack

- **Agent Role:** builder-sdk-compat | **Model:** sonnet
- **Scope:** `apps/ai-foundry-compat-acf/`
- **Depends On:** WO-WP-S3-017
- **Abilities:** `ai-foundry-acf/field.get`, `ai-foundry-acf/field.update` (proposal-required)
- **Acceptance Criteria:** [ ] Custom field read/write works with ACF and Meta Box [ ] Degrades cleanly if both absent
- **Plan Approval Required:** no

---

## WO-WP-S3-018c: Gravity Forms / Fluent Forms Compat Pack

- **Agent Role:** builder-sdk-compat | **Model:** sonnet
- **Scope:** `apps/ai-foundry-compat-gravity-forms/`
- **Depends On:** WO-WP-S3-017
- **Abilities:** `ai-foundry-gf/forms.list`, `ai-foundry-gf/entries.list` (read-only)
- **Acceptance Criteria:** [ ] Form and entry data readable [ ] No write abilities (forms not writable via AI) [ ] Degrades if plugin absent
- **Plan Approval Required:** no

---

## WO-WP-S3-018d: WPML / Polylang Compat Pack

- **Agent Role:** builder-sdk-compat | **Model:** sonnet
- **Scope:** `apps/ai-foundry-compat-wpml/`
- **Depends On:** WO-WP-S3-017
- **Abilities:** `ai-foundry-wpml/content.list-languages`, `ai-foundry-wpml/content.get-translation`
- **Acceptance Criteria:** [ ] Language-aware content listing [ ] Degrades cleanly if multilingual plugin absent
- **Plan Approval Required:** no

---

## WO-WP-S3-018e: UpdraftPlus / BackWPup Compat Pack

- **Agent Role:** builder-sdk-compat | **Model:** sonnet
- **Scope:** `apps/ai-foundry-compat-updraftplus/`
- **Depends On:** WO-WP-S3-017
- **Abilities:** `ai-foundry-backup/status.get`, `ai-foundry-backup/schedule.get` (read-only)
- **Acceptance Criteria:** [ ] Backup status and schedule readable [ ] Read-only only — no trigger-backup ability [ ] Degrades if backup plugin absent
- **Plan Approval Required:** no

---

## WO-WP-S3-019: Community Release Pack

- **Agent Role:** docs-release
- **Subagent Type:** docs-release-agent | **Model:** sonnet
- **Scope:** `apps/wp-plugin-foundry-bridge/readme.txt`, `CHANGELOG.md`, `assets/`, `docs/`
- **Depends On:** WO-WP-S3-015, WO-WP-S3-018e, WO-WP-S3-016 all complete
- **GATE:** @verifier marketplace readiness check PASS required before submission
- **Acceptance Criteria:**
  - [ ] `readme.txt` passes WordPress.org validator
  - [ ] `CHANGELOG.md` readable by non-technical users
  - [ ] Asset specs produced for designer (screenshot-1, screenshot-2, banner, icon)
  - [ ] Operator guide covers: install → configure → connect → use workflow
  - [ ] Extension author guide covers: SDK usage + test harness
  - [ ] Privacy policy documents all external connections
  - [ ] Support matrix: WP 6.4–6.7, PHP 8.1–8.3, tested plugins
  - [ ] Plugin zip passes WordPress Plugin Check — zero blocking issues
- **Plan Approval Required:** no (but verifier gate required before submission)

---

## WO-WP-S3-DONE: Stage 3 / Full Initiative Acceptance Check

- **Agent Role:** lead + verifier
- **Subagent Type:** verifier | **Model:** sonnet
- **Depends On:** All stage-03 work orders complete
- **Acceptance Criteria:**
  - [ ] All Nx projects build, lint, test — zero failures
  - [ ] Discovery endpoint: `abilities.count` >= 32 + extension pack abilities
  - [ ] WC abilities: return `available: false` without WooCommerce
  - [ ] Worker abilities: return `available: false` without worker URL
  - [ ] Extension SDK: example pack registers ability in discovery
  - [ ] All 5 compat packs activate/deactivate cleanly
  - [ ] Plugin Check: zero blocking issues
  - [ ] Plugin submitted to wordpress.org/plugins/ review queue
- **Post-completion:** Update continuity to `lifecycleStage: release`. Mark initiative DONE.
