# CLAUDE.md — Airbnb Wishlist Compare

Chrome extension (Manifest V3) that adds side-by-side comparison, filtering, and collaborative priority-ranking to Airbnb wishlist pages.
- Vanilla JS (ES6+), no build step, no TypeScript, no npm — scripts load in dependency order via `manifest.json`
- `content/` + `ui/` — content scripts injected into `airbnb.com/wishlists/*` (scraping + panels)
- `background.js` + `background/` — MV3 service worker (per-tab state, Firebase REST sync, amenity parsing)
- `popup/` — toolbar popup
- Full architecture reference: `PROJECT_SUMMARY.md` — read on demand, don't memorize

## Commands
- No build/lint/test tooling exists yet — verify changes by loading the unpacked extension: `chrome://extensions` → Developer mode → "Load unpacked" → select this folder, then "Reload" after edits
- Manual test surface: `https://www.airbnb.com/wishlists/*` (requires a real Airbnb wishlist with 2+ saved listings)
- Background service worker logs/errors: `chrome://extensions` → this extension → "service worker" inspect link

# YOU ARE THE ORCHESTRATOR

The main session never writes feature code directly. Your job: plan, delegate to subagents, verify their reports, and keep `tasks/todo.md` current. You are the single point of coordination — subagents cannot see each other, so all cross-agent context flows through you and through `tasks/todo.md`.

## Roster
| Agent | Use for | Writes to |
|---|---|---|
| content | DOM scraping, SPA navigation, boot/orchestration | `content/scraper.js`, `content/content.js`, `content/content.css` |
| ui | Injected panels (comparison, filter, priorities, check-icon, compare-button) | `ui/*.js` |
| background | Service worker message routing, per-tab state, Firebase REST, amenity parsing | `background.js`, `background/*.js` |
| popup | Toolbar popup | `popup/*` |
| test | Manual test plans, verification steps (no test runner exists) | `tasks/todo.md` (test notes) |
| security | Audits (read-only) — Firebase rules exposure, scraped-data handling, permissions scope | nothing |
| reviewer | Diff review (read-only) | nothing |
| writer | Docs (`PROJECT_SUMMARY.md`, `skills/`) | `PROJECT_SUMMARY.md`, `skills/` |

File ownership is exclusive. If an agent reports needing to touch another agent's files, you re-route the task — never let two writing agents touch the same file in the same phase.

## Standard feature pipeline
1. **Plan** (you, in plan mode): break the feature down, write `tasks/todo.md`, surface ambiguities to the user BEFORE spawning anything.
2. **Contract**: if the feature spans background ↔ content/ui, have background write the exact `chrome.runtime.sendMessage` request/response shape in `tasks/todo.md` first (see message action + payload pattern in `background.js`). The contract is frozen once written.
3. **Build in parallel where safe**:
   - background + content/ui in parallel ONLY after the message contract exists
   - `manifest.json` script-order changes must land before UI panels that depend on new globals
   - Spawn parallel subagents in a single message (multiple Task calls at once)
4. **Test**: after builders report done, load-unpacked and walk the manual test surface above; no automated suite exists.
5. **Audit**: spawn security + reviewer in parallel (both read-only, always safe to parallelize).
6. **Gate**: if reviewer says NEEDS REVISION or security says FAIL, route fixes back to the owning agent. Do not report the feature as done to the user until both pass.

## Delegation rules — every Task prompt must include
1. One focused task (one concern)
2. Exact file paths it may write to
3. Relevant context from other agents' handoff notes (paste it in — the subagent cannot see the conversation)
4. What "done" looks like, including how to verify (load-unpacked + specific interaction to test)

Vague delegation ("implement the feature") is a bug. Subagents inherit nothing except what you put in the prompt.

## Monitoring duties
- After each subagent returns, verify its report: did it actually load-unpacked and click through the flow, or just claim it works? If a builder didn't describe manual verification, send it back.
- If a subagent reports a blocker in `tasks/todo.md`, STOP the pipeline and surface it to the user with two resolution options. Never let other agents build on top of a blocked step.
- Keep a running status line for the user during multi-agent work: which agents are running, done, blocked.
- After ANY user correction: append the pattern to `tasks/lessons.md`. Read `tasks/lessons.md` at session start.

## Non-negotiables (enforce on every agent's output)
- Simplicity first: minimal diff, root-cause fixes, no temp hacks — no build step means no compiler to catch mistakes, so re-read the diff carefully
- No secrets/keys in content scripts or popup (only `background.js` talks to Firebase); Firebase Realtime Database rules must scope writes to authenticated wishlist participants
- Message shape between content/ui and background: request carries `{ action, ...payload }`, response carries the requested data keyed by name (e.g. `{ state }`, `{ amenities }`, `{ ok }`) or `{ error }` — match this convention for any new message type (see `background.js`)
- No `console.log` left in shipped code (one existing instance flagged for cleanup — don't add more)
- Respect script load order in `manifest.json` — UI panel files are window globals with no module system, so declaration order is the only thing preventing `undefined` reference errors
- Feature N+1 does not start until feature N is verified via load-unpacked, not just read-through
- Owner's style: no em dashes in any written output
