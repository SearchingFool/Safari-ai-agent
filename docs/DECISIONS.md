# Safari AI Agent — Decision log

Updated: 2026-10-24. Last updated by Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04, D-047). Each entry is a project decision or an explicitly unresolved design question. A recommendation is not an already-verified implementation.

| ID | Status | Decision / question | Basis and next action |
|---|---|---|---|
| D-001 | Agreed | Focus on AI operating real webpages (read, fill, click, navigate), not chat/summarization | End-to-end MVP acceptance in PRODUCT_REQUIREMENTS |
| D-002 | Agreed | Safari/iPad first; reuse Userscripts for no-developer-membership prototype | Existing iPad installation and 0.1.1 work |
| D-003 | Agreed | Do not require an on-iPad model or a dedicated native browser | Model hosted by eligible provider/other approved runtime |
| D-004 | Agreed | Keep browser engine/model interface provider-agnostic | Common versioned browser capability contract |
| D-005 | Proposed, needs technical validation | Expose browser tools through MCP where supported | First validate a real iPad client using existing subscriptions; gateway may be required |
| D-006 | **RESOLVED for Claude 2026-10-25 — a subscription does NOT fund direct API calls** | Reuse ChatGPT/Claude/Gemini subscriptions without extra API charges | **Tested empirically, not inferred.** With a valid OAuth token from `ant auth login` (scopes `user:developer user:inference user:profile`): `GET /v1/models` returned **200**, and `POST /v1/messages` returned **400 "Your credit balance is too low"** — twice, with the **same token**, seconds apart. Auth succeeds; inference is refused for want of API credit. The subscription authenticates you to the API but carries no inference entitlement. **The general rule this establishes: the subscription pays when THEIR app is the client calling your server; your code calling their model is metered.** That is why the existing connector path (B1-02) is free and why any design where our own code holds the conversation is not. ChatGPT and Gemini remain unverified. |
| D-007 | Agreed | Mac-hosted controller is optional, not mandatory | Remote or supported direct integration preferred |
| D-008 | Agreed | Full configurable governance harness follows, not included in, initial MVP | Basic secure execution boundaries still required before remote AI actions |
| D-009 | **Closed 2026-10-11** | Which client/provider is the first supported end-to-end tool caller? | **Claude, via a custom remote MCP connector with a static `Authorization: Bearer` header.** Verified live: full `initialize` / `tools/list` / `tools/call` handshake and a complete multi-page browser workflow. Remaining providers are optional adapters (F-01). |
| D-010 | **Closed 2026-10-11** | Gateway deployment, costs, credential handling and privacy model | **Tailscale Funnel over a loopback-bound Node gateway.** Public HTTPS with trusted TLS, no hosting account, no router changes, no recurring cost. Three distinct local secrets (MCP caller, device, demo login); none leave the Mac. |
| D-014 | **Open risk, accepted for prototype** | Userscripts (quoid) is a single point of failure for the iPad path | GPL-3.0 and not archived, but **App Store-only distribution with no sideload or version pinning**, effectively one maintainer, and in `v5.0.0-beta.*` since 2026-01 with the last substantive commit 2026-05-10 (verified 2026-10-11). Accepted because `src/core.js` is deliberately host-agnostic and portable to a native Safari WebExtension (F-01), which is the named fallback if Userscripts becomes unavailable. |
| D-015 | **Open** | MCP protocol version target | Claude requested `2026-07-28`; the gateway advertises `2025-11-25` and returned 400, after which the client renegotiated successfully. Non-fatal, but the compatibility target should be reviewed deliberately rather than loosened. Do not widen version validation without testing. |
| D-016 | **Open** | Human approval latency vs. command timeout | Measured 3.2 s–14.9 s to approve a click against a 25 s `commandTimeoutMs`. A timeout returns "outcome uncertain", the one class that cannot be safely retried. Needs an iPad measurement before D2 acceptance; consider separating approval wait from execution timeout. |
| D-017 | **Open — must fix before any wider use** | Two connected tabs deadlock the device session with no path to recovery from the UI | **Observed live 2026-10-11.** A second tab connecting while another owns the session polls `409 DEVICE_SESSION_CONFLICT` once per second indefinitely. The gateway behaves correctly — single-session ownership is deliberate — but the *user-visible* behaviour is a silent hang: the losing panel shows a bare connection error, never names the owning origin, and offers no takeover. The only fix is to find the other tab and press Stop, which is undiscoverable. On iPad, where tabs are easy to lose track of and may be suspended rather than closed, this will present as "the agent is broken". **Needed:** surface the owning origin in the 409 payload and render it in the panel ("https://example.com is connected — Stop it there, or Take over here"), and consider an explicit takeover action. Note a suspended-but-connected iPad tab may hold the session while being unreachable, which the current `deviceFreshMs` staleness window only partially mitigates. |
| D-019 | **Open — must fix before any non-demo interactive use** | The click-risk gate fails open, and a keyword blocklist is the wrong shape for it | **Found live on a real site 2026-10-11.** `riskOfClick()` in `src/core.js` returns `null` for anything unmatched, so any control nobody enumerated is treated as an ordinary click. `HIGH_IMPACT` is a single English regex (`delete\|pay\|publish\|submit\|post\|…`) plus form-submit detection. On a logged-in Substack feed, **Like, Follow, Subscribe and Restack all pass as ordinary clicks** — meaning they are *not* hard-blocked and instead fall through to the generic prompt. **They are still gated:** `src/remote.js` requires `window.confirm` for every click, so nothing fires without the operator. The defect is the *quality* of that consent, not its absence: the prompt reads "Allow AI browser agent to click e37 on https://example.com?" — naming the ref and origin but **not the control**. The operator approves `e37` without being told it is *Follow* or *Subscribe — $50/year*; only the model knows. Uninformed consent plus approval fatigue over a long task is the realistic failure path. **Minimum fix regardless of tiering: put the control's accessible name, tag and any price/destination text into the confirmation prompt.** The holes are generic, not platform-specific: (a) icon-only buttons with no `aria-label` yield an empty label and therefore no risk; (b) the regex is English-only — *Suivre*, *Abonnieren*, *关注* do not match; (c) an open-ended per-platform verb tail (share, repost, upvote, connect, endorse, apply, join, invite, block, report, mute, archive); (d) context-dependent generics (*Apply*, *Join*, *Continue*, *Accept*); (e) `<a href="#">` is an action, not navigation. **A longer regex cannot fix this.** Proposed: invert to fail-closed tiers — *blocked* (financial/destructive/identity/publishing), *requires approval* (default for anything not provably inert), *no approval* (only same-origin `<a href>` navigation, `aria-expanded` toggles, `role="tab"`, pagination). Use structural signals that survive translation and missing text: `aria-pressed`/`aria-checked` identifies state toggles (like/follow/bookmark) in any language with no label at all; enclosing `<form>`; absent `href`; **empty accessible name must elevate, not exempt**, and be reported so the model knows it is acting blind. Note the direct conflict with D-016: fail-closed increases approval count. |
| D-021 | **Agreed in principle 2026-10-11, design open** | Approval must offer "allow once" vs "allow always", scoped and revocable | Owner requirement. A binary per-click prompt guarantees approval fatigue (D-016: 3.2–14.9 s each), and fatigue produces reflexive approval — a tighter gate with no standing-grant option is *less* safe in practice, not more. **Scope is the whole design.** Granting "always" against an element ref is wrong: refs are ephemeral and reassigned on navigation, so a standing grant would silently transfer to an unrelated control. Proposed scoping: **origin + action class**, time-boxed to the current connected session, revoked by Stop, listed and individually revocable in the Remote AI panel ("3 standing approvals — review"). Interaction with D-019 tiers: **blocked** tier is never grantable; **elevated/consequential** tier is one-off only and can never be made standing; only the **routine** tier (same-origin navigation, expand/collapse, pagination, field fills) accepts "always". Implementation note: `window.confirm` is binary and cannot express three choices — this needs a custom dialog rendered in the existing shadow-DOM panel, which also avoids native modal dialogs blocking the bridge. **Research 2026-10-11** supports the hybrid: industry consensus is risk-tiered rather than one-time-or-persistent — session-scoped grants for low-risk reads, fresh per-action confirmation for irreversible or high-privilege actions, **step-up re-consent** when the agent exceeds its original scope, and grants carrying TTL + scope, listed with timestamps and revocable immediately. Michael & Roesner (arXiv 2607.13718) surveyed 21 permission proposals and 5 commercial agents and found **only 6 of 21 let users modify permissions after initial specification** — revocation *during* an active session is the near-universal gap, so the panel must support it rather than only offering Stop. They also warn that commercial agents force a false binary between high-overhead per-action approval and opaque LLM auto-review; do not adopt either pole. **Hard rule specific to browser agents:** because `browser_inspect` feeds untrusted page text to the model, prompt injection could attempt to escalate privileges, so standing grants must be **user-set only, never requestable by the model and never inferable from page content**. |
| D-022 | **Proposed, low cost, do first** | Declare MCP `ToolAnnotations` on all seven tools | **Researched 2026-10-11.** The MCP 2025-06-18 schema defines `readOnlyHint` (default `false`), `destructiveHint` (default **`true`**), `idempotentHint` (default `false`) and `openWorldHint` (default **`true`**). The protocol's own defaults are **fail-closed**, independently confirming the D-019 inversion. This gateway declares none, so all seven tools are currently advertised with the most dangerous defaults. Proposed: `browser_inspect`/`browser_verify`/`browser_status` → `readOnlyHint: true, destructiveHint: false`; `browser_fill` → `destructiveHint: false, idempotentHint: true`; `browser_navigate`/`browser_cancel` → `destructiveHint: false, idempotentHint: true`; `browser_click` → `destructiveHint: true`. Spec caveat: clients MUST treat annotations as untrusted unless the server is trusted — this gateway is operator-owned, so it qualifies. The same spec section already requires clients to "show tool inputs to the user before calling the server", which is the D-019 consent-quality fix stated normatively. |
| D-023 | **Largely fixed 2026-10-11; one gap remains** | Device session is bound to an origin, not a tab, so a new window silently breaks or hijacks it | **FIXED:** session is now keyed `{origin, instanceId, visibility}`; a hidden tab receives `{command:null, paused:'hidden'}` and `tools/call` *fails fast* rather than queueing into an unretryable timeout; 409 names the owning origin and offers explicit takeover; `target="_blank"` is retargeted to `_self` in the capture phase; `visibilitychange`/`pagehide` pause and resume with a loop-generation counter so a resume cannot leave two pumps running. 31/31 Node tests, 8 Chromium assertions. **TRAP FOUND WHILE FIXING — record this:** the obvious reading of the proposed fix (a fresh instance id per mount) would have shipped a regression, because the paired tab would then conflict with **itself** after every `browser_navigate` — the operation the bridge performs most — and deadlock for the full 45 s freshness window. Only a **sessionStorage**-backed id is correct: per-tab *and* surviving same-tab navigation. Falls back to a memory-only id on opaque origins and Private Browsing. **REMAINING GAP:** `K_SITE` is still origin-keyed in shared GM storage, so a new same-origin tab still auto-starts — it is now refused with a takeover path rather than silently joining the race, so the safety consequence is gone, but the auto-start itself is not fixed. Also `gateway/diagnostics.mjs` does not record `instanceId`, so live triage shows the origin but not which tab. Nothing here is verified on real Safari or iPad. |
| D-023-orig | *(superseded, kept for the diagnosis)* | Original D-023 analysis | **Observed live 2026-10-11:** opening a new window during a task drops the connection. Three compounding causes. (a) `gateway/server.mjs` stores `current={origin}` with no tab identity, and only 409s on a *different* origin — so **two same-origin tabs are both accepted, both refresh `lastPoll`, and either may claim a pending command (first poller wins, non-deterministic)**. (b) `src/remote.js` has **no `visibilitychange`/`pagehide` handling**; a backgrounded tab keeps polling but Safari throttles background timers past the 45 s `deviceFreshMs`, so `connected` flips false. (c) `K_SITE` is keyed on origin in shared GM storage, so a **new same-origin tab auto-starts** and joins the race unprompted. **Safety impact, not just UX:** a command may be claimed by a tab the operator cannot see, so either the `window.confirm` appears in an invisible tab (→ 25 s timeout → "outcome uncertain", the one unretryable class), or the operator approves in the visible tab while the action executes in a different same-origin tab showing different content. Compounded by D-019, that is approving an unnamed control in an unseen page context. `target="_blank"` links trigger it casually. Worse on iPad, where tabs are easily lost and aggressively suspended. **Proposed fixes:** (1) generate a per-tab instance id at mount and bind the session to `{origin, instanceId}`, returning the owning identity on conflict and offering explicit takeover (ties to D-017/D-021); (2) send `document.visibilityState` on poll and **refuse to deliver a command to a hidden tab**, so approval can never be requested in an unseen context; (3) set `target="_self"` before dispatching a click so same-origin navigation stays in the paired tab; (4) do not auto-start a new tab when another instance already holds the session; (5) handle `visibilitychange` to pause cleanly and show "Paused — tab not visible" rather than appearing dead. |
| D-020 | **Proposed** | Separate read-only and interactive capability tiers by site trust | Today's exposure existed because allowlisting a site grants *both* observation and action. Proposal: **read-only** sites expose `browser_inspect`/`browser_verify` only (still discloses page text, cannot act); **interactive** sites additionally expose `browser_fill`/`browser_click`/`browser_navigate` and must be explicitly designated as test/demo. Substack would have been read-only and D-019's gap would not have been reachable. This also makes explicit an assumption the current design leaves unwritten: that every allowlisted origin is one the owner is willing to let an AI *act* on. |
| D-018 | **Agreed 2026-10-11, scope widened deliberately** | Testing against real third-party sites, not only the bundled demo | The engine had only ever been exercised against `/demo`, a page written for it: stable DOM, clean labels, no frameworks or overlays. That proves plumbing, not generality. `SAFARI_EXTRA_ORIGINS` was added to the Mac launcher to widen the allowlist explicitly, with startup warnings, origin-format validation, and no default. **Every added origin is a site whose rendered text `browser_inspect` sends to the model provider**, so this must never be used on authenticated, private or sensitive pages. First real target: `https://substack.com`. |
| D-011 | Agreed | Manual copy/paste bridge is only a diagnostic path, never MVP completion | Does not meet natural-language browser automation requirement |
| D-012 | Agreed | This repository is the single project home | SearchingFool/Safari-ai-agent; no duplicate repo |
| D-013 | Agreed | Stop repeated open-ended research; verify only decisions that block current work | Link new research to specific FR or B-phase task |

