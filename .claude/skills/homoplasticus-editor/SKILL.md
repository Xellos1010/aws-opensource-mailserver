---
name: homoplasticus-editor
description: Propose, preview, and apply content changes to the Homo Plasticus WordPress site via MCP. Use when the user says "change the page", "update the headline", "add a product", "edit content", or any editorial request targeting the live site.
---

## Invocation Trigger Rules

Activate this skill when the user's request contains editorial intent directed at the WordPress site. Examples:

**Client-style phrases (principal speaks as the client's voice):**
- "Can you change the homepage to say X?"
- "Update the headline to something that sounds more welcoming."
- "The hero text needs to be shorter — make it punchy."
- "Add a new product called X at $Y."
- "Edit the About page."
- "That paragraph on the shop page is wrong — fix it."

**Operator-style phrases (principal works directly):**
- "Propose an update to page 42."
- "Get me the current content of the front page."
- "Apply the proposal we just reviewed."
- "Revert the last change."
- "Show me what pages exist."

**Activation rule:** if the request references a page, post, product, or any site content AND implies reading, drafting, proposing, applying, or reverting a change — activate this skill. Do NOT activate for infrastructure questions or non-editorial queries.

---

## Guided Workflow

Follow this exact sequence for every editorial request. Do not skip steps or auto-apply without explicit approval.

### STEP 1 — Identify the target

If the user named a specific page or post, proceed to STEP 2.

If the target is ambiguous:
1. Call `page.list` to enumerate published pages.
2. Present a numbered list to the user: title, slug, and permalink.
3. Ask: "Which page would you like to update?"
4. Wait for the user to select one before proceeding.

### STEP 2 — Fetch current state

Call `page.get` with the identified `id` or `slug`.

Show the user a concise excerpt of the current content — enough to confirm this is the right page. Do NOT dump the entire raw HTML unless the user asks. A useful excerpt is: title, status, and the first 200 characters of the content field.

### STEP 3 — Author the change

Draft the proposed new content based on the user's request. Then call `page.propose_update` with:
- `id` or `slug` (from STEP 2)
- `title` (updated or same)
- `content` (the new body)
- `excerpt` if relevant
- `notes` describing what changed and why

Capture the returned `proposalId`. You will need it in STEP 5.

### STEP 4 — Show the diff/preview

Display the `diffPreview` from the `page.propose_update` response to the user. Format it as a code block so the diff markers are readable.

Also share the `previewUrl` if available.

**Do NOT call `page.apply_proposal` yet.** The user must approve first.

### STEP 5 — Ask for explicit approval

Ask the user exactly this question (or equivalent wording):

> "Apply this change? [yes / no / edit]"

Wait for the user's response. Do not proceed until they answer.

**yes** — call `page.apply_proposal` with the captured `proposalId`. Report that the change is live and share the page permalink.

**no** — do not call `page.apply_proposal`. Confirm to the user: "Nothing was changed. The proposal has been discarded." (The proposal file remains on disk for reference but is never applied.)

**edit** — ask the user what they want to refine. Return to STEP 3 with the updated instructions. Reuse the same target from STEP 2.

### STEP 6 — Post-apply offer

After a successful apply, offer:

> "Would you like me to run a Lighthouse audit to validate the page still performs well?"

If yes, call `audit.run`. Present the returned scores. Flag any performance or SEO score below 80 as worth reviewing.

---

## Safety Rails

- **Never auto-apply.** `page.apply_proposal` must not be called before the user types "yes" (or unambiguous affirmative) in response to the STEP 5 prompt.
- **Never modify pages outside the user's stated target.** If the user said "update the About page," do not touch any other page even if the content seems related.
- **Surface errors verbatim.** If `page.apply_proposal` returns an error, show the full error message and ask: "Would you like me to try reverting with `page.revert_proposal`?"
- **Plugins, products, and media follow the same pattern.** For any write operation:
  - Use `plugin.list`, `product.list`, or `media.list` to show current state first.
  - Draft the change and describe it to the user.
  - Ask for approval before calling any mutating tool (`product.upsert`, `plugin.activate`, `plugin.deactivate`, `media.set_focal_point`).
- **If the user asks to undo a change** that has already been applied, call `page.revert_proposal` with the original `proposalId`. Confirm the revert completed and show the post-revert state.

---

## Demo Sequence Suggestions

Use these during live client demos to illustrate the full workflow naturally:

**1. Enumerate site content**
> "Show me what pages exist."
- Call `page.list`. Present as a clean table: ID, title, slug, status.

**2. Full propose-review-apply flow**
> "Change the homepage headline to 'Welcome to the new era'."
- Run the full STEP 1–6 workflow against the front-page (slug `home` or whichever `page.list` reveals as the front page).
- The client should see the diff in the terminal and the live change in the browser after approval.

**3. Lighthouse audit**
> "Run a Lighthouse audit."
- Call `audit.run` (omit `background: true` so scores appear immediately).
- Present performance, accessibility, SEO, and best-practices scores. Highlight any score below 80.

**4. Platform health**
> "Show platform health."
- Call `system.health_report`. Summarize: WordPress status, audit count, proposal count, Mailpit status (if enabled).

---

## Connection Presumption

This skill presumes the MCP server is reachable at the configured endpoint.

- **401 response on any tool call:** the bearer token is wrong or missing. Ask the user to verify `MCP_API_KEY` is set correctly in the server environment, and that the `Authorization: Bearer <key>` header matches.
- **Connection refused:** the MCP server or tunnel is not running. Ask the user to check `runs/demo/current-url.txt` and restart `pnpm mcp:dev` (local) or `pnpm demo:start` (tunnel). If using Claude Desktop with `mcp-remote`, the tunnel URL in `claude_desktop_config.json` may be stale — the principal must share a fresh URL.
- **Tool calls time out:** the MCP server is running but WordPress is unresponsive. Check Docker is up (`pnpm dev:stack`) and WordPress is healthy (`GET /health` on the MCP server endpoint).
