# Safari AI Agent browser host

**Status:** buildable shared-source macOS and iOS browser host with complete local-fixture command
flow verification in iPad Simulator. Tests verified HTTPS pairing, Keychain token storage, local
inspection, remote inspection, approval allow/deny, fill, click, same-origin navigation, and
confirmed gateway revocation. Physical iPad acceptance, the pilot route, signing, and distribution
remain outstanding; do not use this as a pilot build yet.

The Claude app remains the model client, the existing gateway remains the control plane, and this
app hosts the `WKWebView`. It can be configured with an HTTPS gateway origin and device token,
which it stores in Keychain. While the app scene and browser window are visible and a page is loaded, it polls the
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
  Every poll refreshes the gateway's per-origin policy and malformed policy falls back to read-only.
- Polling also pauses and reports hidden while an app inspector sheet or clear-data confirmation
  covers the web view; it resumes after the overlay closes.
- Dispatch allowlist for `browser_inspect`, `browser_verify`, `browser_fill`, `browser_click`, and
  same-origin `browser_navigate`. These use the shared core's inspect, fill, classification, and
  policy methods. Consequential actions use a native one-time approval; hard-ceiling controls and
  cross-origin destinations remain refused. `browser_status` is a gateway MCP-side status tool,
  not an action delivered through the device poll endpoint.
- Local per-action argument validation, inspected-reference checks, refreshed control snapshots,
  command expiry checks, post-ack click/navigation revalidation, and a short-lived same-origin
  guard around remote page changes. Fill approval displays the value being entered; that value is
  not written to the app's status or diagnostics.
- Best-effort hidden notification on scene deactivation, explicit disconnect revocation, and
  same-origin-only HTTPS redirect handling for authenticated gateway requests.
- Site-data clearing scoped to the current host's matching WebKit data records.
- App and window visibility state pauses polling, sends a best-effort hidden-state update, and
  resumes polling when visible again.

macOS local inspection has run against the repository fixture page and showed the shared engine's
control snapshot without revealing a field value. The complete iOS simulator fixture passed HTTPS
pairing, remote inspection, fill approval and verification, click denial, click approval and
verification, same-origin navigation and verification, and confirmed disconnect/revocation.
Wrong-token handling, gateway 409s, cross-origin redirects, app suspension during a claimed command,
physical iPad visibility, and authenticated session persistence remain untested.

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

Run the iOS simulator UI smoke test on a booted simulator with:

```sh
xcodebuild -project app/browser-host/SafariAIAgentHost.xcodeproj \
  -scheme SafariAIAgentHost-iOS -configuration Debug \
  -destination 'platform=iOS Simulator,id=<simulator-uuid>' \
  -derivedDataPath /tmp/safari-ai-agent-ios-uitests \
  CODE_SIGNING_ALLOWED=NO test
```

The UI suite checks the disconnected state and local-only inspection. Its gateway fixture test also
loads a harmless local page, pairs using a synthetic token, verifies remote inspection, approves
and verifies fill, denies one click, approves and verifies a click, approves and verifies
same-origin navigation, and confirms disconnect. The test uses only synthetic fixture tokens and
harmless local page content.

To launch in the iPad simulator (replace the destination UUID if needed):

```sh
xcrun simctl boot 265F98BB-E868-4766-BC06-F4C7BEACD782
xcrun simctl bootstatus 265F98BB-E868-4766-BC06-F4C7BEACD782 -b
xcrun simctl install 265F98BB-E868-4766-BC06-F4C7BEACD782 \
  '/tmp/safari-ai-agent-ios-derived/Build/Products/Debug-iphonesimulator/Safari AI Agent.app'
xcrun simctl launch 265F98BB-E868-4766-BC06-F4C7BEACD782 \
  com.searchingfool.safari-ai-agent.host
```

The simulator launch proves app startup only. It does not establish remote bridge behavior, gateway
reachability, approval handling, persistence for authenticated sessions, or physical device use.

## Exercise the Swift gateway bridge locally

Run `app/browser-host/Tests/run-gateway-bridge-test.sh` from any checkout with Xcode and the iOS
26.3 simulator runtime installed. It creates a disposable iPad simulator and a one-day loopback
certificate, trusts that certificate only in the disposable simulator, starts a loopback-only copy
of the repository gateway, runs the app UI tests, and deletes the simulator and temporary
certificate afterward. The test uses fixture tokens and a harmless local page; it does not contact
the pilot gateway or use its credentials. Build products and the `.xcresult` stay in the generated
temporary directory under `/tmp` for inspection.

The complete iPad simulator fixture run passed TLS trust, Keychain pairing, page load, gateway
authentication, poll/result exchange, remote inspection, approval allow/deny, fill, click,
same-origin navigation, and confirmed disconnect/revocation. The fixture uses synthetic tokens and
a harmless local page; it does not contact the pilot gateway or use pilot credentials. It does not
cover physical iPad behavior, passkeys, real VPN reachability, long suspension, or production
signing. Set `SWIFT_TEST_RUNTIME_ID` and `SWIFT_TEST_DEVICE_TYPE` if your installed iOS simulator
runtime or iPad type differs from this Mac's defaults. Set
`SWIFT_TEST_ONLY=SafariAIAgentHostUITests/SafariAIAgentHostUITests/testGatewayInspectionFillAndNativeApproval`
to rerun only the remote bridge flow while iterating; omit it to run the complete UI suite.