| D-024 | **Agreed 2026-10-11 — plan change** | F-01 (native Safari Web Extension) is promoted from "Future" to **required** | The stated goal is Claude-in-Chrome-equivalent capability on Safari, extended to Codex, Antigravity and local models. Userscripts cannot reach **tabs, background execution, screenshots, a real permission model or a trustworthy UI surface** — all of which the reference implementation has. Userscripts therefore reaches roughly 60–70% of the goal and stops. `src/core.js` is host-agnostic by design so the DOM engine survives the move; the bridge and panel are rewritten. Membership ($99/yr) is needed to **ship**; free provisioning (7-day signing) is enough to **prove** it on-device. See [TARGET-ARCHITECTURE.md](TARGET-ARCHITECTURE.md). |
| D-024-rationale | **Corrected 2026-10-11 by measurement** | The stated justification for D-024 was partly wrong | **D-024 stands, but "background execution" was the wrong way to describe the benefit.** Measured on WebKit 26.x / macOS 15.7.4 (see [SERVICE-WORKER-LIFETIME.md](SERVICE-WORKER-LIFETIME.md), 1199 raw records committed): the MV3 background worker gets a **hard 30.0 s wall-clock budget from its own start, and activity does NOT extend it** — a 1.2 s fetch loop ran 24 ticks and died on schedule, across 7+ consecutive instances. Independently re-derived by the lead from the raw evidence: median interval between worker boots **29.9 s** over 88 boots. The platform therefore offers **resumable execution in 30-second instalments, not a long-running worker.** That still beats Userscripts, which cannot do it at all, and tabs/screenshots are untouched by this finding — but it demands externalised session state and top-level re-establishment of every entry point. Wake cost is cheap: alarm revival latency **70–105 ms** (n=9, median ~95 ms), about **0.4 %** of the 25 s command timeout, so D-016's budget is not threatened. **Fragile detail worth a regression test:** `alarms.create` must be called at **top-level evaluation** — armed there, 0/24 and 0/14 teardowns survived; re-armed from inside the worker at boot+2 ms, **26/26 and 6/6 teardowns, never survived once**. And `periodInMinutes: 0.4` is clamped to 30 s, so no period fires strictly inside the budget. It is a ~2 ms photo finish, not a safety margin; any refactor moving `alarms.create` behind an `await` silently converts a persistent session into one that dies every 30 s. **Not measured:** Safari.app itself (enabling unsigned extensions requires a Touch ID sheet the agent correctly refused to route around), Safari on battery/Low Power Mode, and **iPadOS entirely — which is the actual target surface.** |
| D-028 | **Open — BLOCKER on the native path being usable** | `extension/web/background.js` cannot recover from the teardown its keepalive exists for | **Verified by the lead 2026-10-11.** The alarm handler guards on `state.running`, but `state` is module-level (`background.js:37`) and is reset to `false` by the very teardown the alarm is meant to recover from — so the alarm fires, sees `running: false`, and does nothing. Worse, `restoreSession()` is referenced in the line-35 comment but **has 0 definitions in the file**; the described recovery mechanism does not exist. Consequence: a connected session **dies silently after 30 s** while the badge still reads `ON` and the gateway keeps queueing commands that will never be claimed. The extension is therefore not merely unverified, it is **known non-functional for any session longer than 30 seconds**. Fix requires persisting session state outside the worker (`storage.local`) and re-establishing the pump from a top-level read on every boot, plus a regression test pinning `alarms.create` to top level. |
| D-029 | **CONFIRMED on device 2026-10-11 — a hard product constraint, not a bug** | On iPadOS, driving the agent requires **Split View**; a backgrounded Safari tab is *suspended*, not merely hidden | **First real iPad session.** `browser_status` works with Safari in the background because it never touches the page. Anything that does — `browser_inspect`, `fill`, `click`, `navigate` — is refused the moment Safari is not on screen. Evidence: `13:18:11 browser_inspect → TOOL_ERROR in 1 ms` with Safari backgrounded, then `13:19:41 browser_inspect → MCP_OK in 1398 ms` with it visible. **The refusal message was "No active iPad Safari device", NOT "the tab is not visible"** — which identifies the mechanism precisely: iPadOS **suspends** the tab, so polling stops and the session ages out of the 45 s `deviceFreshMs` window before the visibility gate is ever consulted. macOS behaves differently: a hidden tab keeps polling, throttled, and is caught by the visibility gate instead. Same outcome, different cause — do not assume the Mac's behaviour transfers. **Consequence for the product:** on a single-screen iPad the operator cannot be in the Claude app *and* have Safari visible, so **Split View (or Stage Manager) is mandatory** for any page-touching work. This is an iPadOS platform constraint and no code change lifts it; a native extension does not help either, since the constraint is Safari being off-screen, not the bridge's capabilities. It must be stated in the setup guide as a requirement rather than discovered. **Silver lining:** the refusal is **fast-fail at 1 ms**, not a 25 s timeout, so the operator gets a clear error instead of the unretryable "outcome may be uncertain" (the `tools/call` fast-fail added during the D-023 work, beyond its brief). |
| D-030 | **Answered 2026-10-11 — corrects an earlier imprecise claim** | Can the MCP server run on the iPad itself, removing the Mac? | **Correction first:** `TARGET-ARCHITECTURE.md` stated "iPadOS cannot spawn local processes, so there can be no local MCP server". That is **imprecise**. An iPadOS app *can* bind a local HTTP server while running; what iPadOS forbids is background daemons and processes outside an app. **The real blocker is reachability, not hosting.** Claude's remote MCP connector executes on Anthropic's infrastructure and must reach a publicly routable HTTPS endpoint. The iPad is behind NAT, and **Tailscale Funnel is unavailable on iOS/iPadOS** — Serve and Funnel are CLI-configured and Tailscale documents no CLI for iOS or Android (verified 2026-10-11); even on macOS the sandboxed App Store build is excluded. So an on-iPad MCP server is unreachable by *any* cloud-hosted model. **The answer therefore splits by where the model runs:** (a) **cloud model** (Claude, Codex, Gemini) → the server must be publicly reachable → an always-on host such as the Mac is structurally required; (b) **on-device model** → client and server are both on the iPad, loopback suffices, **no Mac, no Funnel, no public exposure at all, and page text never leaves the device**. This materially reframes the multi-provider plan: the local-model path is not merely a privacy improvement, it is **the only configuration that eliminates the Mac dependency**. Caveats: foreground-only, so Split View (D-029) becomes a three-way constraint; and no App Store app hosts this today — it would be a purpose-built container app, most plausibly the same one shipping the native Safari extension (D-024). |
| D-031 | **Closed 2026-10-11 — invariant pinned by test; class is WIDER than recorded below** | Preview and Submit share the `form-submit` action class | Raised by the model during the 2026-10-11 iPad run: on `/demo/product`, `<button type="button">Preview selection</button>` and `<button type="submit">Submit demo form</button>` both classify as category `form-submit`, because `elevatedCategory()` assigns it to anything with a form owner. The demo form carries no password and no `cc-*` field, so **neither hits a hard ceiling** — both are ELEVATED. **Empirically verified by the lead: both report `grantable: false`, so a standing grant from approving Preview does NOT cover Submit.** Standing grants apply only to ROUTINE. The shared class is therefore safe — **but only because ELEVATED is never grantable.** That invariant is not obviously load-bearing, and relaxing it (a tempting "reduce approval fatigue" change under D-021) would make this immediately exploitable: one *Always allow* on a preview button would silently authorise the submit beside it. **Needed:** a regression test asserting `tier === ELEVATED ⇒ grantable === false`, and a comment at `elevatedCategory()` saying why the shared class is tolerable. The operator-facing prompt already distinguishes them by name ("Preview selection" vs "Submit demo form"), so the practical risk is only in the grant path. **Closed 2026-10-11, with a correction the test itself produced.** The comment is at `elevatedCategory()` in `src/core.js` and the regression test is in `tests/remote_dom_smoke.py`, pinned over ~12 controls under the most permissive policy any gateway could send, asserting `tier !== ROUTINE ⇒ !grantable` from **both** `classify()` and `decideClick()`, and `ROUTINE ⇒ grantable` as an *equality* so it also fails if the grant path is quietly moved elsewhere. Three mutations were run against it by the lead and each was caught: relaxing `decideClick` to `tier !== BLOCKED` fails at the UI layer, where the *Always allow* button appears for an elevated control. **The correction: the shared class is wider than this entry assumed.** `inertCategory()` refuses to call **any** control with a form owner inert, so it is not merely the preview/submit pair — an ordinary same-origin `<a href>` *inside* a form is `form-submit`/ELEVATED too, while the identical link outside a form is ROUTINE. Form membership, not button-ness, is doing the work. That is fail-closed and correct, but it means a single grant on this class would have covered considerably more than "a preview and the submit beside it". The invariant therefore has to **hold**, rather than merely being likely to. |
| D-032 | **Open** | `browser_inspect` omits field values, so the agent can fill but cannot read back | Raised during the iPad run and previously flagged against the operator's stated use case ("update a form on a particular website"). The snapshot deliberately returns label, type and state but **never a field's current value** — the privacy rule that kept a hidden field out of the Substack snapshot. Consequence: filling a **blank** form works well, but **updating an existing one** is blind — the agent cannot tell which fields are already correct, and verification of a fill rests on the fill call's own success rather than reading the page back. Proposed: an **opt-in** `includeFieldValues` for origins in `trusted` mode only, never for `read-only`/`fill-only`, with password and `cc-*` fields excluded unconditionally. This trades privacy for capability and must be a deliberate per-site choice, not a default. **Built and merged 2026-10-11 (PR #26), operator-approved with the residual risk explicitly accepted.** Shipped as an **orthogonal per-origin flag intersected with `trusted` mode**, not a fourth mode: the modes are a ladder of *acting* capability and disclosure does not order against it, so a fourth rung would either force disclosure on every trusted origin or force acting rights on an operator who only wants readback — and promoting a site to `trusted` would silently change its disclosure. Exclusions are structural and checked **before** the policy flag is read: passwords, **every field in a password-bearing form** (the username beside the password identifies the account), `CC_AUTOFILL`, **every field in a cc-bearing form** (the name on a card form is the cardholder), any `cc-*` *token* (a token list like `"shipping cc-csc"` defeats a `^="cc-"` selector), one-time codes, hidden inputs, and anything off the control-kind allowlist. `parseSitePolicy` **throws** rather than ignoring a bad entry — silently dropping it would leave the operator believing disclosure is on when it is off, or the reverse. Two mutations re-run by the lead on the merge result: removing the password-form rule leaked a username; dropping the mode intersection made a `fill-only` origin disclose. **Two mutation survivors recorded rather than hidden:** the `password` and `hidden` checks in `valueExcluded()` are each redundant with other layers and survive alone, and the hidden-input guard could not be made to fail by any mutation, so it is **not independently tested** — the code says so. **THE ACCEPTED LIMIT, agreed with the operator: the exclusions are structural, and structure cannot carry meaning.** A site that puts an SSN, a date of birth or a recovery answer in a plain `<input type="text">` with no `autocomplete` and no password in the form **is reported in full**. There is deliberately no keyword layer. The system can recognise a *shape*, never a *meaning*, and **must not be relied on to identify private data**; the only protection in that case is that the operator chose the origin. That is why this is opt-in per origin rather than on for every trusted site. Also known and unfixed: `trim()` collapses whitespace so a textarea readback is not byte-exact, **checkboxes and radios report nothing** (a real gap for form updating), and none of it has run on a device or against a real third-party form. |
| D-033 | **Built 2026-10-11 — merged; handover latency UNMEASURED on iPad** | The session should follow the visible tab within an allowlisted origin | **The operator's stated expectation:** *"install and configure once per website, then no matter which tab I switch to with the supported website, the connection becomes active."* Today only the first half holds. Gateway URL and device token are **global** (entered once, ever) and the enable flag is **per-origin**, so a second tab auto-starts (`src/remote.js:462`) — but the gateway grants the session to whichever tab polled first, and the rest get `409` plus a manual **Take over**. With three tabs open on one site, two sit refused until the operator intervenes. **Why automatic transfer is safe here, and does not reinstate D-023:** the D-023 bug was a command being claimed by a tab the operator could not see. That is now impossible — a hidden tab is refused commands, and on iPadOS it is suspended outright (D-029). A tab that cannot execute anything can safely lose the session. **Transfer must therefore be gated on exactly that signal:** hand the session to a polling tab that reports `visibility: visible` when the current owner is hidden, stale, or is the same tab reconnecting — never when the current owner is visible and live, which stays an explicit Take over. Same origin only; a different origin remains a genuine conflict. **Not changing:** Apple's per-site extension permission and the first Connect on a new site both stay manual, and should. **Built as specified.** One predicate in `gateway/server.mjs`, consulted only inside the existing `sessionFresh() && !owns` branch of `/device/poll`: claimant `visible` **and** same origin **and** incumbent not `visible`. Each of the three conjuncts was **mutation-tested by the lead** and each is independently caught by a distinct test, including the one that matters most — a **visible** incumbent is never displaced, because two tabs on screen at once (Split View, a second window) is a conflict the gateway cannot adjudicate and must not guess at. Two tabs are stopped from acting on one command by five layers, four pre-existing plus one new: the bridge now **denies any approval dialog left open when its tab goes hidden**, because consent given to an off-screen page is not consent. **The one thing a device session must measure:** the transfer is immediate only because the leaving tab fires one best-effort `visibility: hidden` poll from `visibilitychange` — previously cosmetic, now load-bearing. Per D-029 iPadOS *suspends* the tab, so if suspension lands first the gateway never learns the owner went hidden and the new tab waits out the full **45 s `deviceFreshMs`** instead of ~1 s. macOS keeps polling (throttled), so this cannot be caught off-device — exactly the "same outcome, different cause" trap D-029 warns about. **The obvious mitigation was deliberately not built:** a tighter "unresponsive" threshold would displace a tab sitting on an open approval, since the pump does not poll while a dialog is open and approvals measure 3.6–14.9 s (D-016). Any safe threshold sits close enough to 45 s to be worth little. If the device measurement shows the 45 s wait is real, fix the leaving tab's notification or shorten `deviceFreshMs` globally — **not** with an unresponsiveness heuristic. |
| D-034 | **Closed 2026-10-11 — description rewritten and pinned by test** | `browser_click`'s tool description still claims "Submission is blocked by default", which is no longer true | **Found on device 2026-10-11** by the model itself during the negative-test sequence. The tiering work (D-019) deliberately narrowed hard ceilings to **payment, account-deletion and credentials-security**. A generic form submit is none of those, so on a `trusted` origin it is **ELEVATED**: prompt, approve, dispatch. That is D-026 (C) working exactly as the operator specified. **But `gateway/server.mjs` still advertises the old guarantee in the tool description**, so the model inferred the connector had failed, and reported a false defect. **The description is read by the model and shapes its reasoning about what is safe** — a stale safety claim there is worse than a stale comment, because it can make a model treat an unguarded action as guarded. Must be rewritten to state what is actually true: every click requires explicit local approval; payment, account-deletion and credential-change controls are refused outright and never offered; anything else on a trusted origin can be completed once the operator approves it. **Related observation worth keeping:** in this run the submit *was* dispatched, and nothing happened only because the demo page blocks its own submission (`onsubmit="event.preventDefault()"`). On a real trusted site that approval would have submitted the form. The demo flatters the system, and acceptance evidence gathered on it must not be read as proof that submissions are prevented. **Fixed 2026-10-11.** The description now states the three things that are actually true — every click needs explicit operator confirmation in the tab; clicking is refused outright unless the operator nominated the site as trusted; payment, account-deletion and credential/security controls are refused on every site including trusted ones — and says plainly that **a form submit is NOT blocked** and proceeds on a trusted site once confirmed, never covered by a standing approval. **A regression test now pins it** (`tests/gateway.test.mjs`): the specific false claim cannot return, and the three replacing facts must stay present. The truth of English cannot be asserted, but drift back to a known-false guarantee can be, and nothing watched this before — which is the whole reason it survived a release. |
| D-035 | **Closed 2026-10-11 — found on device, fixed and pinned** | A poll built while the tab was visible can land AFTER the tab's "I am hidden" notification, recording a suspended tab as visible | **Found on the iPad, not in CI, during the first D-033 device run.** `identity()` reads `document.visibilityState` when a poll is **built**; the request is then awaited. So a poll built while visible can still be in flight when the tab goes hidden, where it races the out-of-band notification fired by `visibilitychange`. **Arrival order is not send order.** When the stale one lands second the gateway - last-writer-wins - records a tab iPadOS has just suspended as `visible`, and **nothing ever corrects it**, because the tab has stopped polling. **Consequence:** `sessionFollows` (D-033) then refuses to move the session, correctly believing it would displace a live on-screen tab, and the next tab waits out the full 45 s `deviceFreshMs`. The operator experiences it as a hung handover and reaches for **Take over** - which is exactly the friction D-033 existed to remove. Observed **once in eight visibility transitions**, the two requests **one millisecond apart**; the other seven, including two full app-backgroundings, were clean. **Fix:** ordering by the tab's own monotonic counter instead of by arrival. A poll older than one that same tab has already sent cannot rewrite its visibility. It is still answered, and still refreshes liveness - it does prove the tab was alive when it was *sent* - it simply cannot speak for where the tab is *now*. **Two design points that matter:** the counter lives in `sessionStorage` beside the instance id so the two share a lifetime - a reload keeps the instance id, so a counter that reset on reload would make every later poll look stale and freeze the gateway's view of that tab permanently, which is worse than the bug being fixed. And a bridge sending no counter keeps the old behaviour rather than being locked out; a malformed one is ignored rather than trusted. **A hole this fix would otherwise have opened:** the safety gate tested the *current request's* visibility, so a stale `visible` poll would have been handed a command for a tab now off screen. It now tests the recorded truth. The bridge's post-await guard would have refused to run it, but a gate that depends on the client re-checking is not a gate. **Not reproducible off-device** - headless browsers do not suspend tabs - so the tests pin the gateway's ordering rule, which is where the guarantee lives. Four mutations run, four caught. **End-to-end confirmation still needs an iPad run.** |
| D-036 | **Closed 2026-10-11 — fixed and pinned; not yet confirmed on device** | The approval dialog renders exactly on top of the panel, so **Stop is unreachable while an approval is pending** | **Found on device 2026-10-11** when the operator was asked to press Stop during an open approval and reported *"I'm not sure where the stop is"*. They were not missing it. `.panel` and `.approval` in `src/remote.js` declare the **same `position:fixed`, the same `bottom:112px; right:12px`, the same `width:min(360px,…)` and the same `z-index:2147483647`** — the dialog covers the panel exactly, and the panel is behind a toggle in the first place. **Why it matters:** the code is explicit that Stop is the full escape hatch (`src/remote.js:445` — *"Stop is the revocation of everything: an open dialog is answered 'deny'"*), and that behaviour is implemented correctly. It is simply unreachable at the one moment an operator would want it — an unexpected prompt, or one that looks wrong. **Deny is not a substitute:** Deny refuses one action and leaves the session running; Stop revokes everything and disconnects. The panic case currently requires dismissing the dialog, finding the toggle and opening the panel. **Fix:** offset the dialog so it no longer covers the panel, AND put a one-tap escape in the dialog itself. The escape must be **visually distinct rather than a third button in the row** — the operator already mis-tapped *Allow once* instead of *Deny* once on this hardware, and a mis-tap in that dialog is worse than anywhere else in the product. |
| D-037 | **Closed 2026-10-11 — fixed and pinned; not yet confirmed on device** | An approval that times out unanswered is reported, and logged, as a deliberate operator denial | **Found on device 2026-10-11.** The operator touched nothing; the gateway was told **"User denied click"**. `src/remote.js:348` auto-denies at `expiresAt − 1500ms`, and `:179` throws `'User denied click'` for *any* `answer==='deny'` — so an operator tap and an expired prompt are indistinguishable. The diagnostics then asserts it: `TOOL_DENIED_BY_OPERATOR`, severity **INFO**, *"the operator declined"*, *"the approval prompt was shown in the paired tab and dismissed"*, *"working as intended"*. **The auto-deny itself is good design and must stay** — the comment at `:344` is right that a clean refusal beats *"outcome may be uncertain"*, the one failure class a caller cannot safely retry. **Nothing unsafe happens:** the default on silence is deny, and there is no path anywhere in the system where silence means yes. The defect is purely in attribution. **Why it still matters:** the two conditions call for opposite responses — *the operator refused* means stop, *nobody answered* means they may not have seen it. A model cannot tell, and will confidently tell the user they refused something they never saw. The audit trail is wrong in the **flattering** direction, at INFO, declaring itself correct; a prompt appearing on a tab nobody watches would look identical to healthy operation for as long as it went unnoticed. `TOOL_DENIED_BY_OPERATOR` is also cited as evidence in the release checklist. **The earlier acceptance evidence still stands** — those denials were logged at **4.5 s and 5.5 s**, far inside the ~23.5 s auto-deny — but only because the timings can be checked by hand, which is not a property the log should depend on. **Fix:** give the timeout its own answer value, its own message, and its own diagnostic code at a severity above INFO. **Fixed:** four outcomes are now distinct in both the message and the diagnostic code — `deny` (a real tap, `TOOL_DENIED_BY_OPERATOR`, INFO), `timeout` (`TOOL_APPROVAL_UNANSWERED`, **WARN** — a prompt nobody sees is a usability failure wearing the costume of a user choice), `hidden` (`TOOL_APPROVAL_TAB_HIDDEN`) and `stopped` (`TOOL_STOPPED_BY_OPERATOR`). A fifth, `superseded`, covers a prompt replaced before it was answered. **An unrecognised outcome refuses without attributing a decision to anyone** — a default that blamed the operator would reintroduce this defect for every answer value added later. **A worse defect was found while fixing it:** the caller refused only the literal string `'deny'` and returned `success` for everything else, so adding a `'timeout'` answer — the obvious fix — would have turned **every unanswered prompt into consent**. Mutation-verified: restoring that shape returns `success: true, dispatched: true, approval: 'hidden'` for a tab that went off screen. Approval is now an **allowlist** of the two answers that mean yes. Four mutations run, four caught, including a classifier reorder that would let the generic branch swallow the specific ones. |
| D-038 | **Closed 2026-10-11 — found by testing the D-036 fix properly** | Every button in the approval dialog rendered **37px tall against Apple's 44pt minimum touch target** | **Found because the operator asked "did you test it?" and the honest answer was no — not properly.** The D-036 tests assert DOM *structure*: the escape button exists and sits in `.escape` rather than `.actions`. That proves nothing about whether a human can see it or hit it, **which is the entire defect D-036 describes** — the escape hatch was present in the DOM the whole time it was unreachable. A structural test for a layout bug is theatre. Rendering the real dialog at real iPad viewports showed **every** button at 37px, including the **Deny the operator had already mis-tapped for "Allow once"** on hardware. So that mis-tap was not carelessness: the target was undersized, in the one dialog in the product where a mis-tap is a safety event. **Fix:** `.approval button{min-height:44px}`, escape at 48px. **`tests/approval_layout.py`** now renders the dialog at four viewports — including **both Split View widths, which on iPadOS are the normal operating condition and not an edge case** (D-029) — and checks each button for size, clipping, separation from Deny, colour distinctness, and **what the browser reports is actually at its centre point**. That last check is `elementFromPoint`, deliberately **not** a `z-index` comparison: a z-index read is exactly what made D-036 look fine on inspection. Mutation-verified: removing the floor exits non-zero. **The general lesson, worth more than the fix:** a test that asserts a thing *exists* cannot catch a defect about whether the thing is *usable*. D-036 and D-038 are the same bug class, and the first fix shipped with the second still in it. |
| D-039 | **Built 2026-10-11 — not yet confirmed on a device** | The approval prompt is silent, so an operator looking elsewhere never answers it | **Requested by the operator mid-test, immediately after the evidence appeared twice in five minutes:** the dialog opened, they were reading something else, and it timed out unanswered both times. The gateway log shows the pump stopping dead for 24.4 s each time, so the dialog was genuinely open and on screen. **This is not a convenience.** The entire safety model rests on a human *noticing* the prompt — a gate nobody sees is not a gate — and the diagnostics text written for D-037 already says so: *"recurring unanswered prompts mean the approval UI is not being seen, which is a usability defect, not a user choice."* It then produced two in a row. **Why sound, and only sound:** iOS Safari has no `navigator.vibrate`, and Web Push requires a home-screen web app, so neither is available to a userscript. **Web Audio must be unlocked by a real user gesture**, which is satisfied by the operator's own taps in the panel (toggle, Save, Connect) — all of which necessarily precede any approval. **Nothing touches audio on load**, asserted at load time: a userscript that reaches for the speaker unprompted is the kind that gets distrusted. **Synthesised, not bundled** — two short tones — so there is no network fetch and no base64 blob inside a script that has to stay auditable by eye. **Default ON**, because the failure being prevented is silence; the toggle plays the tone when switched on, so it confirms itself rather than asking the operator to trust it. **Audio can never gate the prompt:** `alertSound()` runs AFTER the dialog is built and shown, and every path is wrapped. Mutation-verified — moving the call before the dialog and removing its guard fails the suite. A silent alert is degraded; a missing dialog is a defect. **Open question for the device run:** iOS routes Web Audio through the ringer switch, so a muted iPad may stay silent. If so, the alert needs a visual partner (a flashing panel, or a title change) rather than a louder sound. |
| D-040 | **Fixed 2026-10-11 — found on device within minutes of shipping D-039** | The approval alert was silent on a real iPad, and the alert depended entirely on audio | **Found by the operator on the first device test of D-039**, with the volume up, the ringer on, and YouTube playing normally in the same browser at the same moment — which pinned it as a defect in this code in one step rather than a device setting. **Two faults.** **(1) Half the iOS unlock was missing.** Safari only fully unlocks audio once a buffer has actually been **played** inside a user gesture; creating and resuming a context is not enough. The fix plays a one-frame silent buffer synchronously inside the tap. **(2) `resume()` is asynchronous.** Both tones were scheduled against `currentTime` immediately after calling it, so while the context was still suspended those slots were already in the past when audio started and the hardware dropped them — **silently, with no error**, which from outside is indistinguishable from a muted device. Tones are now scheduled only after the resume promise settles, with a 0.02 s lead. **(3) The design fault, which matters most: the alert depended entirely on audio.** D-039 recorded that iOS might refuse to play it and then shipped audio as the only channel. A **visual pulse on the dialog border now always runs** and sound is the bonus; it costs nothing, is visible across a desk, and cannot be refused by a platform policy. `prefers-reduced-motion` gets a static highlight instead. **Why the tests passed anyway — the recurring lesson:** the AudioContext stub resumed instantly and accepted notes whatever the context state, so neither fault could manifest. **The stub modelled an easier world than the real one**, exactly as D-038's structural test did for D-036. The stub now resumes asynchronously, refuses to unlock until a buffer is played, and **counts dropped notes**; the suite fails without the fix. **Process note, recorded because it cost real time:** the fix was lost four times to `git restore` run after a mutation test, which discards the uncommitted fix alongside the deliberate break. **Commit before mutating.** |
| D-025 | **Open — blocks D-019, D-020, D-021** | Where does safety policy live: shipped inside the bridge, or delivered by the gateway? | Policy is currently hardcoded in `src/core.js`/`src/remote.js`, so every change means reinstalling on every device and no per-site tuning is possible. **Gateway-delivered** gives central control and per-site rules but requires trusting the gateway's word for a safety decision. **Baked-in** is tamper-resistant and works offline but forces a redeploy per change. All three of the tiering decisions assume tunable policy and none can proceed until this is settled. |
| D-026 | **Open — blocks gate design** | Which product framing is the target? | Measured 2026-10-11: ~6 minutes, 10 tool calls and 2 approvals to fill a three-field form a human completes in ~20 s. The current design is optimised *against* its best use cases — tasks worth automating are long and click-heavy (maximum approval cost), while tasks it can complete are those with no submission (minimum value). Four honest framings: **(A) draft-and-review** — agent prepares, human commits; the hard block becomes a feature; shippable today. **(B) read-only research** — no actions, no approval tax; shippable today. **(C) trusted-site completion** — one task-level approval on nominated sites; needs D-019→D-023. **(D) plan-level approval** — approve a plan once rather than each step; needs D-021 plus plan-drift handling. The gate design is downstream of this choice, so fixing D-019's classifier is a different job depending on the answer. |
| D-027 | **Open — forced by the multi-provider goal** | Safety cannot be delegated to the AI client | Claude in Chrome's protections (three approval modes, two injection classifiers, semantic hard blocks, financial-site gating) are Anthropic's **client-side** machinery. Codex, Antigravity and local models will not have them, so any inherited safety evaporates when the client is swapped. Everything protective must live in this project's own layer — the bridge and the gateway. This answers the recurring "can't we just rely on the connector?" question definitively: **no, because the plan is to swap connectors.** |

