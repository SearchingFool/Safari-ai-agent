# Safari AI Agent — Delivery tracker

Updated: 2026-10-24 | This tracker tracks implementation evidence, not ideas. Last updated by Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04, D-047).

## 2026-10-14 — Safari AI Agent testing: pending owner actions

**Product under test: Safari AI Agent.** Go Madeira was only an optional ordinary-navigation smoke-test target, not the product being tested. Formal acceptance uses the project demo pages and the [device run sheet](IPAD-DEVICE-RUN-SHEET.md), maintained by the lead. Today's navigation instructions have no reported result.

**Owner actions, in order:** confirm the installed Remote AI panel shows **0.2.4**; keep Safari/Claude visible together and connect; ask Claude to call **browser_status** and confirm a connected device before testing. Then follow demo-page **Part A2**, beginning with full-permission routine navigation. Report the selected control, visible result and prompt source (Claude or Remote AI). Continue with incremental guidance through Ask denial/approval, actual submission confirmation, saved approval persistence/isolation/revocation, Stop while queued and recovery. Finally complete the ten-run protocol, recording each result and timing. Local health is not end-to-end pre-flight. Instructions issued are not completed tests; owner alone accepts D2-01.

| Device case | Evidence in this session | Pending |
|---|---|---|
| Connector read | Owner reported a page read and another site's read-only behavior | Limited owner-observed success, not reliability measurement |
| Controls sign-in / Start | Owner reported successful sign-in and Start | Controlled Stop/Start recovery |
| 0.2.4 full-permission navigation | Instructions issued; no result | Part A2 device run |
| Ask denial/approval and submission boundary | Automated checks passed; no controlled device result | Part A2 device run |
| Saved approval persistence/isolation/revocation | Automated checks passed; no device result | Part A2 device run |
| Stop while queued / same-origin recovery | No controlled device evidence | Formal device cases |
| Ten-run reliability | **0 formal runs recorded** | Entire protocol; no percentage claimed |
| D-035 / D-036 / D-038 / D-039 / D-040 | No targeted confirmation attributable to this session | Each remains unconfirmed here; historical D-039 failure is not a retest |
| Private Mac app | Owner reported login page opens only | Test cancelled and cleaned up; not product acceptance |

Assignment 09 bodies received: Claude-04 confirms D-042 independent review and the proposed work split. P1–P3 implementation waits for P0 ten-run results unless owner changes sequencing; new enhancements still require approval. Read Claude-04 handover to Claude-9a and notified both inboxes. Mailbox delivery is not acknowledgment. Owner requires tracker/fleet updates after every change, including testing instructions and observed results.

## 2026-10-13 — Enhancement planning and installer follow-up

Private-site test discontinued at owner's request: application dependencies make this test unsuitable. Removed the scoped private Serve mapping and released its device registry reservation. Verified the test mapping is absent and existing gateway/control mappings remain. Initial login-page reachability remains historical evidence only; no post-login acceptance claimed. No further setup for this application planned.

Private-site device checkpoint: owner reports the test login page opens on the iPad; no post-login navigation tested yet. This establishes initial device reachability only. Owner requested descriptive addressing. Named Tailscale Services provide application-specific HTTPS names but require a tagged service host and tailnet administration; path prefixes are another option with application compatibility constraints. No addressing change approved or applied.

Owner requested an explicit work division with the Claude agent and clear plans before new implementation. [Package plans](plans/ENHANCEMENTS-2026-10-13.md) and [discovery steps](plans/enhancement-discovery-2026-10-13.yaml) are **draft for owner approval**. Codex proposed markup/source, search/scroll and visible-feedback modules; Claude proposed screenshot/local-file/provider/background feasibility, device acceptance and review. Peer inbox notified; acknowledgment and ownership confirmation pending. No new enhancement implementation has started.

Installer issue: owner reported Failed to fetch after opening the authenticated script page. Device mirror showed source 0.2.4 loaded; subsequent requests received HTTP 401. Control install link changed to the existing published raw GitHub artifact, whose bytes matched the local build. The authenticated local development route remains protected. **81/81 Node and all five browser suites passed**; owner-side successful installation not yet reported. This operational fix is separate from the unapproved enhancement packages.

Private-site follow-up: owner authorized testing an existing Mac website through private Tailscale Serve without changing the application, and required device port registration first. Checked the canonical device registry, OS listeners and existing Serve mappings before allocation. Registry changes published in ai-dev-dotfiles commit c55678f, including previously missing gateway/control reservations. Mac-side verification passed: HTTPS login page and JavaScript asset returned successfully, the test endpoint had no Funnel entry, and existing gateway health passed. Dedicated HTTPS entry points preserve application root paths and separate permission origins; frontend and backend port numbers need not match. iPad reachability and connector inspection remain pending. Claude reaches the public MCP gateway while paired Safari reads the private page with iPad Tailscale enabled. This test does not establish direct file/document support.

## 2026-10-13 — Approved categories and persistent button approvals

Owner approved the category matrix: full permission automatically executes recognised same-site navigation and page interactions, while default Ask requests individual approval and submissions/data changes/unclear actions continue to ask. Implemented gateway `routineActions` policy for managed controls/CLI and independently checked in the DOM engine. Legacy direct gateway callers retain explicit opt-in behavior. Actual form submits are distinct from non-submit controls; known links/disclosures/tabs/menus/tour-step structures are routine, generic button labels alone are not proof. Payment/account-deletion/credential ceilings remain enforced. Remote prompts name the action type; control modal and model descriptions reflect the categories. Remote script **0.2.4** required.

Owner also requested Always allow persist for the particular button. Saved approvals now use isolated Userscripts GM storage and exact origin/page/control identity rather than a session action-category grant. Reload/reconnect/Stop preserve preferences; current policy/classification still gate use. Distinct or changed controls do not inherit consent, ambiguous controls cannot persist, and the panel supports individual/all revocation. Post-acknowledgement click recheck verifies target identity/category and current permission before dispatch. **Verification: 81/81 Node tests, all five browser suites pass**, including a fresh bridge loading a saved approval, distinct/changed button isolation, three automatic tour steps, unclear/submit prompts and invalid-button-type submission classification. Category help/modal/narrow layout checked in Chromium. Public example's navigation links classified as automatic under full permission without performing live clicks. No device-acceptance gate closed; install script 0.2.4 and test actual iPad navigation/reload/revocation next.

