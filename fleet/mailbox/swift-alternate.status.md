# Status — the `swift-alternate` seat (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/swift-alternate.status.md` (repo-relative; public repository)
**Description:** Newest-first reports from the Swift alternate application workstream.
**Author:** Codex (safari-ai-agent lead session, 2026-11-09)
**Created:** 2026-11-09
**Last Updated:** 2026-11-10
**Last Updated By:** Codex (safari-ai-agent lead session)

> **Ordering: newest first.** Every worker entry must include its occupant and assignment floor.

## 2026-11-10 — safari-ai-agent-90e45e (Codex) — complete local simulator command flow passed

**Floor:** `2026-11-09-swift-alternate-01`.
**Commit:** `2ecfe1d test: complete Swift simulator approval flow`.
**Delivered:** Fixed approval panel accessibility IDs so the Allow/Deny buttons retain their own identifiers. Changed fixture UI waits to async polling so XCTest does not block the main actor that sends gateway calls. Increased test command timeout, retained local Xcode result/log artifacts on test runs, added redacted fixture request/poll correlation, and fixed empty-filter argument handling in the shell runner. Reconciled README and design evidence.
**Verified:** Full iPad Simulator UI suite passed 2/2: disconnected/local read-only inspection; and trusted HTTPS fixture pairing, Keychain token storage, remote inspect, approved fill plus verification, denied click, approved click plus verification, approved same-origin navigation plus verification, and confirmed gateway revocation on disconnect. Swift protocol package tests passed 6/6. iOS Simulator and macOS app builds succeeded. Fixture tokens/page were synthetic and local; no pilot gateway was contacted. The full Node and browser gates had passed earlier in this session; gateway core was not changed.
**Human acceptance remaining:** Install with the developer signing account on an actual iPad; test the intended private/VPN route with one pilot user and their own gateway settings; exercise wrong token, gateway 409/allowlist refusal, policy change, cancellation, redirect, and app background/resume cases; review signing, provisioning, packaging, and distribution. Do not expose the gateway publicly. Passkey and Split View limits remain D-053 and D-029.
**Simulator:** Existing operator iPad Pro simulator was preserved and updated with the latest passing build. It is open at the disconnected start screen; load a URL, then choose **Inspect locally** for local testing. No user credentials or pilot page were installed there.
**Worktree:** User-owned Xcode team setting, workspace, and `xcuserdata` remain excluded from commits. No push performed.

## 2026-11-10 — safari-ai-agent-90e45e (Codex) — traced the missing approval to an unclaimed fill command

**Floor:** `2026-11-09-swift-alternate-01`.
**Commit:** `c5200e1 debug: trace Swift gateway command processing`.
**Changed:** Added safe stage status labels before fill-command validation, fresh isolated-world inspection, policy evaluation, and approval preparation. These messages exclude page content and fill values.
**Measured:** The isolated iPad simulator passes pairing and remote inspection. In the next fixture run, the test queued `browser_fill`, but the app stayed at its ordinary connected status; none of the stage messages or approval controls appeared in the accessibility hierarchy. The gateway timed out the unclaimed command at 25 seconds. macOS and iOS builds succeeded earlier this turn; the six protocol tests pass. This points to a poll/session delivery issue after inspection, rather than a SwiftUI approval rendering issue, and still needs a root cause. The XCUITest result bundle and complete hierarchy are at `/tmp/SafariAIAgentSwiftBridgeFixture.BphDyJ/TestResults.xcresult`.
**Still needed:** Determine why the active app no longer claims the next command after remote inspect. Then pass fill approval/dispatch, click allow/deny, same-origin navigation, and disconnect in the fixture; cover policy/lifecycle/error cases before pilot use. No pilot gateway or credential was used.
**Simulator:** Existing operator iPad Pro simulator remains intact and booted with the current iOS build open. It is ready for browser/local-inspection testing; remote actions remain blocked on the fixture defect.
**Worktree:** User-owned Xcode project team setting, workspace, and `xcuserdata` remain excluded. No push performed.

## 2026-11-10 — safari-ai-agent-90e45e (Codex) — approval-flow diagnosis and simulator handoff

**Floor:** `2026-11-09-swift-alternate-01`.
**Reservations:** approval-flow token `48095d6af3de4b67beb264469f669eae`; test-runner diagnostics token `28f5fca7218c48c38eb24cc4e5113084`. Release both after commits.
**Commit:** `0726276 test: expose Swift approval bridge diagnostics`.
**Changed:** Simplified the approval panel to render directly from the model's published pending-approval state; made the gateway UI test print full accessibility hierarchy on failure and made the runner emit Xcode test diagnostics with an `.xcresult` bundle. Reconciled the README and design record with what the fixture measured.
**Measured:** `swift test --package-path app/browser-host` passed 6/6 protocol tests. macOS Debug build succeeded using `/tmp/SafariAIAgent-macOS-final`. Three iPad simulator fixture attempts passed HTTPS pairing, Keychain token storage, page load, gateway polling/result, and remote inspection. The latest failure hierarchy shows the app connected on the fixture page but with no approval controls in its accessibility tree. The queued fill timed out at the gateway; no fill/click/navigation was dispatched. The attempt did not reach those follow-up checks. Existing full Node and browser suites passed earlier in this session (85/85 and all browser tests); no gateway core changes were made.
**Still needed:** Fix why `pendingApproval` does not render during the pending fill and get the fixture test to pass allow/deny, fill/click/navigation, and disconnect. Then run actual iPad acceptance, wrong-token/allowlist and lifecycle cases, pilot route, signing, and distribution. Do not use the Swift path for pilot actions until the fixture approval path passes. No pilot endpoint or credential was used.
**Simulator:** The operator's existing iPad Pro 13-inch M5 simulator was not deleted or reset. It remains booted; install/launch the latest build before handoff and leave it on the browser page.
**Worktree:** User-owned Xcode project team setting, workspace, and `xcuserdata` remain excluded from commits. No push performed.

