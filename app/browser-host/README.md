# Safari AI Agent browser host

**Status:** buildable shared-source macOS and iOS app foundation with an unverified, inspect-only
gateway bridge. This is not yet a validated alternate product.

The Claude app remains the model client, the existing gateway remains the control plane, and this
app hosts the `WKWebView`. It can be configured with an HTTPS gateway origin and device token,
which it stores in Keychain. While the app scene is active and a page is loaded, it polls the
existing `/device/poll` endpoint and returns results to `/device/result`. It does not call a model
or require model API credentials.

## What is implemented

- Two Xcode app targets built from the same SwiftUI and browser model sources: macOS and iOS.
- Persistent `WKWebView` browsing with HTTP(S)-only, credential-free URL validation.
- The repository `src/core.js` bundled as a resource and registered in a named `WKContentWorld`.
  The page cannot directly access the agent engine global.
- A local “Inspect locally” action that requests `mode: 'read-only'` and displays a snapshot in
  app UI.
- Gateway pairing with an HTTPS-origin field and a 24+ character device token stored in Keychain.
- Active-scene polling with a persisted per-install instance ID and monotonic sequence counter.
  The poll response's policy cannot widen the app's forced read-only/no-field-values inspection.
- Polling also pauses and reports hidden while an app inspector sheet or clear-data confirmation
  covers the web view; it resumes after the overlay closes.
- Hard dispatch allowlist for `browser_inspect`; every other delivered action receives an
  explicit unsupported-action failure without touching the page. `browser_status` is a gateway
  MCP-side status tool, not an action delivered through the device poll endpoint.
- Best-effort hidden notification on scene deactivation, explicit disconnect revocation, and
  same-origin-only HTTPS redirect handling for authenticated gateway requests.
- Site-data clearing scoped to the current host's matching WebKit data records.
- App lifecycle state pauses polling, sends a best-effort hidden-state update, and resumes polling
  when active again.

This remains unvalidated architecture groundwork. The bridge has compiled but has not been run
against a gateway. Its behavior has not been tested for wrong tokens, gateway 409s, accepted or
rejected results, cross-origin redirects, app suspension during a claimed command, or physical
device visibility. The engine injection has not yet been exercised against a loaded page in either
platform.

## Build for both targets

Run the following commands from the repository root. Signing is disabled for these compile-only
checks, so they do not install a physical-device build or settle provisioning:

```sh
xcodebuild -project app/browser-host/SafariAIAgentHost.xcodeproj \
  -scheme SafariAIAgentHost-macOS -configuration Debug \
  -derivedDataPath /tmp/safari-ai-agent-macos-derived \
  CODE_SIGNING_ALLOWED=NO build

xcodebuild -project app/browser-host/SafariAIAgentHost.xcodeproj \
  -scheme SafariAIAgentHost-iOS -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/safari-ai-agent-ios-derived \
  CODE_SIGNING_ALLOWED=NO build
```

To launch in the iPad simulator (replace the destination UUID if needed):

```sh
xcrun simctl boot 265F98BB-E868-4766-BC06-F4C7BEACD782
xcrun simctl bootstatus 265F98BB-E868-4766-BC06-F4C7BEACD782 -b
xcrun simctl install 265F98BB-E868-4766-BC06-F4C7BEACD782 \
  '/tmp/safari-ai-agent-ios-derived/Build/Products/Debug-iphonesimulator/Safari AI Agent.app'
xcrun simctl launch 265F98BB-E868-4766-BC06-F4C7BEACD782 \
  com.searchingfool.safari-ai-agent.host
```

The checked simulator launch opened the app but did not load a page. It therefore proves app
startup only, not WebKit navigation, core injection, inspect output, persistence, or device use.

## Safety and product gaps

To configure the experimental bridge, enter the gateway's HTTPS origin and the gateway's
`DEVICE_TOKEN` value (hexadecimal, at least 24 characters), then choose Connect. Do not enter the
separate MCP client token. The origin must be reachable from this device through its chosen
private/VPN route and must already be authorized by the gateway's site-origin allowlist. The app
does not expose or reconfigure the gateway. Connect is explicit each run; a token already saved in
Keychain can be reused with the Connect button. Disconnect asks the gateway to revoke the app's
current device session and removes the saved token.

- The app accepts only ordinary `http` and `https` navigation and rejects URLs containing user
  information. There is no arbitrary custom URL scheme support.
- The engine runs only in the named isolated content world. Do not move it into the page world.
- Gateway inspection sends page content through `/device/result` to the existing gateway and
  therefore makes it available to the model caller. Treat page content as untrusted. The local
  Inspect button still keeps its snapshot in app UI only.
- The gateway's `/device/poll` claims queued commands; it is not a harmless status query. The app
  dispatches only `browser_inspect`; it reports an explicit error for every other action and does
  not have code paths for fill, click, submit, or remote navigation.
- `browser_status` is fulfilled at the gateway/MCP layer and is not sent to the device. The app
  shows its own pairing, connection, active/paused, and error state.
- The bridge has only compile evidence so far. A protocol test must cover auth failure, allowlist
  rejection, poll claim/result binding, unsupported actions, stale sequence behavior, redirects,
  and lifecycle races before calling it validated.
- Do not expose the gateway publicly to make the app connect. Its address may be private and
  reachable through a VPN or tunnel; the app needs operator instructions for gateway reachability.
- Third-party `WKWebView` passkey authentication is measured unavailable (D-053). The design is
  bounded to sites that can authenticate without a passkey ceremony. Existing authenticated
  session persistence has not been proven in the new app.
- iOS may suspend a backgrounded app. iPad Split View remains the operating limit (D-029); app
  lifecycle reporting is not a way around it.
- No physical iPad run or signing/provisioning was attempted. Simulator success is not device
  acceptance. Do not use the bridge until a gateway protocol test and device acceptance run pass.

See [`docs/SWIFT-APP-DESIGN.md`](../../docs/SWIFT-APP-DESIGN.md) for the product framing, decision
questions, existing evidence, and ordered acceptance work.