## Install from source

This is a developer installation path, not a published app release. It requires a Mac with Xcode.
The iOS target requires iOS 17 or later; the macOS target requires macOS 14 or later. The project
does not provide a signed `.ipa`, notarized `.app`, TestFlight build, or App Store listing.

### macOS

1. Clone this repository on the Mac.
2. Open `app/browser-host/SafariAIAgentHost.xcodeproj` in Xcode.
3. Choose the `SafariAIAgentHost-macOS` scheme and **My Mac** as the run destination.
4. Press **Run**. Xcode builds and launches the app from the checkout.

The unsigned command-line build in the preceding section proves compilation only. For normal
launching, run from Xcode or configure signing in Xcode; do not distribute that unsigned build as a
release.

### iPhone or iPad

1. Clone this repository on a Mac with Xcode and connect the iPhone or iPad.
2. Open `app/browser-host/SafariAIAgentHost.xcodeproj`.
3. In Xcode, open **Xcode → Settings → Apple Accounts**, add the Apple Account for your Apple
   Developer Program membership, and confirm its team appears in the account details.
4. In the project editor, select the **SafariAIAgentHost-iOS** target, then open
   **Signing & Capabilities**. Turn on **Automatically manage signing** and choose your developer
   team from **Team**.
5. The project currently uses bundle ID `com.searchingfool.safari-ai-agent.host`. If Xcode says it
   is unavailable for your team, replace it in the **Bundle Identifier** field with an identifier
   unique to your developer account. This is a local Xcode setting unless you choose to commit the
   project change.
6. Choose the `SafariAIAgentHost-iOS` scheme and your connected device as the run destination.
   Unlock the device and tap **Trust** if it asks whether to trust this Mac.
7. Press **Run**. With automatic signing, Xcode registers the connected device and creates the
   development provisioning profile. If Xcode presents a **Register** prompt, accept it.
8. If the device asks for Developer Mode, enable it at **Settings → Privacy & Security → Developer
   Mode**, restart, confirm the prompt after restart, and enter the device passcode.

The iOS simulator build command above does not install on a physical device. A physical install
needs Xcode development signing; there is currently no one-tap install link or signed pilot package.
The app also has not passed a physical iPad gateway-flow check, so treat it as an evaluation build.
These steps install the development build on your own registered device through Xcode. They do not
publish the app to TestFlight or install it for another tester.

### Pair it with the gateway

The Swift app still needs the existing Claude custom connector and gateway. Start with the
[gateway setup guide](../../docs/SETUP-GUIDE.md) to install and configure those components. Then
open the Swift app, enter the gateway's HTTPS origin and the **device token** (not the separate MCP
client token), and tap **Connect**. The gateway must be reachable from the device, and the exact
page origin must be allowed by the gateway policy. The Mac/Tailscale controller remains the tested
gateway setup; other tunnel configurations require manual setup and are untested. Follow the
[remaining Swift acceptance steps](../../docs/SWIFT-APP-DESIGN.md#6-work-remaining-in-the-order-that-wastes-least)
before using page-changing commands.

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
  handles only the five listed page actions. It does not implement `browser_cancel`; cancellation
  and app-suspension races need a gateway fixture before the bridge can be called validated.
- `browser_status` is fulfilled at the gateway/MCP layer and is not sent to the device. The app
  shows its own pairing, connection, active/paused, and error state.
- Current bridge evidence includes simulator URLSession/TLS authentication, Keychain pairing,
  WKContentWorld remote inspection, approval allow/deny, fill, click, same-origin navigation, and
  gateway revocation against a local fixture. Wrong-token handling, cancellation races, lifecycle
  behavior, and physical iPad acceptance remain unverified; complete those before pilot use.
- Do not expose the gateway publicly to make the app connect. Its address may be private and
  reachable through a VPN or tunnel; the app needs operator instructions for gateway reachability.
- Third-party `WKWebView` passkey authentication is measured unavailable (D-053). The design is
  bounded to sites that can authenticate without a passkey ceremony. Existing authenticated
  session persistence has not been proven in the new app.
- iOS may suspend a backgrounded app. iPad Split View remains the operating limit (D-029); app
  lifecycle reporting is not a way around it.
- No physical iPad run or signing/provisioning was attempted. Simulator success is not device
  acceptance. Do not use the bridge for pilot traffic until a gateway protocol test and device
  acceptance run pass.

See [`docs/SWIFT-APP-DESIGN.md`](../../docs/SWIFT-APP-DESIGN.md) for the product framing, decision
questions, existing evidence, and ordered acceptance work.