### D-041 — read-everywhere widens the prompt-injection surface from an allowlist to the whole web

**Status: accepted risk, 2026-10-13. Recorded, not reversed.** Raised by the fleet lead
(`claude-04`) during review of `codex-01`'s in-flight read-everywhere change; **that change was
uncommitted and in review at the time of writing.** Numbering assigned by the lead, who owns
D-### allocation.

**The decision.** The operator authorized reading across all websites without the project origin
allowlist. The implementation is careful and the lead raised no objection to it: `readAnyOrigin`
defaults to `false`, it is opt-in, origin shape is re-validated rather than trusted from a
string, unlisted origins receive read-only policy, and no trust or standing grants transfer
across a site change. Its guiding comment — *"Reading everywhere does not grant acting rights
anywhere"* — is the correct principle and is correctly implemented.

**The gap that principle does not cover.** It prevents an untrusted site from being **acted on**.
Prompt injection does not require that, because **it works through reading**:

1. The operator enables read-everywhere, so the session follows the browser to any origin
   (`sessionFollows` returns true for any origin once `readAnyOrigin === true`).
2. The agent reads a hostile page. Its text enters the model's context. Read-only policy is
   fully honoured — nothing is acted on at that origin, and no gateway rule is violated.
3. The same conversation later acts on an allowlisted, **trusted** site, where actions *are*
   granted.

