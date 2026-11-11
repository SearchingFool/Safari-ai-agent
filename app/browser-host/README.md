# Safari AI Agent native app

**File:** `app/browser-host/README.md` (repo-relative — this repo is public)
**Description:** Current build, setup, architecture, safety, and verification guide for the self-contained Swift browser agent.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent-90e45e, 2026-11-11)
**Created:** 2026-11-11
**Last Updated:** 2026-11-11
**Last Updated By:** Codex (safari-ai-agent-90e45e)

## Product status

This is a shared SwiftUI app target for macOS and iOS. The app owns the browser, ChatGPT sign-in,
Responses requests, and browser-tool loop in one process. It does not require the Claude app or a
separate gateway. Sign in uses the documented Sign in with ChatGPT flow; inference uses the
selected account's visible model list and the public Responses API with `store:false` and
`stream:true`.

The current branch has compile and local test evidence, including a test that starts the real
loopback listener and checks the callback address and peer-address policy. Those listener tests run
on macOS. The iOS simulator UI suite does not tap the sign-in button, so the full external-browser
OAuth flow remains unverified on iOS Simulator and with a real account. Responses inference and
native approvals have not been tested with an authenticated ChatGPT account. Signing,
distribution, and physical-device acceptance are also outstanding. Codex app-server is not bundled
or available in this build; see below.

## What is implemented

- macOS and iOS app targets share the same SwiftUI browser host and `WKWebView` model.
- `src/core.js` is loaded in a named isolated `WKContentWorld`; page JavaScript cannot directly
  access the agent core.
- Sign in with ChatGPT uses per-install dynamic client registration, PKCE, state, nonce, the
  documented loopback redirect, granted-scope checks, ID-token signature/claim checks, Keychain
  credential storage, refresh-token rotation, and revocation on sign-out.
- The account's model catalog is requested from `/v1/models`; only entries with
  `visibility == "list"` are shown. The UI displays `display_name` and sends the selected `slug`.
- Responses requests go to `https://api.openai.com/v1/responses` with `store:false` and
  `stream:true`. Function calls run through an in-process browser router, and the app sends tool
  outputs back through the Responses turn loop.
- Page access is opt-in on each request. The default inspection policy excludes field values.
  Page text is treated as untrusted prompt input.
- Fill, click, and same-origin navigation always require a one-time native approval. The router
  rechecks the page origin and control after approval. The shared core's blocked-action ceiling
  still applies. Cross-origin links/navigation and unsupported controls are refused.
- A pending approval and agent request are cancelled when the app becomes inactive, the browser
  window is hidden, or an app sheet/dialog covers the web view.

## Codex availability

Codex is explicitly unavailable in this build. OpenAI publishes pinned macOS app-server release
artifacts, but this app does not bundle one. The arm64 archive from stable 0.167.1 is about 82.8 MB
compressed and contains a roughly 198 MB executable; Intel has a separate artifact. The helper
needs an App Sandbox inheritance entitlement, which requires replacing its upstream signature with
the app's nested-code signature. A temporary signed host/child fixture confirmed sandbox
inheritance can deny an out-of-container write, but it did not run Codex or verify the effective
Responses tool list.

OpenAI's current Codex config docs describe stable settings to disable shell, apps, and multi-agent
features, plus `web_search="disabled"`. We have not verified that the sandboxed app-server request
exposes only the app's browser dynamic tools; that `dynamicTools`/`item/tool/call` protocol remains
experimental. Codex stays unavailable until a pinned packaged helper, nested signing/notarization,
and a fake Responses test prove the exact advertised tool inventory and native approval boundary.
Any future process launch must set an app-private `CODEX_HOME` before starting the helper and must
never inherit or fall back to `~/.codex`.
The iOS target has no verified supported app-server executable integration. Do not treat the
direct ChatGPT Responses mode as Codex, and do not silently depend on a separately installed
`codex` command.

## Build and test

From the repository root:

```sh
xcodebuild -project app/browser-host/SafariAIAgentHost.xcodeproj -scheme SafariAIAgentHost-macOS -configuration Debug -destination 'generic/platform=macOS' -derivedDataPath /tmp/safari-ai-agent-macos CODE_SIGNING_ALLOWED=NO build
xcodebuild -project app/browser-host/SafariAIAgentHost.xcodeproj -scheme SafariAIAgentHost-iOS -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/safari-ai-agent-ios CODE_SIGNING_ALLOWED=NO build
swift test --package-path app/browser-host --scratch-path /tmp/safari-ai-agent-swift-tests
```

These commands build unsigned simulator/macOS products and run local SIWC client-registration,
loopback-listener-startup, and non-loopback-peer rejection tests. They do not use ChatGPT
credentials or establish successful external-browser OAuth, inference, signing, or physical-device
installation.

The UI test target currently checks app startup, local browser navigation, local inspection, and
that no remote-gateway pairing controls appear. It does not log into ChatGPT or call Responses.

## Install from source

This is a developer run path, not a published app release. A Mac with Xcode is required to build
either target. The iOS target requires development signing to install on a physical device.

### macOS

1. Clone the repository on a Mac with Xcode.
2. Open `app/browser-host/SafariAIAgentHost.xcodeproj`.
3. Select the `SafariAIAgentHost-macOS` scheme and **My Mac** as the run destination.
4. Run from Xcode.

### iPhone or iPad

1. Open the Xcode project on a Mac and connect the target device.
2. Set the iOS target's signing team and a bundle identifier available to that team.
3. Select `SafariAIAgentHost-iOS` and the connected device, then run from Xcode.

There is no signed `.ipa`, notarized macOS build, TestFlight package, or App Store listing in this
repository. No Touch ID or signing prompt has been accepted for this work.

## Product limits

- iOS may suspend a backgrounded app. The in-process agent only runs while the app and browser
  content are visible; embedding the router does not provide background execution.
- Third-party `WKWebView` passkeys were measured unavailable in the earlier spike (D-053). This
  app does not change that platform limitation.
- No physical iPad run, real ChatGPT account flow, plan inference, account switching, or Codex
  session is verified here.
- Prompts and any page data the user opts to share go directly to OpenAI. The app does not use a
  local Mac gateway, VPN endpoint, Claude app, or API billing key.

See [`docs/SWIFT-APP-DESIGN.md`](../../docs/SWIFT-APP-DESIGN.md) for the detailed architecture,
official protocol references, evidence, and remaining acceptance work.