## 2026-11-10 — safari-ai-agent-90e45e (Codex) — autonomous Swift app completion and simulator bridge test

**Floor:** `2026-11-09-swift-alternate-01`.
**Commits:** `e550939 feat: present Swift approvals as native prompts`; `889ab39 test: add local Swift gateway bridge fixture`; earlier in this work `18d6c66 fix: scope browser host package tests to protocol suite`.
**Reservations:** implementation/design token `53fa906964b147ce85b662cf1e1558ce` and fixture/README token `eeb88123edbe4c89bf0ed6bb16f48fb6` remain active while this status is finalized; release both after commit.
**Delivered:** Added a disposable local HTTPS gateway and harmless page fixture that use test-only tokens, trust a temporary certificate only in a temporary simulator, build with simulator signing so Keychain works, and clean up their simulator and fixture process. Added accessibility identifiers and focus dismissal to the browser controls, made approval a native SwiftUI alert (rendered as a sheet by the iPad simulator), and improved status text for approval-pending/unavailable conditions. Updated the README and design record with measured behavior and setup.
**Verified:** `npm run check` (85/85), `npm run test:browser` (all listed browser/gateway/approval layout checks), `npm run diagnose` (exit 0), Swift package tests (6/6), macOS Debug build, fixture `node --check` and runner `bash -n`. The isolated simulator connected over HTTPS, paired through Keychain, loaded its harmless page, exchanged gateway poll/result messages, and completed remote inspect. The native approval sheet appeared during fill. No test reached the allow/deny control: XCUITest's accessibility query did not reliably target the iPad system sheet and the gateway timed out safely; fill/click dispatch and disconnect are therefore NOT claimed as verified.
**Still needed:** A stable UI automation path or a human simulator run to select Allow once and Deny, then verify fill, click, and disconnect; incorrect token and allowlist checks; physical iPad install/session lifecycle; signing/distribution and actual pilot route. No pilot endpoint or credential was used. Passkey and Split View limits remain D-053 and D-029.
**Worktree:** User-owned `project.pbxproj` signing-team edit, Xcode workspace, and `xcuserdata` remain uncommitted and were excluded from these commits. No push performed.

## 2026-11-09 — safari-ai-agent-90e45e (Codex subagent) — inspect-only bridge attempt complete

**Floor:** `2026-11-09-swift-alternate-01`.
**Reservations:** implementation tokens `73e4ff4d8c2545bfa9bc5a885768b04c` and
`9d14bda1970c4526be5062b1632c6b3d` released; final status edit token
`914d997364b84d43bbeedf323befeca4` will be released immediately after this entry.
**Delivered:** Added `app/browser-host/SafariAIAgentHost.xcodeproj` with shared-source macOS/iOS
app targets, shared SwiftUI browser UI/model, credential-free HTTP(S) navigation validation,
named isolated-world `src/core.js` injection, local Inspect UI, host-scoped WebKit data clearing,
HTTPS gateway setup, Keychain device-token storage, active-scene polling, and a hard remote
allowlist for `browser_inspect`. Inspect polling forces read-only/no-field-values policy; all
other delivered actions return unsupported errors without page dispatch. Sheets/clear-data
confirmation pause polling and mark the app hidden. Inspection checks the page origin before and
after its async engine call and immediately before result submission. Gateway redirects are
limited to the configured origin. `browser_status` is gateway/MCP-side; the app presents local
connection state. Added README/design evidence and setup guidance. No package manifest, gateway,
or extension code changed.
**Verified:** Latest macOS and iOS Simulator Xcode Debug builds succeeded with signing disabled.
iPad Pro simulator installed and launched the app; screenshot shows pairing controls and browser
UI, but no page was loaded and no gateway was contacted. Bundled `core.js` SHA-256 in both
products matched source (`d91d3f08414bef573f5d63f59679595e1481b439c66ac1098ff1b64286816eed`).
`swift test` passed 15/15 existing package tests (chat core only). `npm run check` passed 85/85
Node tests and syntax/build checks. `npm run test:browser` passed its Chromium, gateway, and
approval-layout checks. `npm run diagnose` returned its documented no-log exit 2 because
`logs/gateway-diagnostics.jsonl` is absent.
**Not claimed:** Isolated-world execution or snapshot result in WKWebView, gateway auth/reachability,
poll/result exchange, Keychain round trip, hidden-sheet lifecycle or navigation-race behavior at
runtime, physical iPad installation/use, password session persistence, signing, or passkey
support. The current bridge is compile-verified only and must not be treated as ready for a pilot.
Before use, test gateway auth failures, allowlist rejection, poll claims and exact result binding,
unsupported commands, stale sequence ordering, same-origin redirects, and lifecycle races against
a local gateway fixture, then perform physical iPad acceptance over the intended private/VPN
route. The endpoint `/device/poll` claims arbitrary queued commands; it is not a status-only
endpoint. Never dispatch fill/click/navigation without an on-device approval model. Third-party
WKWebView passkey failure (D-053) and iPadOS suspension/Split View limit (D-029) remain explicit.

## 2026-11-09 — seat created — awaiting worker occupancy

The operator authorized the `swift-alternate` seat for `app/**` and
`docs/SWIFT-APP-DESIGN.md`. Assignment `2026-11-09-swift-alternate-01` requires a macOS and iOS
browser-host app review and implementation attempt. No worker writes are recorded yet.