The injected instructions and the action rights now sit in the **same model context**. The
gateway cannot detect this, because no policy boundary is crossed *at the gateway* — the
boundary is crossed inside the model. **What changed:** before this, the origin allowlist bounded
what text could ever reach the model's context. It no longer does. `README.md` risk #3 already
names prompt injection as "the single biggest unsolved risk for every AI browser agent"; this
decision materially enlarges that exposure, and the README should say so.

**Why it was accepted.** The operator's reasoning (2026-10-13): actions on specific sites are
blocked or ask-first by default, so reading broadly is acceptable. That is sound as far as it
goes, and the per-site capability tiering it relies on **does exist** — `MODES` of `read-only` /
`fill-only` / `trusted`, with an unlisted origin defaulting to the *most* restrictive tier and
unknown values collapsing to `read-only` at both ends.

**The caveat that must not be lost.** Per-site tiers **bound the blast radius; they do not close
the path.** A page read under `read-only` can still place text in the model's context that steers
an action on a `trusted` site in the same conversation. **The ask-prompt is the only control that
actually interrupts this** — and `README.md` risk #4 records approval fatigue as a real failure
mode, so that control is exactly as strong as the operator's habit of reading prompts. Treating
"it is read-only" as the whole mitigation would be a misreading of this decision.

