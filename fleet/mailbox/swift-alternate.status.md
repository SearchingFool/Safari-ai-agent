# Status — the `swift-alternate` seat (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/swift-alternate.status.md` (repo-relative; public repository)
**Description:** Newest-first reports from the Swift alternate application workstream.
**Author:** Codex (safari-ai-agent lead session, 2026-11-09)
**Created:** 2026-11-09
**Last Updated:** 2026-11-10
**Last Updated By:** Codex (safari-ai-agent lead session)

> **Ordering: newest first.** Every worker entry must include its occupant and assignment floor.

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
