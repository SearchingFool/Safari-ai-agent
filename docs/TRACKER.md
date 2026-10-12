# Safari AI Agent — Delivery tracker

Updated: 2026-10-11 | This tracker tracks implementation evidence, not ideas.

**Current focus:** Close D2-01. The full workflow and the core negative cases are **evidenced on the physical iPad**: B1-01, B1-02, B2-01, C1-01, C2-01 and D1-01 are closed on device, and **D-032 through D-040 are all fixed and merged**. The two-tab handover is **measured on hardware at 1.26 s** (one poll interval, three for three), network loss mid-command returns a correct *outcome uncertain* and the bridge recovers unaided, and **D-037 is confirmed on device** — an unanswered prompt now reports itself as such instead of as the operator's decision.

**Remaining for D2-01:** **Stop while a command is queued** (unblocked — it was impossible while D-036 left the Stop control covered), same-origin recovery, **ten-run reliability**, and an **independent security review**.

**NOT YET CONFIRMED ON DEVICE — read this before trusting any of it:** D-035 (stale-poll ordering), D-036 (reachable Stop), D-038 (44pt touch targets), D-039/D-040 (audible + visual approval alert). All are pinned by test; none has been touched by a thumb. D-035's race is a ~1-in-8 event that cannot be triggered on demand. **D-040's sound was still unverified at handoff** — the operator's first attempt at D-039 was silent on hardware, which is what produced D-040. The visual pulse means a silent result is now degraded rather than total failure. Do not read demo-page results as proof that submissions are prevented — see D-034.

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
| B2-01 | Foreground iPad outbound transport and lifecycle | **CLOSED on device 2026-10-11** | — | Real iPad, real Userscripts, real Claude app. `/device/poll → 200` with token, allowlisted origin, per-tab `instanceId` and `visibility` all accepted; `browser_status` and `browser_inspect` invoked from Claude on iPad. Suspension behaviour characterised: backgrounding **suspends** the tab, session ages out, page-touching tools fast-fail in 1 ms (D-029) |
| C1-01 | Versioned browser tool contract and errors | **Closed 2026-10-11** | — | Seven tools exercised live; stale-ref reassignment handled correctly across navigation |
| C2-01 | Authenticated MCP gateway/session routing | **Closed 2026-10-11** | B1-01, C1-01 | Public HTTPS tool-call round trip, 2–1191 ms; `check:deployment` reports `transport: PASS` |
| C3-01 | Userscripts transport adapter | **Open — macOS rehearsal only** | B2-01 | Real Userscripts extension paired and polled on macOS Safari; iPadOS runtime unverified |
| C4-01 | **Minimum MVP safety gate**, not full harness | Partially closed | C1-01, C3-01 | Origin allowlist and approval prompts verified live. Submission block and Stop revocation **not yet exercised against the live rig** |
| D1-01 | Model-driven observe/act/verify and navigation recovery | **CLOSED ON DEVICE 2026-10-11** | C2, C3, C4 | 17 tool calls from Claude on iPad: search → navigate → fill text/time/select → preview → verify, no copy/paste, not submitted. Approval latency 3.6/5.5/6.8 s against the 25 s timeout — *faster* than macOS |
| D2-01 | Device acceptance, regression, documented limits | **Partially closed 2026-10-11** | D1-01 | **Done on device:** operator denial refuses the action (twice, incl. a submit); disallowed external navigation refused by the gateway in 0 ms; stale reference refused; session survives refusals; Split View constraint characterised (D-029). **Outstanding:** network loss mid-command, Stop while queued, same-origin recovery, ten-run reliability, security review |
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

**How the iPads actually connect — corrected.** They reach the gateway over the **public internet** through Funnel (`forwardedFor` is a public address), **not** over the tailnet; no iPad is a tailnet member. This matters for decommissioning: the device token keeps working from anywhere, so removing a device from the network does nothing. See [DEVICE-LIFECYCLE.md](DEVICE-LIFECYCLE.md).

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