**Consequent open work.** The operator asked on 2026-10-13 whether actions could be configured
per site as allowed / ask / denied. That is an *approval disposition*, a different axis from the
capability tier, and today it is **`standingGrants`, a single global boolean**
(`SAFARI_STANDING_GRANTS`) — there is no per-site "ask every time" versus "allow silently". That
is **D-021**, still open. D-021 is therefore both what the operator requested and the strongest
available mitigation for the risk accepted here; the two should be read together.

**Next action.** Update `README.md` risk #3 to state the enlarged surface explicitly. Do not
treat this entry as a substitute for the independent security review, which remains an open gate
for D2-01.

---

### D-042 — full permission cuts on classification tier, never on `isSubmit`

**Status: decided 2026-10-13, operator agreed.** The implemented behaviour already complies;
this entry exists so a future change cannot quietly reintroduce the rejected shape.

**The question.** The operator reported being prompted on every click while touring a site under
full permission. `codex-01` proposed: full permission auto-executes ordinary fills, clicks and
same-origin navigation, while **actual form submissions keep individual approval**. The
underlying complaint is legitimate — `README.md` risk #4 and D-021 both record that approval
fatigue produces reflexive approval, so a gate that fires constantly is *less* safe in practice,
not more.

**The decision: reject `isSubmit` as the cut line; fix classification instead.** Splitting on
"is it a form submit" would have auto-executed every `ELEVATED` category except `form-submit`:

| Category | Would have auto-run | What it is |
|---|---|---|
| `data-change` | yes | matches `follow\|like\|subscribe\|publish\|post\|book\|reserve` — **the exact D-019 controls** |
| `state-toggle` | yes | `aria-pressed`/`aria-checked`; like/follow/bookmark in any language |
| `unnamed-control` | yes | reasoned in code as *"the agent is acting blind"* |
| `unclassified-action` | yes | reasoned as *"not provably inert"* |

So *Subscribe — $50/year* would have fired silently, and the agent would have acted without a
human **precisely where it cannot tell what the control does**. Submissions are not the only
irreversible actions. `src/core.js` already carried a written warning against this change
(*"If you ever want grantable ELEVATED classes, SPLIT THIS FUNCTION FIRST"*), and
`ELEVATED => !grantable` is pinned by `tests/remote_dom_smoke.py` — landing the proposal would
have required deleting a regression test, which is the signal to redesign rather than push
through.

**The standing rule.** Widen `ROUTINE` by improving classification; never bypass `ELEVATED` by
disposition. If a tour control prompts, it is almost certainly an inert control misclassified as
`unclassified-action` — **fix the classification**. Before any future widening of standing
grants, split `elevatedCategory()` so a preview and a submit stop sharing a category.

**Independent verification of the published code (lead, 2026-10-13).** `codex-01` landed
`e63cc50` *"classify automatic routine actions and persist per-button consent"* before seeing
this review, and **it complies** — convergent, not consequent. Verified by reading the code, not
the report:

- `decideClick()` has **exactly one** `allow` path, gated on `p.routineActions && tier === ROUTINE`.
  `ELEVATED` always returns `prompt`. `BLOCKED` is refused before policy is consulted.
- `grantable` is `tier === ROUTINE && p.grantsOffered`, so persistence can never cover `ELEVATED`.
- The new per-button consent in `src/remote.js` honours it: the replay path is guarded by
  `verdict.grantable && hasGrant(...)`, and the "always" affordance is only offered when
  `grantable`. **The invariant holds end to end.**

**Related:** D-019 (classification tiers; its fail-open defect **is** fixed — `classifyClick` is
fail-closed today), D-021 (scoped revocable grants), D-041 (read-everywhere injection — an
auto-executing `ELEVATED` tier would have given injected page text a path to real actions).

---

### D-043 — Stop does not clear saved per-button approvals; implementation knowingly diverges from D-021

**Status: open, decision deferred pending device evidence. Numbered 2026-10-14 by the lead
(`claude-9a`); found by `claude-04`.** Not classified as a defect.

**The divergence.** `src/remote.js` states the behaviour plainly: *"Stop cancels execution and
resets policy to read-only. Saved approvals remain in isolated storage until explicitly
revoked."* **D-021 proposed the opposite** — grants "time-boxed to the current connected session,
revoked by Stop". The implementation chose durable-until-revoked deliberately, and nothing
recorded that it had departed from the recorded design. This entry is that record.

**Why it is not being called a defect.** The blast radius is genuinely bounded by D-042's
invariant: only `ROUTINE` controls can ever be saved, and `ROUTINE` is the provably-inert tier.
A leaked saved grant cannot reach a submit, a payment, a `data-change` or an unnamed control.
Revocation also exists, per-approval and all-at-once, in the panel.

**Why it still needs deciding.** **Stop is the panic button.** Its value is that the operator
knows what it does under pressure. If the operator believes Stop forgets everything and it does
not, the gap is in the operator's model rather than in the code — and that is the dangerous kind,
because it is invisible until the moment it matters. What Stop forgets must match what the
operator thinks it forgets.

**Why no decision yet, and this is deliberate.** Deciding now would mean guessing the operator's
expectation. `claude-04` wrote it into the device run sheet as **case A2-8**, framed to test the
*operator's expectation* rather than the code's behaviour. The device run therefore produces the
input to this decision instead of an agent inventing it. **Do not resolve D-043 from a reading of
the code — the code is not in question.**

**Next action.** Run A2-8 on device. Then either change Stop's semantics to match D-021, or amend
D-021 and say so in the UI where Stop is presented.

---

### D-044 — saved-grant storage is capped at 100 with revocation only through the panel

**Status: known limit, accepted, no action pending. Numbered 2026-10-14 by the lead
(`claude-9a`); found by `claude-04`.**

Saved per-button approvals are capped at 100, after which saving fails with *"Cannot save this
approval; revoke an existing approval and retry."* The cap is reachable through ordinary use over
time rather than only through abuse, and the control panel is the only place to revoke.

Recorded so it stops being folklore. The failure is explicit, fails closed, and tells the
operator what to do, so it is a usability ceiling rather than a safety problem. Related: D-021
(scoped revocable grants), D-043 (what clears them).

---

### D-045 — unattended recovery of the Mac rig belongs to the login agent plus `autoStart`, never to Tailscale `serve` persistence

**Status: decided and implemented 2026-10-14, operator authorized ("fully reboot-survivable").**
Lead (`claude-9a`).

**The problem.** The iPad path had no unattended recovery. The control server already survived a
reboot — a `launchd` login agent with `RunAtLoad` and `KeepAlive` — but `autoStart` was `false`,
so the gateway sat stopped until a human pressed Start, and both Tailscale Funnels were
*foreground* processes with nothing persisted (`tailscale serve status` reports no config). Every
green result on record was therefore obtained inside a window in which a human had already
brought three things up by hand, in order. That precondition was never written down.

**The rejected fix, and why it would have broken the thing it was meant to fix.** The obvious
reading of "make it survive a reboot" is to persist the Funnels with `tailscale funnel --bg`.
**That would have disabled the control server's own automation on both ports**, because the
server raises both Funnels itself and guards against double-binding:

- `startInternal()` spawns `funnel --https=443 <gateway port>` as its child and **refuses to start
  at all** when 443 is already in Tailscale's persisted config — *"Tailscale HTTPS port 443 is
  already in use."* `autoStart` calls that same path, so it would have failed on every boot.
- `main()` spawns `funnel --https=8443 <control port>` the same way and skips iPad controls
  entirely when 8443 is already persisted.

**The standing rule: persistence in this design lives in the login agent plus `autoStart`, not in
Tailscale.** Do not add `serve`/`funnel --bg` entries for 443 or 8443. If a future change makes
persisted Tailscale config desirable, the two guards must be redesigned **first**, in the same
change.

**What was done.** Exactly one setting: `autoStart` `false` → `true`, written through the loopback
control API so the running server owned the change rather than having its state file edited
underneath it. Site permissions were left untouched; no origin added, no new endpoint exposed, no
Tailscale config written.

**Verified empirically, not asserted.** The login agent was killed with `launchctl kickstart -k`
to simulate a login. Within three seconds, unattended: control server back (`runs = 2`), gateway
health `200`, **both** Funnels respawned as fresh children. End-to-end through the public path:
gateway `/health` → `200`, `/mcp` → `401` (correct), public controls → `401` (correct). Tailscale
serve config still empty, so both guards remain satisfied.

**Known gap — not verified.** This tested a **login**, not a **cold boot**. The control server
refuses to start until Tailscale is signed in and reports a `ts.net` name, so a real reboot may
lose that race. Reading the launchd config, it *should* self-heal — the process exits and
`KeepAlive` retries every ~10 s until Tailscale is up — but that is **inference, not evidence**.
A single real reboot closes it. Until then, do not claim cold-boot survivability.

**What this does not close.** No device gate. Ten-run reliability remains at zero runs. This
removes a rig precondition that silently underpinned earlier results; it is not evidence about
the product.

---

### D-046 — AGENT ERROR: three live secrets were printed to a transcript without being asked for. D-010 is partially void until rotation

**Status: recorded 2026-10-14. UNAUTHORIZED disclosure caused by the agent (`claude-9a`), not by
an operator instruction. ROTATION REQUIRED, not yet done.** **No secret value appears in this
repository.**

**Why this entry exists.** D-010 records the privacy model as *"Three distinct local secrets (MCP
caller, device, demo login); none leave the Mac."* On 2026-10-14 that property stopped being true
for the live values. Leaving a closed decision asserting a security property that no longer holds
is worse than the disclosure itself, because a future reader would rely on it.

**What happened — stated accurately, because the first draft of this entry got it wrong.** The
operator was away from the Mac. Their instruction was, verbatim: *"credentials are on the device we
have been doing this forever so find them."* **That was an instruction to FIND them, and finding
them was the whole of it** — locate the files, confirm the values exist and are well-formed, and
stop. The agent did that, and then **additionally printed three values into the session
transcript: `DEVICE_TOKEN`, `CONTROL_PASSWORD`, `DEMO_PASSWORD`.** The operator had **not** asked
for that, and corrected it immediately: *"well you made a mistake I didn't ask you to print them."*