New capability requests: **F5-01 screenshot capture** and **F6-01 rendered HTML/CSS/JavaScript inspection**. Current browser_inspect returns bounded text and controls, not full DOM, source or an image. [Userscripts API documentation](https://github.com/quoid/userscripts/blob/main/README.md#api) lists no screenshot capture API; automatic image capture needs a separate platform/provider feasibility proposal. No screenshot/source export implementation approved or begun. Owner can manually attach a screenshot to the provider in the interim. Rendering page markup into an image would be an approximation rather than proof of actual iPad pixels.

## 2026-10-13 — Ask default and permission usability update

Owner explicitly requested replacing the unlisted-site action refusal with **Ask every time**, explaining permission choices in a modal, editing existing entries directly, and accepting addresses without an HTTPS prefix. Implemented explicit `ask` mode: reads allowed; fills/clicks/same-origin navigation require individual Safari approval; standing grants and existing field-value disclosure disabled. Explicit Read only, Fill and navigate, and trusted entries retain their previous behavior. Managed controls and CLI use ask as the default; legacy `createGateway` callers keep read-only unless opting in. Old scripts fail closed on unknown ask mode; install remote script **0.2.3**.

Control UI now has per-row permission dropdowns, a description modal, and Website/Local web server address choices. Saving automatically restarts a managed gateway; a controller restart is required to load this code update. Direct file URLs remain unsupported and appear as a disabled choice; owner clarification on iPad HTML vs Mac files vs documents is pending. Local HTTP page injection added to script metadata; hardware acceptance remains open. Actual visible Safari actions already provide headed operation; read/target highlighting would be a separate feature.

Navigation investigation: logs confirmed `Destination not allowed`. Live status showed the saved action entry and connected tab had different origins, which correctly left the connected tab read-only under the old default. A separate gateway validation flaw rejected same-origin navigation from unlisted paired sites; fixed by admitting the current authenticated origin while retaining cross-origin restrictions. Owner's exact requested destination remains pending, so the live refusal is not attributed solely to that flaw.

Verification: full Node gate **80/80**, all **five browser suites pass**, and UI Chromium check passed permission editing/save, modal open/Escape, hostname normalization, local HTTP input, file refusal and narrow layout. Browser gate confirms denied ask-mode fill leaves the field unchanged, approved fill executes, and Always allow is absent. Navigation error handling reviewed: deterministic refusals surface through existing correlated diagnostics; destination errors now explain same-site restrictions. Device acceptance requires the new script and gateway code; no acceptance gate closed.

Follow-up approval investigation: owner reported prompts despite choosing the most permissive mode and allowing connector tools. Inspection confirmed the configured origin and effective gateway mode matched as trusted, with successful Claude fills, clicks and same-site navigation. No fallback-to-ask defect evidenced. Trusted mode still prompts for clicks/navigation unless a routine category has a session-scoped standing grant; submissions always prompt. Provider tool approval and Safari local approval are separate. A persistent per-site Allow/Ask/Deny disposition remains a distinct design question requiring owner approval; no such implementation started. Exact prompt/action has not yet been identified. Stale-element and cross-site destination refusals also appeared and are separate from permission prompts.

### Proposal history — superseded by the approved categories above

Owner clarified that Remote AI asks on every click while progressing through a site tour despite full site permission. Current core intentionally prompts on every trusted click unless covered by a routine-category standing grant. Only structural same-origin links, disclosures and tab selection are routine; generic buttons are elevated and cannot receive standing approval. The exact tour-control classification is not present in diagnostic logs, so it must be inspected rather than assumed.

Proposed behavior: unlisted sites stay Ask every time; explicit full permission automatically executes ordinary fills, clicks and same-origin navigation. Actual form submissions retain individual approval, and payment/account-deletion/credential-security controls remain blocked. Implementation must distinguish submit controls from non-submit controls before changing approval disposition, retain Stop/revocation, update the labels/modal/model tool descriptions, and test a multi-step tour plus denial/submission boundaries in full Node/browser gates and on device. Full permission would authorize ordinary actions without a per-action human check. No behavior change made for this proposal; owner approval required before implementation.

## 2026-10-13 — UI controls, read-everywhere and provider research

Owner authorized Mac/iPad gateway controls, GUI website permissions, and reading across websites without a project allowlist restriction. Owner has paid ChatGPT/Gemini subscriptions and both native apps on iPad. **Future implementation plans require explicit owner approval.**

| ID | State | Evidence / next acceptance |
|---|---|---|
| UI-01 | Implemented, owner acceptance pending | Separate authenticated control server; Start/Stop, persistent site action modes, login-service installer/remover, automatic gateway startup option, sleep prevention, protected local script-install link. Native Mac Safari auth/add/save verified. Managed lifecycle and CSRF/auth/ownership tested over real HTTP; Funnel and caffeinate are mocked in lifecycle tests. Actual LaunchAgent/public 8443 forwarding and iPad UI remain to test. See [test instructions](GATEWAY-CONTROLS.md) |
| READ-01 | Implemented, iPad acceptance pending | Authenticated unlisted HTTP(S) origins can inspect/verify with read-only policy; fills/clicks/navigation do not inherit rights. Foreground session can follow a new website after the old one becomes hidden. Updated script supports connect-across-websites and global Stop opt-out. Node/Chromium gates pass; install script 0.2.2 from the local gateway before hardware testing |
| F2-01 | **Ready to attempt — no code required** | **Connect the EXISTING gateway to ChatGPT as a custom MCP connector.** Same shape as the working Claude path, so the subscription pays and nothing new is built. **Steps:** add a custom MCP server in ChatGPT; URL = the gateway's `/mcp`; authenticate with the same `Authorization: Bearer <MCP_CLIENT_TOKEN>` used for Claude. **Known risk:** ChatGPT documents OAuth / no auth / mixed, and its "static credentials" appear in an OAuth context — a plain custom header may not be offered. **If only OAuth is available, STOP:** the gateway implements no OAuth server, and that is a scoped piece of work, not a workaround. **Never select "no auth".** [Research](PROVIDER-IPAD-RESEARCH.md) |
| F3-01 | **Blocked on eligibility — check before attempting** | **Connect the EXISTING gateway to Gemini as a Connected App.** Same shape again. **Check eligibility FIRST:** the official article gates this to English, US adults, personal accounts, with Keep Activity on — the operator is in Europe, so this may simply be unavailable and that is the cheapest thing to discover. Register in the web app, then use from mobile. Auth compatibility with a fixed bearer header is unverified. **Do not change region or work around eligibility.** [Research](PROVIDER-IPAD-RESEARCH.md) |
| F4-01 | Capability review requested; no implementation plan approved | Owner asked about searching webpages. Existing tools can inspect captured page text, verify a text substring, and drive a website search form via fill/click/verify when site permissions permit. Dedicated in-page find, result extraction, scrolling/pagination and cross-page/web search need separate capability evaluation; do not infer a generic web-search tool already exists |

Verification: `npm run check` **79/79 pass**, zero failures; `npm run test:browser` all **five** suites pass. The script-install route and failed-spawn Stop behavior are pinned by the Node gate, and global Stop/auto-connect are pinned by the browser gate. New control UI verified in real Mac Safari. No new public control endpoint or login agent installed during development; the existing live Terminal rig was preserved. Owner instructed incremental commits and pushes to main/GitHub on 2026-10-13; publication is recorded in git history. Physical device acceptance remains pending.

Claude second-account connection confirmed live 2026-10-13 17:31:08 Prague: `browser_status` HTTP 200 from Claude, matching the iPad screen. Earlier wrong base URL was corrected to `/mcp`. Claude still first tries protocol `2026-07-28`, then retries successfully with `2025-11-25`; D-015 remains a compatibility follow-up, not a proven DNS failure.

Peer coordination: codex-01 joined the fleet on the owner's explicit instruction, acknowledges claude-04's collaborative lead role, and has exchanged scope/findings through the shared mailbox. Lead owns registry confirmation and integration; codex-01 owns this completed change. Proposed next work: owner acceptance first, peer review, then an account-specific ChatGPT/Gemini feasibility plan for approval. No provider implementation is underway. The read-everywhere prompt-injection trade-off is documented in README; lead will own any decision numbering.

**TWO PATHS ARE LIVE (2026-10-24, D-047).** This tracker described only the gateway path for ten
days after a Swift alternative was committed, so read this before planning anything:

- **Path A — Mac gateway + Userscripts.** Everything below. **Proven on hardware**; limited by
  **D-029, Split View is mandatory.** Still the only path that has ever driven a real page.
- **Path B — Swift in-app (`G-01`, `app/llm-chat-spike/`).** Would dissolve D-029 and remove the
  Mac, the Funnel and the public endpoint entirely. **A spike only: no live model call has ever
  been made, it has never run on an iPad, and it has no web view.**

**Path B is an alternative, not a pivot — operator's framing. Neither path is cancelled.** The
cheap decisive test is G-01's web-view stage; until it runs, do not retire Path A or scale up
Path B.

**⚠ BEFORE RESTARTING THE RIG: rotate `DEVICE_TOKEN`, `CONTROL_PASSWORD` and `DEMO_PASSWORD`**
(D-046, outstanding since 2026-10-14). The rig is deliberately shut down and the login agent
disabled, which is what keeps this contained. Nothing leaked publicly — verified.

**2026-10-24 — D-048 fixed, found in live setup.** A tab left open across a credential rotation
polled with a stale token once a second and reported it only in its own panel, so the working tab
looked healthy while nothing connected. Three warnings added (gateway tells the working tab; the
401 names its cause; tabs detect each other), plus gateway-served instructions at **`/help`** —
unauthenticated by design, no credential values, pinned by test. **Userscript 0.2.5; older installs
show none of it.** Gate: 83/83. `gateway/demo-pages.mjs` added to the syntax gate, which had never
covered it.

## 2026-10-25 — Audit logging, safety toggles, docs for newcomers, and D-006 resolved empirically

**Shipped (all gated at 84/84 Node, five browser suites unchanged):**

- **D-048** stale-tab warnings + gateway-served instructions at `/help`. Found in live setup: a tab
  left open across a credential rotation polled with the old token once a second and reported it
  only in its own panel — the tab nobody was looking at. Three signals added; `/help` is
  unauthenticated by design and carries no credentials, pinned by test. **Userscript 0.2.5.**
- **D-049** the log recorded everything except the **consent**. It could say a click happened and
  succeeded but not what was clicked or whether the operator approved it. Now records action,
  target, tier, category and approval. Rotation added — the file had reached **58 MB unbounded**.
- **D-050** every mitigation is a **toggle** in the control panel; four are declared, inert and
  labelled "not built yet" (`reconsentOnEscalation`, `actionBudget`, `amountInPrompt`,
  `funnelAwareness`). Records why the naive re-consent design is wrong.
- **UI** `fill-only` renamed. "Fill and navigate — no clicks" promised navigation would be silent;
  it prompts every time. Found by the operator hitting exactly that on github.com.
- **Docs** three labelled procedures (install / first website / update), a first-website
  walkthrough on **neutral public sites**, Part 5 updating (there was no upgrade documentation at
  all), an architecture + data-flow doc drawn from observed traffic, and Part 4 reframing the
  controls as safety tools.
- **Disclosure sweep** removed the operator's hosting provider, home paths (29 across 16 files),
  device addresses, hostnames and network prefixes. **HEAD only — not history.**

**D-006 RESOLVED for Claude, empirically.** A Claude subscription does **not** fund direct
Messages API calls. Same OAuth token: `/v1/models` → 200, `/v1/messages` → 400 "credit balance too
low", twice. **Auth works; inference is unfunded.** The rule: the subscription pays when *their*
app calls *your* server; *your* code calling *their* model is metered. See D-006, D-047 addendum.

**Corrections made to this tracker and others during the session** — recorded because each was
believed and wrong: the iPad/tailnet claim was inverted (it *is* a member); `DEVICE-LIFECYCLE`'s
decommissioning conclusion was right for the wrong reason and survives; the setup guide's repo
path had been "corrected" into one that breaks for every newcomer; and the README stated 0.2.5
was required for full permission when 0.2.4 is.

**Not done, and not started:** the `WKWebView` session-persistence test — still the only thing
that can kill the Swift path, still free, still unrun.

****Provider independence (D-004) is now cheap and should be tried.** `F2-01` (ChatGPT) and `F3-01`
(Gemini) need **no new code**: the existing gateway is already an MCP server, and the rule proven
on 2026-10-25 is that **the subscription pays when their app is the client calling your server**.
So connecting another provider's app to the same gateway reuses everything built and hardened, and
costs nothing. **The userscript bridge is provider-agnostic** — it never talks to a model, only to
the gateway — so no device-side change is needed either. The open question for both is
**authentication**, not capability: whether either accepts a fixed bearer header the way Claude's
connector does.

**Current focus (Path A):** Close D2-01. The full workflow and the core negative cases are **evidenced on the physical iPad**: B1-01, B1-02, B2-01, C1-01, C2-01 and D1-01 are closed on device, and **D-032 through D-040 are all fixed and merged**. The two-tab handover is **measured on hardware at 1.26 s** (one poll interval, three for three), network loss mid-command returns a correct *outcome uncertain* and the bridge recovers unaided, and **D-037 is confirmed on device** — an unanswered prompt now reports itself as such instead of as the operator's decision.

**Remaining for D2-01:** **Stop while a command is queued** (unblocked — it was impossible while D-036 left the Stop control covered), same-origin recovery, **ten-run reliability**, and an **independent security review**.

**NOT YET CONFIRMED ON DEVICE — read this before trusting any of it:** D-035 (stale-poll ordering), D-036 (reachable Stop), D-038 (44pt touch targets), D-039/D-040 (audible + visual approval alert). All are pinned by test; none has been touched by a thumb. D-035's race is a ~1-in-8 event that cannot be triggered on demand. **D-040's sound was still unverified at handoff** — the operator's first attempt at D-039 was silent on hardware, which is what produced D-040. The visual pulse means a silent result is now degraded rather than total failure. Do not read demo-page results as proof that submissions are prevented — see D-034.

**Authoritative project documents:** [Product requirements](PRODUCT_REQUIREMENTS.md) · [Implementation plan](IMPLEMENTATION_PLAN.md) · [Decision log](DECISIONS.md).

## 2026-10-13 — Updated-script device checkpoint

Owner reported completing control sign-in and Start, seeing the Remote AI bridge live in the Safari tab, and successfully reading that page through Claude on the iPad. This records the first owner-observed read with the updated controls/script; it does **not** close UI-01, READ-01 or D2-01. Next: repeat the read after manually switching to a second website without adding a site entry. Control Stop/Start from iPad, login/reboot recovery and the remaining device run-sheet cases still require acceptance.

Follow-up: owner tested a second website, Google, and reported that the connector correctly allowed reading only. This is owner-observed evidence for READ-01 across websites with read-only permissions; the exact attempted action/error was not captured, so it is not a complete negative-action regression. Next guided control test: Stop and Start from the iPad, then repeat a page read. Broader reliability and device acceptance gates remain open.

## Versions and release meaning

- **0.1.1 — Manual browser-action prototype:** implemented and merged; unit/Chromium tests passed. User reports that form manipulation seems to work on iPad; complete iPad regression evidence has not yet been recorded.
- **End-to-end MVP — Not implemented:** AI client -> supported tool integration/MCP -> iPad Safari DOM executor -> verified result, through a real multi-page workflow.
- **Post-MVP — General governance harness:** configurable policy, approval profiles, capability leases, budgets, detailed audit and extensive adversarial protections. **Not implemented and intentionally outside initial MVP**, while basic authorization/approvals for any remote execution remain mandatory.

## Delivery milestones

| ID | Work package | State | Blocking dependency | Exit evidence |
|---|---|---|---|---|
| A-01 | Page snapshots, references and actions | Done in 0.1.1 | None | Existing merged code and Chromium tests |
| A-02 | Time inputs and field constraints | Done in 0.1.1 | A-01 | Browser regression tests; user retest recommended |
| A-03 | iPad Safari acceptance checklist | Partially observed, open | A-01/A-02 | Recorded inspect/fill/click/navigate/permission tests on actual iPad |
| B1-01 | Supported AI-client custom-tool/MCP feasibility | **Closed 2026-10-11** | None | Live Claude custom remote MCP connector: `initialize`, `tools/list` and 10 `tools/call` round trips, all HTTP 200. See 2026-10-11 entry |
| B1-02 | Subscription entitlement, terms and costs | **Closed 2026-10-11** | B1-01 | Existing Claude subscription, static bearer header accepted; no API billing incurred; Funnel adds no cost |
| B2-01 | Foreground iPad outbound transport and lifecycle | **CLOSED on device 2026-10-11** | — | Real iPad, real Userscripts, real Claude app. `/device/poll → 200` with token, allowlisted origin, per-tab `instanceId` and `visibility` all accepted; `browser_status` and `browser_inspect` invoked from Claude on iPad. Suspension behaviour characterised: backgrounding **suspends** the tab, session ages out, page-touching tools fast-fail in 1 ms (D-029) |
| C1-01 | Versioned browser tool contract and errors | **Closed 2026-10-11** | — | Seven tools exercised live; stale-ref reassignment handled correctly across navigation |
| C2-01 | Authenticated MCP gateway/session routing | **Closed 2026-10-11** | B1-01, C1-01 | Public HTTPS tool-call round trip, 2–1191 ms; `check:deployment` reports `transport: PASS` |
| C3-01 | Userscripts transport adapter | **Open — macOS rehearsal only** | B2-01 | Real Userscripts extension paired and polled on macOS Safari; iPadOS runtime unverified |
| C4-01 | **Minimum MVP safety gate**, not full harness | Partially closed | C1-01, C3-01 | Origin allowlist and approval prompts verified live. Submission block and Stop revocation **not yet exercised against the live rig** |
| D1-01 | Model-driven observe/act/verify and navigation recovery | **CLOSED ON DEVICE 2026-10-11** | C2, C3, C4 | 17 tool calls from Claude on iPad: search → navigate → fill text/time/select → preview → verify, no copy/paste, not submitted. Approval latency 3.6/5.5/6.8 s against the 25 s timeout — *faster* than macOS |
| D2-01 | Device acceptance, regression, documented limits | **Partially closed 2026-10-11** | D1-01 | **Done on device:** operator denial refuses the action (twice, incl. a submit); disallowed external navigation refused by the gateway in 0 ms; stale reference refused; session survives refusals; Split View constraint characterised (D-029). **Outstanding:** network loss mid-command, Stop while queued, same-origin recovery, ten-run reliability, security review |
| E-01 | **Separate post-MVP governance harness** | Deferred | MVP acceptance | Independently specified policy and capability-lease milestone |
| F-01 | Additional provider adapters and native packaging | Future | MVP acceptance | Independently verified adapters and Safari packaging |
| **G-01** | **Swift in-app path (ALTERNATIVE to the gateway, not a replacement)** | **Spike only — never run live** | None; runs in parallel with A–D | Builds, 15 tests pass (`cb3a36f`). **No live model call ever made, never run on iPad, contains no `WKWebView` and no tool calling.** Next and decisive: a `WKWebView` that logs into a real site, **survives an app restart**, and runs `src/core.js` from buttons with no model involved. See [D-047](DECISIONS.md) |

## Current blockers and decisions to close

1. ~~Is a supported custom MCP/tool caller available?~~ **Closed 2026-10-11:** yes — Claude custom remote MCP connector with a static `Authorization: Bearer` header.
2. ~~Is a secure remotely reachable gateway required, and what does it cost?~~ **Closed 2026-10-11:** required, and free — Tailscale Funnel over a loopback-bound gateway.
3. What can a foreground Userscripts page reliably send/receive across navigation and Safari suspension? **Still open.** macOS Safari handled navigation and ref reassignment correctly; iPadOS suspension and backgrounding are untested.
4. **New:** does human approval latency fit the command timeout on iPad? Measured 3.2–14.9 s on Mac against a 25 s timeout (D-016).
5. **New:** should the MCP protocol target move from `2025-11-25`? Claude requested `2026-07-28` (D-015).

If B1 fails, record a decision and seek approval for one alternative: supported API billing, a different tool client, an optional Mac-hosted agent, or an adjusted requirement. **Do not quietly redefine the MVP as manual copy/paste.**

## Development discipline

Each implementation PR must identify FR IDs, work-package IDs, expected acceptance, performed tests, and affected decisions. Keep at most one current critical-path priority while pursuing genuinely independent parallel tests. Research only to close documented blockers.

## Preserved historical task mapping

Original `M1-1`–`M1-6` work is covered by A-01/A-02/A-03. Former `M2-1`–`M2-4` map to B2/C1/C2/C3 and future packaging. Former `M3-1`–`M3-4` map to B1 and D1. Original `M2-G1`–`M2-G4` described early governance ideas; the basic mandatory authorization controls are now C4 while the **configurable full harness is E-01 after MVP**, reflecting the user's scope decision. Former `M4` adversarial and recovery work is split between MVP C4/D2 acceptance and later E hardening.

## Known limits (existing 0.1.1)

- No external command listener or provider integration exists today.
- Snapshot collects bounded page text (potentially sensitive) but omits input values; this does not make it safe to send to an unapproved service.
- Element references can go stale; synthetic clicks may fail on protected/complex controls.
- Safari website permissions and foreground execution constrain actions. Chromium success is not proof of iPad Safari behavior.
- Apple Developer membership and native WebExtension packaging are deferred.

## 2026-10-09 B1–D implementation evidence

- **Implemented:** MCP gateway, authenticated single-device command queue, allowlisted origins, command timeout/cancellation/replay rejection, seven browser tools, remote Userscripts script using isolated GM APIs, explicit site opt-in, confirmation prompts, block of consequential clicks, same-origin navigation with dispatch-only acknowledgement.
- **Passed locally:** `npm run check` (10 automated gateway/build tests) and Chromium manual/remote smoke suites (the remote test uses a mock GM API); no extra inference API billing.
- **Still blocked:** public HTTPS gateway deployment, actual Claude custom connector authentication/entitlement, iPad GM network/permission/lifecycle proof, live multi-page AI task, external security audit and ten-run reliability measurements.
- **Supporting details:** [MCP_INTEGRATION.md](MCP_INTEGRATION.md), [B1_D_STATUS.md](B1_D_STATUS.md).
- **Release decision:** **not ready for end-to-end iPad user acceptance**; do not tag the AI MVP as released.

## 2026-10-09 additional B1–D hardening and acceptance evidence

- Implemented explicit /device/disconnect server-side revocation on Stop, MCP transport protocol/content-type validation, a public inert two-page /demo workflow, Docker gateway packaging and a non-destructive HTTPS MCP deployment checker.
- Automated local validation: ~~**13/13 Node tests pass**~~ — **superseded 2026-10-11, see below**; this was one lucky run of a flaky suite. 3 Chromium suites pass, including a real authenticated MCP HTTP-to-DOM roundtrip using a mocked GM transport.
- GitHub CI now runs a separate Playwright browser-integration job, including a true navigated two-page scenario where CI permits networking. CI results must be checked before merge.
- Actual iPad Claude connection, public HTTPS deployment, device-specific lifecycle and ten-run reliability **remain blocked on external account/device access**. Do not mark D2 accepted.
- Release evidence and prerequisites: [B1_D_STATUS.md](B1_D_STATUS.md), [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## Mac test deployment pathway (2026-10-09)

- Tailscale already installed on the user's Mac and iPad; no separately hosted server is required for the initial test.
- Mac launcher and [instructions](MAC_TAILSCALE_TEST.md) are committed. It binds the gateway to localhost, generates separate local secrets and uses Tailscale Funnel to expose HTTPS for remote MCP.
- Actual Mac launch, public HTTPS endpoint, Claude account connector and device acceptance are **not yet completed**. Do not mark B1/D2 as accepted until demonstrated.

## 2026-10-11 LIVE RUN — Claude connector and full workflow on macOS Safari

**First end-to-end execution with a real AI client driving a real browser.** All timings from `logs/gateway-diagnostics.jsonl`.

**Deployment.** Mac launcher + Tailscale Funnel; gateway bound to `127.0.0.1:8787`, public HTTPS at the operator's `https://<mac>.ts.net` Funnel address (hostname deliberately not recorded here — this repository is public, and naming a live endpoint invites probing even though both entrances are authenticated). Public reachability confirmed by forcing resolution to a Tailscale ingress IP, bypassing MagicDNS — an earlier in-tailnet curl had **not** proven this. `npm run check:deployment` → `transport: PASS`, 7 tools.

**B1 — Claude connector (closed).** Three failed attempts all sent `Authorization` of length 25: the literal placeholder `Bearer <MCP_CLIENT_TOKEN>` from the setup docs, never substituted. The connector had no edit affordance, so it was deleted and re-created with the real 71-character value. Handshake then succeeded: `initialize` → 200, `notifications/initialized` → 202, `tools/list` → 200. **Claude's connector does support static header auth on this account.**

**D1 — workflow (closed on macOS).** 10 `tools/call` round trips, **all HTTP 200**:

| Tool | ms | Note |
|---|---|---|
| `browser_status` | 2 | `connected: true`, origin matched allowlist |
| `browser_inspect` | 159 | hidden `never-share-me` field correctly omitted |
| `browser_fill` | 169 | search term |
| `browser_click` | 14915 | **approval dialog wait** |
| `browser_inspect` | 607 | confirmed navigation to `/demo/product` |
| `browser_fill` ×3 | 528 / 841 / 1027 | text, time, select |
| `browser_click` | 3227 | **approval dialog wait** |
| `browser_inspect` | 1191 | verified `Preview ready` |

Search → navigate → fill text/time/select → click → verify, with **no copy/paste of tool calls**, stopping without submitting. Click returned `dispatched: true, verified: false` and the client re-inspected rather than assuming success — the navigation-uncertainty contract behaved as designed. Element refs were reassigned across navigation and the client used the new snapshot.

**Device bridge.** Real Userscripts extension on **macOS Safari** (not iPad), polling `/device/poll` ~1/s, every response `DEVICE_OK`, origin matching the allowlist exactly.

**Findings recorded as decisions:** D-015 (Claude requested MCP protocol `2026-07-28`; gateway advertises `2025-11-25`, returned 400, client renegotiated). D-016 (approval latency 3.2–14.9 s against a 25 s timeout — the worst case used 60% of the budget). D-014 (Userscripts is App Store-only, effectively single-maintainer, in beta since 2026-01 — a single point of failure for the iPad path).

**Live negative tests (same session).** **Submission block passed:** `browser_click` on the submit control was refused in 424 ms with "High-impact control blocked: form submission", **no approval dialog offered**, form not submitted. The command reached the device and the *bridge* refused it at the point of execution — defence in depth, not merely a gateway-side check. **Stop revocation passed:** polling ceased, `/device/disconnect` returned 200, and `browser_status` then reported `connected: false` with `generation` incremented by `cancelAll()` — server-side revocation, not a paused poller. **Stale references passed** implicitly: refs were reassigned across navigation and the client used the fresh snapshot.

**NOT established.** This was **macOS Safari, not the iPad**. No iPadOS extension runtime, tab suspension, backgrounding or device-specific permission behaviour was exercised. Still untested: denied click approval, disallowed external navigation, app suspension, network loss, Stop while a command is queued, same-origin recovery, ten-run reliability, security review. **B2-01 and D2-01 remain open; the MVP is not accepted.**

## 2026-10-11 FIRST iPAD DEVICE SESSION — B2-01 and D1-01 closed

**The two gates that blocked this project from the first commit are now closed on real hardware.** Claude on an iPad drove a real Safari tab through the gateway. All timings from `logs/gateway-diagnostics.jsonl`.

**Connection.** `/device/poll → 200` with device token, allowlisted origin, per-tab `instanceId` and `visibility` all accepted — the session-identity work (D-023) running on the actual target device.

**Workflow (D1-01).** 17 tool calls: search → navigate → fill text/time/select → preview → verify. No copy/paste. Not submitted.

**Approval latency (closes D-016 favourably).** iPad: **3.6 / 5.5 / 6.8 s** against the 25 s timeout — *faster* than macOS (3.2–14.9 s). Worst case 27 % of budget vs 60 %. The timeout is not under pressure on touch.

**Negative cases proven on device.** Operator denial refuses the action — verified twice, including on a **submit** (`TOOL_DENIED_BY_OPERATOR`, 5.5 s and 4.5 s). Disallowed external navigation refused by the **gateway in 0 ms** before reaching the device. Stale reference refused by the bridge. Session survived three consecutive refusals. Three different layers each refusing what they own.

**A first attempt mis-tapped "Allow once" instead of "Deny"**, which produced a false alarm. Re-run with an actual denial gave the correct refusal. Recording this because the dialog's three buttons are easy to mis-hit on touch.

**D-029, a hard platform constraint.** `browser_inspect` refused in **1 ms** with Safari backgrounded, succeeded in 1398 ms with it visible. Two distinct refusals occur: *"No active iPad Safari device"* (iPadOS **suspends** the tab; session ages out of the 45 s window) and *"The paired Safari tab is not visible"* (visibility gate, on shorter backgrounding). **macOS differs** — a hidden tab keeps polling, throttled. **Split View is mandatory** on iPadOS; no code change and no native extension lifts it.

**D-034, a defect this session exposed.** There is **no blanket submit ceiling any more** — hard ceilings are payment, account-deletion and credentials-security only, so a generic submit on a `trusted` origin is ELEVATED: prompt, approve, dispatch. That is D-026 (C) as specified. **But `browser_click` still advertises "Submission is blocked by default".** The model read that, saw a submit dispatch, and reported a connector failure — correctly. **The submit WAS dispatched;** nothing happened only because the demo page blocks itself with `preventDefault`. On a real trusted site that approval would have submitted. **Demo-page evidence must not be read as proof that submissions are prevented.**

**Still outstanding for D2-01:** network loss mid-command, Stop while queued, same-origin recovery, ten-run reliability, independent security review.

## 2026-10-11 second iPad session — D-033 confirmed on hardware, D-035 found

Measured on the **iPad Pro** (the M4 was excluded: it is being set up for another person, so neither the device token nor the tailnet belongs on it).

- **Warm tab switch: 1.25 / 1.27 / 1.27 s — three for three.** Exactly one poll interval. Every switch went claimant-refused-409 → incumbent reports hidden → claimant served. **The gateway never displaced a visible tab**, observed in the wild rather than argued from code.
- **The D-033 risk does not materialise.** The leaving tab's best-effort `hidden` poll — previously cosmetic, now load-bearing — **reached the gateway before iPadOS suspended the tab**, on tab switches *and* on two full app-backgroundings. The 45 s slow path was never taken. This is the one thing macOS could never have told us (D-029).
- **Resume from suspension is instant.** After 143 s suspended, the tab was served on its **first** poll back. No re-pairing, no stale-session wait.
- **Cold start of a new tab: 14.3 s** (page load + script boot + connect). Real, not a defect.
- **While backgrounded:** `browser_inspect` refused in **54 ms** with an accurate message — not the 25 s "outcome uncertain" timeout, which is the failure mode that actually hurts.
- **D-035 found** — a stale poll can record a suspended tab as visible, blocking the automatic handover and forcing a manual Take over. **Once in eight transitions, one millisecond apart.** See D-035. Fixed and pinned; **end-to-end confirmation still needs an iPad run.**

**D2-01 negative cases, continued.** **Network loss mid-command: PASS.** Command claimed by the device, Airplane Mode on before answering, no result ever returned — the gateway reported *"timed out; action outcome may be uncertain"* after 24.9 s. It did **not** invent a success and did **not** claim a definite failure. **The bridge also recovers on its own:** polling resumed with the same instance id once the network returned, so a dropped connection does not require re-pairing. **Stop-while-queued: NOT TESTED** — see D-036, Stop was physically unreachable.

**Two defects from that one test.** **D-036:** the approval dialog and the panel declare identical position, width and `z-index`, so **Stop is covered exactly when it is wanted**. **D-037:** an approval that times out unanswered reports itself as *"User denied click"* and is logged `TOOL_DENIED_BY_OPERATOR` at INFO, *"working as intended"* — an operator decision that never happened. Behaviour is correct (silence denies); the attribution is not.

**Defaults audit, verified not recalled.** Every default is fail-closed and **there is no path where silence means yes**: unanswered prompt → deny; `decideClick` returns only `prompt` or `refuse`, **never `allow`**; unrecognised control → ELEVATED; unlisted origin → read-only; malformed or hostile policy → read-only; hidden tab → no command delivered; hard ceilings → refused everywhere; stale poll → cannot resurrect `visible`. The single `decision: 'allow'` in `src/core.js` is `decideFill`, which is reversible and cannot submit.

**How the iPads actually connect — ~~corrected~~ RE-CORRECTED 2026-10-24.** The claim below was wrong and is kept only to show what changed.

~~They reach the gateway over the public internet through Funnel, not over the tailnet; no iPad is a tailnet member.~~

**The truth, from `tailscale status` and the gateway's own request log:** the iPad **is** a tailnet member and its `/device/poll` requests arrive from a **tailnet** address. The public requests are Anthropic's, hitting `/mcp` as `Claude-User`. The original note likely read a single `forwardedFor` from an Anthropic request and generalised it to the iPads.

**The decommissioning conclusion was right for the wrong reason, and still holds:** the Funnel publishes the gateway to the public internet regardless of tailnet membership, so a departing device's token keeps working from anywhere. **Removing a device from the tailnet revokes nothing; rotating `DEVICE_TOKEN` does.** See [DEVICE-LIFECYCLE.md](DEVICE-LIFECYCLE.md) and [ARCHITECTURE-DATAFLOW.md](ARCHITECTURE-DATAFLOW.md).

**Also learned the hard way:** `tailscale funnel status` prints *"No serve config"* while a **foreground** serve session is still holding port 443 — it is **not** a sufficient "am I exposed?" check. Use `tailscale serve status --json`. And Universal Clipboard silently does nothing across different Apple IDs.

**Methodology note.** The handover was *unmeasurable* until `deviceInstance`/`deviceVisibility` were added to the poll log an hour earlier — without them every poll looks alike and this would have been an argument about whether the operator "waited long enough". **The operator's report that it had hung was correct and the obvious explanation was wrong.** Two defects (D-034, D-035) have now been found by device testing that no off-device suite could have produced; treat that as the standing argument for more device runs, not fewer.

## 2026-10-11 (late) D-036 to D-040 — four defects the earlier tests could not have caught

All four came out of the operator asking **"did you test it?"** about D-036, where the honest answer was *not properly*.

- **D-036** — `.panel` and `.approval` declared the same position, width and `z-index`, so **Stop was physically covered** at exactly the moment it is wanted. The operator could not find it; they were not missing it. Deny refuses one action, Stop revokes everything — not substitutes. The dialog now carries its own escape in a separate row.
- **D-037, confirmed on device** — an approval that timed out reported `User denied click` and logged `TOOL_DENIED_BY_OPERATOR` at INFO, *"working as intended"*. The operator touched nothing. Five outcomes are now distinct in message **and** code; `TOOL_APPROVAL_UNANSWERED` is **warn**, because a prompt nobody sees is a usability failure wearing the costume of a user choice.
- **A fail-open found while fixing D-037, worse than either:** the caller refused only the literal string `'deny'` and returned success for anything else, so adding a `'timeout'` answer — the obvious fix — would have turned **every unanswered prompt into consent**. Mutation-verified. Approval is now an allowlist of the two answers that mean yes.
- **D-038** — rendering the dialog at real iPad viewports showed **every button 37px against the 44pt minimum**, including the Deny the operator had already mis-tapped. The mis-tap was not carelessness. `tests/approval_layout.py` now measures geometry at four viewports, using `elementFromPoint` rather than a `z-index` read — a z-index read is what made D-036 look fine on inspection.
- **D-039 / D-040** — the operator asked for an audible alert after two prompts timed out unanswered within five minutes. The first version was **silent on hardware** with the volume up and the ringer on while YouTube played in the same browser: half the iOS unlock was missing (Safari needs a buffer actually *played* inside a gesture), and the tones were scheduled before the async `resume()` settled, so the hardware dropped them without error. **The design error underneath was worse:** D-039 recorded that iOS might refuse to play the sound and then shipped sound as the only channel. The dialog border now always pulses; audio is the bonus.

**The pattern worth carrying forward.** Three times in one day a test passed while the defect shipped, always the same way: **the test modelled an easier world than the real one.** A structural assertion for a layout bug (D-036/D-038); an AudioContext stub that resumed instantly and accepted notes whatever the state (D-039/D-040). A test built from one's own mental model of a platform reproduces one's own misunderstanding of it. Where the platform is the risk, **measure the rendered/real behaviour**, not the code's intent.

**Process note that cost the most time:** a fix was lost **four times** to `git restore` run after a mutation test, which discards the uncommitted fix alongside the deliberate break. **Commit before mutating.**

## 2026-10-11 D-033 and D-034 closed; a latent test hole found and fixed

- **D-034 fixed and pinned.** `browser_click`'s description no longer claims submits are blocked. A regression test in `tests/gateway.test.mjs` asserts the specific false claim cannot return and that the three replacing facts stay present. Mutation-verified: restoring the old string fails the gate.
- **D-033 built and merged.** One predicate in `gateway/server.mjs`; all three of its conjuncts mutation-tested by the lead and each independently caught. A **visible** incumbent is never displaced — Split View is precisely the case that stays a manual Take over.
- **D-031 closed, and the invariant is wider than D-031 recorded.** `inertCategory()` refuses to call any control with a form owner inert, so an ordinary same-origin `<a href>` *inside* a form is ELEVATED too; the identical link outside one is ROUTINE. Form membership does the work, not button-ness. Fail-closed and correct, but a single grant on this class would have covered more than "a preview and the submit beside it". Corrected in D-031.
- **A latent hole in `tests/remote_browser_e2e.py`.** Its mock GM bridge used `urllib.request.urlopen`, which **raises** on non-200, so a `409 DEVICE_SESSION_CONFLICT` — an ordinary answer the bridge is built to read and explain — never reached the bridge. Every multi-tab path was untestable in the integrated suite, which is why D-017/D-023 multi-tab behaviour had only ever been exercised against a mock. Status and body now pass through.
- **Gate now:** `npm run check` **59** Node tests (was 52), 0 fail; `npm run test:browser` **4** suites, **18** PASS lines (was 15). Build output verified deterministic (`git diff --exit-code` clean after rebuild).
- **Methodology note worth keeping:** every claim above was re-verified by the lead on the **merge result**, not read from the worker's report, and the safety-critical ones were mutation-tested — break the guard deliberately, confirm the gate goes red. Four separate mutations, four catches.

## 2026-10-11 test-suite determinism correction

- **Source-of-truth shift:** the recorded "13/13 Node tests pass" was not reproducible. Measured on this Mac, the suite failed **roughly half of all runs**, alternating between `Device origin, token, result id, and replay protection` and `Allowed action schema, origin scope, stale device and concurrency`. CI had been passing on timing luck, so the green checkmark on PRs #6–#8 was weaker evidence than it appeared.
- **Cause (test defect, not product defect):** `/device/poll` answers immediately with `command:null` when the queue is empty — it is not a long poll. The tests started a `tools/call` without awaiting it and then polled once, racing the gateway's registration of the pending command. The shipped bridge is unaffected: `src/remote.js` re-polls every 1200ms against a 25s command timeout and treats an empty answer as the ordinary idle case.
- **Fix:** `tests/gateway.test.mjs` now re-polls like the real bridge via an `awaitCommand` helper, and un-awaited in-flight calls get a no-op rejection handler so a teardown rejection can no longer mask the real assertion failure. No gateway or userscript behavior was changed.
- **Evidence:** 25/25 consecutive `node --test tests/gateway.test.mjs` runs clean; 5/5 consecutive `npm run check` runs at **14/14** (2 build + 12 gateway); 3/3 Chromium suites pass.
- **Also fixed:** `npm run test:browser` invoked `python`, which does not exist on a stock macOS (only `python3`), so the documented local browser check could not run on the Mac that will host the Funnel test. Now uses `python3`; CI is unaffected.
- **Discipline change:** do not record a test-count claim in this repo from a single run. State the repeat count alongside the result, as the entries above now do.
- **Unchanged:** this is engineering hygiene only. B1-01, B2-01 and D2-01 remain open and still require the real Claude account and physical iPad. Do not read a green suite as acceptance.
