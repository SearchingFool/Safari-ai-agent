# Safari AI Agent — Delivery tracker

Updated: 2026-10-11 | This tracker tracks implementation evidence, not ideas.

**Current focus:** Repeat the 2026-10-11 workflow on the **physical iPad**. The Mac + Tailscale Funnel gateway, the Claude remote MCP connector and the full observe/act/verify workflow are now demonstrated live, but **on macOS Safari**. B1-01 is closed; B2-01 and D2-01 remain open and require the actual device. Do not count the macOS rehearsal, synthetic Chromium runs or mock-GM tests as iPad acceptance.

**Authoritative project documents:** [Product requirements](PRODUCT_REQUIREMENTS.md) · [Implementation plan](IMPLEMENTATION_PLAN.md) · [Decision log](DECISIONS.md).

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
| B2-01 | Foreground iPad outbound transport and lifecycle | **Open — macOS rehearsal only** | A-03 | macOS Safari + Userscripts verified 2026-10-11. **iPad** suspend/resume/permission behaviour still unrecorded |
| C1-01 | Versioned browser tool contract and errors | **Closed 2026-10-11** | — | Seven tools exercised live; stale-ref reassignment handled correctly across navigation |
| C2-01 | Authenticated MCP gateway/session routing | **Closed 2026-10-11** | B1-01, C1-01 | Public HTTPS tool-call round trip, 2–1191 ms; `check:deployment` reports `transport: PASS` |
| C3-01 | Userscripts transport adapter | **Open — macOS rehearsal only** | B2-01 | Real Userscripts extension paired and polled on macOS Safari; iPadOS runtime unverified |
| C4-01 | **Minimum MVP safety gate**, not full harness | Partially closed | C1-01, C3-01 | Origin allowlist and approval prompts verified live. Submission block and Stop revocation **not yet exercised against the live rig** |
| D1-01 | Model-driven observe/act/verify and navigation recovery | **Closed on macOS 2026-10-11** | C2, C3, C4 | Full multi-page workflow with no copy/paste: search, navigate, fill text/time/select, click, verify, stop without submitting |
| D2-01 | Device acceptance, regression, documented limits | Open | D1-01 | All MVP release criteria in PRODUCT_REQUIREMENTS met |
| E-01 | **Separate post-MVP governance harness** | Deferred | MVP acceptance | Independently specified policy and capability-lease milestone |
| F-01 | Additional provider adapters and native packaging | Future | MVP acceptance | Independently verified adapters and Safari packaging |

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

- Tailscale already installed on the user's Mac and iPad; no Verpex server is required for the initial test.
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

## 2026-10-11 test-suite determinism correction

- **Source-of-truth shift:** the recorded "13/13 Node tests pass" was not reproducible. Measured on this Mac, the suite failed **roughly half of all runs**, alternating between `Device origin, token, result id, and replay protection` and `Allowed action schema, origin scope, stale device and concurrency`. CI had been passing on timing luck, so the green checkmark on PRs #6–#8 was weaker evidence than it appeared.
- **Cause (test defect, not product defect):** `/device/poll` answers immediately with `command:null` when the queue is empty — it is not a long poll. The tests started a `tools/call` without awaiting it and then polled once, racing the gateway's registration of the pending command. The shipped bridge is unaffected: `src/remote.js` re-polls every 1200ms against a 25s command timeout and treats an empty answer as the ordinary idle case.
- **Fix:** `tests/gateway.test.mjs` now re-polls like the real bridge via an `awaitCommand` helper, and un-awaited in-flight calls get a no-op rejection handler so a teardown rejection can no longer mask the real assertion failure. No gateway or userscript behavior was changed.
- **Evidence:** 25/25 consecutive `node --test tests/gateway.test.mjs` runs clean; 5/5 consecutive `npm run check` runs at **14/14** (2 build + 12 gateway); 3/3 Chromium suites pass.
- **Also fixed:** `npm run test:browser` invoked `python`, which does not exist on a stock macOS (only `python3`), so the documented local browser check could not run on the Mac that will host the Funnel test. Now uses `python3`; CI is unaffected.
- **Discipline change:** do not record a test-count claim in this repo from a single run. State the repeat count alongside the result, as the entries above now do.
- **Unchanged:** this is engineering hygiene only. B1-01, B2-01 and D2-01 remain open and still require the real Claude account and physical iPad. Do not read a green suite as acceptance.