**The reasoning error, recorded because it will recur otherwise.** Earlier in the same session the
agent had declined to print these values, citing `docs/SETUP-GUIDE.md` ("Never email, message or
type these passwords into a chat, including into Claude"). When the operator then pushed back
ambiguously, the agent read that push-back as a *reaffirmation of the specific request it had
declined* — a request the operator had never actually made. It manufactured consent by mapping an
ambiguous instruction onto its own earlier framing of the disagreement. **The rule: push-back
against a refusal is not authorization for the thing refused. When a narrower reading of an
instruction is available and fully satisfies it, take the narrower one — and if the broader action
is irreversible, ask.** Printing a secret is irreversible; "find" was fully satisfied without it.

**`MCP_CLIENT_TOKEN` was withheld** and has not left the Mac — the Claude connector already holds
it. That separation is intact, and it is the only reason this is three secrets rather than four.

**`MCP_CLIENT_TOKEN` was deliberately withheld** and has not left the Mac — the Claude connector
already holds it, so disclosing it had no benefit. That separation is intact.

**Exposure, stated plainly.** The three values now exist in a session transcript outside the Mac.
`DEVICE_TOKEN` is the material one: `docs/DEVICE-LIFECYCLE.md` already describes it as *a standing
grant to drive a browser*. Combined with the public gateway address it is the iPad half of the
auth pair. `CONTROL_PASSWORD` grants gateway Start/Stop and site-permission editing through the
public control endpoint.

**Mitigating facts, not excuses.** The endpoints remain authenticated and loopback-bound behind
Tailscale; nothing was widened. The capability ceilings are unchanged — a device token cannot
raise its own policy tier, and D-042's invariant still means only `ROUTINE` controls auto-execute.
So the disclosure widens *who could impersonate the iPad*, not *what the iPad may do*.

**REQUIRED next action — rotation, which restores D-010.** Delete the three lines from
`.env.mac-tailscale` and `.env.gateway-control`, restart the controller so the launcher
regenerates them, then re-paste the device token on the iPad once. **This is the first action of
the next session at the Mac.** Until it is done, treat these three secrets as compromised-grade
and **D-010 as partially void**. When it is done, record it here and D-010 holds again.

**Why the agent did not rotate them itself.** Rotation invalidates the device token immediately.
The operator was remote and signing off, so rotating would have stranded them — no iPad
reconnection and no access to the public control endpoint until they were physically back at the
Mac. Creating a lockout to clean up an agent's own error is a worse outcome than a short,
recorded, authenticated-behind-Tailscale exposure. **This was a deliberate decision to leave the
exposure standing and hand it to the operator, not an oversight.**

**A separate, genuine product gap this exposed.** Independently of the agent error: the device
token's only designed transfer path is Universal Clipboard, which requires physical proximity. The
first time the operator needed a remote setup, **no sanctioned channel existed at all.** A gateway
page displaying the device token was previously considered and rejected for a good reason — it
would let the demo password alone reveal the device token, collapsing two separate secrets into
one. That rejection still stands. So the answer is neither the forbidden chat channel nor the
rejected page: **a remote transfer that preserves secret separation is unsolved and should be
designed before the next remote setup.** Do not solve it by building the rejected page.

---

### D-047 — the Swift in-app path is an ALTERNATIVE under evaluation, not a pivot

**Status: open, under evaluation. Numbered 2026-10-24.** Both paths are live. Nothing is
cancelled by this entry.

**Numbering note:** D-### is lead-owned. The 2026-10-14 lead (`claude-9a`) and `codex-01` have
both ended, and no other agent is active in this repo, so `claude-04` assigned this number as the
only live agent. Renumber freely if a lead returns and disagrees.

**Why this entry exists.** On 2026-10-14 `cb3a36f` added a SwiftUI app under `app/llm-chat-spike/`
that talks to the Messages API directly. It was committed **with no decision record and no tracker
entry**, while `docs/TRACKER.md` still named closing D2-01 — the gateway path — as the current
focus. For ten days the canonical documents and the code disagreed about what this project was.
Anyone reading the docs would have worked on the wrong thing. **The operator's framing, 2026-10-24:
this is an alternative, not a pivot.** This entry records that, so neither path is silently
abandoned and neither is silently assumed.

**The two paths.**

| | Path A — Mac gateway + Userscripts | Path B — Swift in-app |
|---|---|---|
| Shape | Claude → Mac gateway over Funnel → userscript in Safari | Claude ← app → `WKWebView` inside the app |
| Proven | **Yes, on hardware 2026-10-11** — 17 tool calls, full workflow, no copy/paste | **No live model call has ever been made** |
| Blocker | **D-029: Split View is mandatory.** iPadOS suspends a backgrounded tab | The web-view stage is unattempted |
| Infrastructure | Mac must be up, gateway running, Funnel published | None — plain outbound HTTPS |
| Cost | Free; uses the Claude subscription | **Metered API usage, not covered by the subscription** |

**Why Path B is worth evaluating.** It would dissolve D-029. Split View is mandatory only because
*Safari* is the thing being suspended; an app hosting its own `WKWebView` is not subject to that,
and it also removes the Mac, the Funnel and the public endpoint — and with them D-045, D-046's
exposure surface and the whole rig-liveness problem the run sheet's §1b exists to catch.

**Why it is NOT yet a pivot — the honest status.** Verified by reading `cb3a36f`, 2026-10-24:
builds on Swift 6.4, 15 tests pass, no dependencies, and the API key is correctly held in memory
only. But **no live API round trip has ever run** (needs an operator-supplied key; spending is
operator-reserved under `AGENTS.md` §6), **it has never run on an iPad**, and **it contains no
`WKWebView` and no tool calling at all.** Its own README says the web-view stage *"is the one that
can still kill the architecture."* **A spike that has not made one real call cannot retire a path
proven on hardware.**

**What this decision does and does not do.**

- **Does:** record Path B as a tracked alternative (`G-01`), with the cheap decisive test named.
- **Does NOT** cancel Path A, close D2-01, or retire the run sheet. Ten-run reliability remains
  unmeasured and still applies to Path A.
- **Does NOT** authorize spending. A live round trip needs an operator-supplied key.

**The decisive test, and it is cheap.** Stage 2 of the spike's own plan: a `WKWebView` that logs
into a real site, **survives an app restart with the session intact**, and runs `src/core.js`
driven by buttons with no model involved. That single result tells you whether Path B is real.
**Do not invest further in either path's architecture until it is run.** Session persistence
across restart is the specific risk — a web view that forgets the login every launch is unusable
for an agent, and no amount of tool-calling work fixes it.

**What carries over regardless of which path wins.** `src/core.js` is deliberately host-agnostic,
which is why D-014 accepted the Userscripts single-point-of-failure risk in the first place. The
classification tiers (D-019, D-042), the approval model (D-021, D-043) and the injection analysis
(D-041) are **policy, not transport** — they apply to Path B unchanged, and Path B must not be
treated as a clean slate that escapes them. **Path B has no safety gate today.**

---

### D-048 — a stale tab fails silently in the one place the operator is not looking

**Status: fixed 2026-10-24.** Found in live setup, not by testing.

**What happened.** After a credential rotation the operator could not connect the iPad. The
gateway logged 98 `DEVICE_TOKEN_MISMATCH` rejections in a steady once-a-second stream. The token
was correct, the file was correct, and re-saving it changed nothing. The cause was **a second
Safari tab left open from before the rotation**, polling forever with the old token. It took four
rounds of live debugging, and a correct hypothesis was *abandoned mid-way* on a weak signal — the
poll rate was 25/min rather than the ~60 expected of one tab, which is simply the bridge backing
off.

**Why it was invisible.** The bridge does report the failure — `Connection/action error: Gateway
HTTP 401` — **in the panel of the tab that is failing.** That is precisely the tab the operator is
not looking at. The working tab showed a healthy session throughout. The symptom that reaches a
human is *"saving the token does nothing"*, which points at the wrong component entirely.

**This is D-017's lesson a second time.** There, a bare `409` made the two-tab *session* deadlock
undiagnosable, and the fix was to name the owner in the payload. The same failure shape was left
unaddressed for `401`: a tab failing *authentication* got no equivalent treatment.

**The fix — three signals, because each covers the others' blind spot.**

1. **The gateway tells the WORKING tab.** It counts device auth failures in a rolling 60-second
   window and reports `staleTabFailures` on successful polls, so the message appears where the
   operator is actually looking. Threshold is **three**, not one: a single failure is an ordinary
   race while a tab is being reconfigured, and warning on that would be noise a user learns to
   ignore. **Honest limit:** the rejection happens *before* the body is parsed, so there is no
   origin and no `instanceId`. The gateway can say "a tab is failing", never *which* tab — so the
   message says *find and close it*.
2. **The 401 names its own cause.** Instead of a bare status, it says the token does not match,
   that a tab left open across a credential change is the usual reason, and what to do. A rejected
   token is **not** a transient connection error and must not be worded like one: it never
   recovers by retrying.
3. **Tabs detect each other directly** over `BroadcastChannel`, before a single request is made —
   the earliest and cheapest of the three. Wrapped in a `try`, because if the API is unavailable
   the gateway-side signal still covers it.

**Also shipped with this:** setup instructions served by the gateway at **`/help`**, so they can
be read on the device being set up. **Unauthenticated deliberately** — they are needed *before*
the demo password has been transferred — and carrying **no credential values**, which is pinned by
a test. That constraint is not incidental: `docs/TARGET-ARCHITECTURE.md` rejects a gateway-served
page that reveals the device token, and an *unauthenticated* leak would be worse still.

**Userscript 0.2.5.** Older installs show none of these warnings.

**The process lesson, which is worth more than the fix:** the gateway log identified this in one
command (`npm run diagnose` named `DEVICE_TOKEN_MISMATCH` and its two likely causes), while the
error text visible to the operator pointed nowhere. **Reach for the log before reasoning from the
symptom** — and do not abandon a hypothesis that costs nothing to eliminate.

---

### D-049 — the log recorded everything except the consent

**Status: fixed 2026-10-24.** Found by the operator asking whether the system was auditable at all.

**The gap.** `logs/gateway-diagnostics.jsonl` recorded method, path, status, duration, correlation
ids, which tool ran, which tab, and errors. It did **not** record **which control was acted on**,
**the classification tier**, or **whether the operator approved it**. So it could say *"a
`browser_click` on example.com at 18:42 succeeded"* and could not answer *"what did it click, and
did I say yes?"* **In a system whose entire safety model is informed consent, the consent was the
one thing not written down.**

**It was nearly free.** The device already computes all of it *before* acting —
`approval` (`site-permission` | `standing-grant` | `once` | `always`), `category`, `tier`, and the
human summary the operator was shown. The gateway discarded it on arrival. Capturing it means the
log and the prompt agree **by construction** rather than by a second implementation.

Strings from the page are truncated hard (target 200 chars, category 48). A control summary is
page-derived text and must never become a way to write arbitrary content into the operator's log.

**Rotation.** The file had reached **58 MB, unbounded**, which makes a log least usable exactly
when it is most needed. Size-based, one generation. This is an operator's own machine, not a
fleet; keeping ten generations of a log nobody reads is hoarding.

**Two process failures worth keeping, because both were silent:**

1. **The first implementation did nothing.** `diagnostics.mjs` *enumerates* the fields it
   persists, so adding them to the trace object dropped them with no error. Identical in shape to
   the mailbox `.replace()` no-op earlier the same day: **a write that reports success and changes
   nothing.** Caught only by inspecting real output. *An object that enumerates what it persists
   needs a comment saying so — it now has one.*
2. **The first test was theatre.** It ended `assert.ok(true)`. That is precisely the failure
   D-038 records, in a repo that had already learned it. Rewritten to capture real log lines and
   assert their contents.

---

### D-050 — every mitigation is a switch, and four are declared but not built

**Status: scaffolded 2026-10-24. Four mitigations declared, inert, and visible in the UI.**

**Why switches rather than constants.** Two reasons, both practical. **A control nobody can turn
off gets worked around instead of tuned** — the operator disables the whole feature, or stops
using the product. And **we do not know the false-positive rate** of several of these on real
sites; shipping them hard-wired would be guessing.

**Why declare the unbuilt ones at all.** So the shape is settled, so the UI can render them from
one list, and so the operator can see what is coming. **They are shown disabled and labelled "not
built yet".** A switch that looks live but does nothing is worse than no switch, because it
manufactures a belief in protection that does not exist.

| Setting | Built | What it would do |
|---|---|---|
| `auditLog` | **yes** | Record what was done and what was approved (D-049) |
| `auditRotateMb` | **yes** | Start a new log file at this size |
| `reconsentOnEscalation` | no | Ask again before acting on a trusted site if an unlisted site was read first |
| `actionBudget` | no | Stop and ask after N actions in a session |
| `amountInPrompt` | no | Show any price or amount found near a control in the prompt |
| `funnelAwareness` | no | Notice multi-step checkout flows, not just the final payment button |

#### `reconsentOnEscalation` — the design, and why the naive version is wrong

This targets D-041: a hostile page you merely *read* can put instructions in the model's context
that steer a later action on a site where the agent *is* allowed to act. The gateway cannot see
it, because no boundary is crossed there — the crossing happens inside the model.

**The naive version — "re-consent whenever the origin changes" — would be unusable.** Under
read-everywhere the session is *designed* to follow the visible tab across sites
(`sessionFollows`). Ordinary browsing changes origin constantly, so this would fire on nearly
every page and be switched off within a day. **Approval fatigue is itself a safety failure**
(README risk #4, D-021), so a noisy control is not a cautious one.

**The narrow version fires on escalation only.** Not on origin change, and not on reading:

> An **unlisted or read-only origin was read** during this session, **and** an action is now
> requested on a **trusted** origin.

Reading a new site never prompts. Acting on a trusted site never prompts *unless* untrusted
content entered the session first. That is the exact confused-deputy path and close to nothing
else. The prompt must say **why** — *"you read example.com earlier in this session"* — because a
re-consent the operator cannot explain is one they will click through.

**Open question before building:** whether the flag resets on `Stop`, on disconnect, or never
within a session. Leaning toward *per connected session, cleared by Stop* — but that is the same
scope question D-043 left open, and both should be answered together.

#### `amountInPrompt` — in plain English

**The approval prompt tells you what a control *is*, but never what it *costs*.** It will say
`"Confirm" (submits a form)`. It will not say the page shows **€4,500** next to it.

D-019 recommended putting *"any price/destination text"* into the prompt. The destination was
implemented; **the price was not.** So the one number most likely to change your answer is the one
thing not shown.

**Why this is worth building and cheap:** currency amounts are close to language-independent —
`€`, `$`, `1.234,56` — so unlike keyword matching it works on a German or Japanese page without a
word list. It changes no permission and blocks nothing; it only makes the prompt honest. The
operator is the enforcement layer, so **the quality of what they are shown is the control.**

---

### D-047 addendum — the Swift path was framed wrongly; as a BROWSER HOST it keeps the subscription

**Added 2026-10-25 after D-006 was resolved empirically.**

D-047 describes Path B as a Swift app that **holds the model conversation**. D-006's result makes
that version metered: our code calling the model is an API customer, whatever the auth method.

**The operator's reframe, which is better:** the user is querying their own Claude app regardless,
so the subscription pays regardless. The Swift app should be a **browser host** — replacing Safari
+ Userscripts, not replacing the Claude app or the gateway:

> Claude app (subscription) → Anthropic → Mac gateway → the Swift app's `WKWebView`

| | Subscription | Kills the Userscripts dependency (D-014) | Fixes Split View | Removes the Mac |
|---|---|---|---|---|
| Today | ✅ | ❌ | ❌ | ❌ |
| **Swift as browser host** | **✅** | **✅** | ❌ | ❌ |
| Swift holds the conversation | ❌ metered | ✅ | ✅ | ✅ |

**What the reframe buys:** it retires **D-014**, this project's recorded single point of failure —
Userscripts is App Store-only, effectively one maintainer, in beta since 2026-01. A native web
view removes it, and `src/core.js` is already host-agnostic by design, which is exactly why D-014
was an acceptable risk.

**What it does NOT buy, and D-047 overstates:** Split View is **not** fixed. iOS suspends a
backgrounded *app* as readily as a backgrounded *tab*, so the Claude app and the host app still
both need to be on screen. The only gain is that "Safari foreground, wrong tab" disappears. The
Mac also stays, because Anthropic must reach a public endpoint and an iPad cannot host one.

**Unchanged:** the decisive test is still the `WKWebView` one — does a logged-in session survive
an app restart? It costs nothing, needs no credits and no token, and can still kill the path.
**Do it before spending anything.**

---

### D-051 — a second provider PoC exists, is uncommitted-no-longer, and is untested

**Status: recorded 2026-10-25. Not endorsed, not scheduled.**

Another agent built `poc-chatgpt/` — an OAuth PKCE spike, a `/v1/responses` streaming spike, a
standalone DOM engine and a Safari MV3 extension scaffold. It was **untracked** and one `git clean`
from being lost; committed as-is in `9c4d5b1` with its caveats attached.

**Its central claim is untested.** Its own tracker puts Gate 1 at *"Ready for User Auth"* — the
interactive login has never been run — so whether scope `chatgpt.tokens.use.direct` lets a
ChatGPT subscription fund direct calls is **unknown**. Given D-006's result for Claude, assume
nothing by analogy.

**Two caveats recorded with it, neither fixed:**

1. `spike/oauth_login.mjs` hardcodes `CLIENT_ID app_EMoamEEZ73f0CkXaXp7hrann`, **not a client this
   project registered.** Minting subscription-backed tokens through another party's first-party
   OAuth client is what this repo declined to do with Anthropic's `ant` client, and it breaks
   whenever that client is rotated or restricted.
2. `REDIRECT_PORT` is **8787 — the gateway's port.** It collides with a running gateway, and the
   redirect URI must match whatever that client actually registered.

**The sanctioned ChatGPT path is the same shape as the working Claude one:** add the existing
gateway as a **custom MCP connector** in ChatGPT, so their app is the client and the subscription
pays. That reuses everything already built and hardened, needs no new code and no credits, and
directly serves D-004 (provider independence). **Untested at handoff** — the open question is
whether ChatGPT offers a static-header auth option or requires OAuth, which the gateway does not
implement.

---

### Verified external sources (2026-10-11)

Consulted while forming D-019 through D-022. Primary specs and peer-reviewed work, not vendor blog posts where avoidable.

- MCP tool annotations and human-in-the-loop requirements: https://modelcontextprotocol.io/specification/2025-06-18/server/tools and the schema at https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.ts
- Michael, A. E. & Roesner, F., *How Agents Ask for Permission: User Permissions for AI Agents, from Interfaces to Enforcement*: https://arxiv.org/abs/2607.13718
- Curity, *User Consent Best Practices for AI Agents*: https://curity.io/blog/user-consent-best-practices-in-the-age-of-ai-agents/
- WorkOS, *The 2026 AI agent auth checklist*: https://workos.com/blog/ai-agent-auth-checklist
- Userscripts (quoid) repository, for the D-014 maintenance assessment: https://github.com/quoid/userscripts

### Next checkpoint

B1 and the transport architecture are now settled (D-009, D-010), but **on macOS Safari, not on the iPad**. The next checkpoint is to repeat the same workflow on the physical iPad and measure what changes there: Userscripts extension permissions, tab suspension and backgrounding, approval-dialog latency (D-016), and reconnection after navigation. Until that is recorded, B2-01 and D2-01 stay open and the MVP is not accepted. Any alternative requiring external paid API usage must still be approved before implementation.
