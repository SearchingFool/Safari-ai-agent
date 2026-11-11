# Swift app — self-contained browser agent

**File:** `docs/SWIFT-APP-DESIGN.md` (repo-relative — this repo is public)
**Description:** Current Swift product contract, implementation evidence, safety boundaries, and the remaining acceptance work.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent-90e45e, 2026-11-11)
**Created:** 2026-11-11
**Last Updated:** 2026-11-11
**Last Updated By:** Codex (safari-ai-agent-90e45e)

## Current product direction

The Swift app is being developed as a **self-contained browser agent for macOS and iOS**. It owns
the browser session, in-process browser tool router, native action approvals, ChatGPT sign-in, and
model requests. The ChatGPT plan is the inference client. The product does not depend on the Claude
app, a separate Mac gateway, VPN endpoint, or API billing key. Claude API billing remains deferred.

This is the selected ChatGPT/Codex variant (Variant C in D-055). It supersedes the previous
Claude-app-plus-gateway browser-host design for this app path. The earlier gateway bridge and its
remote polling protocol were removed from the active app and native app test fixtures. The Swift
app handles browser tools through its in-process router; it has no separate gateway process or
remote gateway endpoint in its request path. The existing repository gateway still serves the
Userscripts product. The Claude variant remains deferred and separate; its inbound remote MCP
reachability requirement is not solved by this local router.

The app has macOS and iOS Xcode targets. Both targets now compile against the shared browser and
ChatGPT code. The work remains an evaluation implementation: OAuth has not been completed with a
real account, direct Responses inference has not been exercised, and no physical-device or signed
release acceptance has occurred.

## Architecture and data flow

```text
SwiftUI app (macOS or iOS)
  ├─ WKWebView + named isolated WKContentWorld
  ├─ local tool router + per-action native approval
  ├─ SIWC credentials in Keychain
  └─ ChatGPT plan OAuth access token
       ├─ GET /v1/models (visible model catalog)
       └─ POST /v1/responses (store:false, stream:true)
```

The router implements `browser_inspect`, `browser_verify`, `browser_fill`, `browser_click`, and
same-origin `browser_navigate` as in-process Responses function tools. It validates each call's
argument shape, requires explicit page-access consent for every page tool, rejects cross-origin
navigation, and uses `src/core.js`'s action classifier and hard ceiling. Every fill, click, or
navigation prompts for a fresh one-time native approval. Control identity and current page origin
are checked before and after approval; approvals are cancelled when the app is hidden or covered by
a sheet/dialog.

The app sends inspected page text only after the user enables the page-access toggle for that
request. Page content is untrusted and is not treated as instructions. Field values are excluded
from inspection. The Responses client includes full request context each time, does not use
`previous_response_id`, and sends tool outputs back in the next request. The current UI transcript
is in-memory and is not persisted as a conversation history between app launches.

The app pauses agent work when inactive or when an overlay obscures the web view. This is an
in-process lifecycle guard; it does not change iOS suspension rules. A backgrounded app may be
suspended, so the browser agent requires the app to remain foregrounded.

## ChatGPT sign-in and plan inference contract

Implementation follows the current [Sign in with ChatGPT registration and sign-in
guide](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) and [models and
inference guide](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference):

- First registration sends `dynamic_agent_client` and saves the returned issued `client_id`; later
  sign-ins reuse it. The app does not contain a hard-coded client ID or client secret.
- Each attempt uses PKCE S256, a fresh state and nonce, and a stable installation host ID. It
  starts an HTTP listener on the loopback interface with local-only access, installs the connection
  handler before starting the listener, and uses the exact `http://127.0.0.1:<port>/auth/callback`
  redirect. Incoming peers must be loopback addresses, and the request's Host header must match
  the issued IPv4 callback port.
- The callback state is checked. The app exchanges the code with the token endpoint, checks the
  granted identity and plan scopes, and validates the ID-token signature, issuer, audience,
  authorized party when present, expiry, nonce, and subject using the discovery JWKS.
- Tokens and issued-client metadata are stored in Keychain. Access-token refresh checks the
  granted scopes and persists the rotated refresh token. Sign-out attempts revocation before
  deleting the local credential and reports when revocation could not be confirmed.
- On sign-in or app launch with a saved valid grant, the app requests `/v1/models` using that
  account's access token. It shows models with `visibility == "list"`, displays `display_name`,
  preserves server ordering, and submits the selected `slug`.
- Inference goes only to the public `https://api.openai.com/v1/responses` endpoint. Each request
  sets `store:false` and `stream:true`; the app waits for `response.completed` and fails closed on
  `response.failed`, `response.incomplete`, malformed function calls, or an incomplete stream.

The external system browser is used for OAuth. Swift package tests verify that the listener reaches
ready state and issues a loopback callback URL, and that the peer policy rejects non-loopback hosts.
These tests run on macOS; the iOS UI suite does not tap the sign-in button. The full iOS external-
browser callback, including returning to the app while Safari is foregrounded, has **not** been
runtime-validated. No custom redirect URI has been substituted for the documented loopback URI.
Real-account authorization, refresh rotation, revocation, and Responses inference also remain
unverified.

## Codex boundary

Codex app-server is not enabled in the current app build. Official SIWC documentation configures it
as a local stdio/NDJSON child process using the ChatGPT access token and Responses provider. OpenAI
also documents host-provided browser tools over app-server's dynamic tool-call flow, but upstream
labels `dynamicTools` and `item/tool/call` experimental.

A bounded packaging and isolation feasibility check used the official stable 0.167.1 release. Its
macOS app-server archives are separately published for arm64 and x86_64; the arm64 archive is about
82.8 MB compressed and contains a roughly 198 MB executable. The archive checksum is available in
the release metadata, and the extracted helper is Developer ID signed by OpenAI. The helper still
needs the App Sandbox inheritance entitlement to run inside a sandboxed host. A temporary, locally
signed host/child fixture confirmed macOS denied an inherited child process's write outside the app
container. That fixture did not launch Codex or verify the app-server Responses tool inventory.

The current Xcode project does not enable App Sandbox or package a helper. Signing the official
helper with the inheritance entitlement replaces the upstream code signature, so a release needs
a deliberate nested-code signing and notarization pipeline. The latest Codex config docs list
stable controls for `features.shell_tool=false`, `features.apps=false`, and
`features.multi_agent=false`, with top-level `web_search="disabled"`. These controls are promising
but the docs explicitly say the feature table is not exhaustive, and we have not captured and
asserted the actual model-visible tool inventory from a sandboxed helper. Do not expose a Codex
mode until a pinned universal or architecture-specific helper, signing pipeline, sandboxed fake
Responses test, and exact-tool-inventory assertion pass together. The host must set an app-private
`CODEX_HOME` before process launch; it must never inherit or fall back to `~/.codex`. No verified
official iOS app-server runtime is implemented or claimed. Direct ChatGPT Responses remains a
separate mode and must not be labeled Codex.

## Platform constraints inherited by this app

- Third-party `WKWebView` passkey authentication was measured unavailable in the earlier spike
  (D-053). This app does not change that platform boundary.
- iOS may suspend a backgrounded app. Keeping the browser router and model client in one app
  removes a gateway-app handoff, but it does not provide background execution or prevent OS
  suspension. The browser agent requires the app to remain foregrounded.
- The in-process router serves model tool calls from this app. It is not a publicly reachable
  inbound MCP gateway for the deferred Claude variant (D-055).
- The app has not been tested with a real ChatGPT account or pilot user's site data.
- No production signing, TestFlight, App Store, notarized macOS package, or public distribution is
  present.

## Verification and acceptance still needed

Measured for this checkpoint:

- Swift 6 typechecking and Xcode builds for macOS and iOS Simulator targets.
- Local unit tests for first-time versus returning SIWC callback client-ID handling.
- UI smoke checks for the signed-out state, no remote gateway controls, local browsing, and local
  inspection.

Still required before a pilot:

1. Exercise full SIWC on iOS Simulator and macOS with a test account, including external-browser
   return over the documented 127.0.0.1 callback. Confirm the listener survives iOS app
   deactivation or fail visibly without silently losing the callback.
2. Test model catalog parsing and selection against authenticated account responses, including an
   account with no visible supported models and account switching after sign-out.
3. Test streamed Responses completion, API usage-limit failures, missing scopes, refresh rotation,
   and local sign-out when server revocation fails.
4. Exercise all five browser tools against controlled pages: page-consent off/on, prompt
   injection text, field-value exclusion, changed/replaced controls, blocked action categories,
   same-origin and cross-origin destinations, approval deny/timeout, app backgrounding, and an
   obscuring sheet while approval is pending.
5. Run on a physical iPad and Mac with an authenticated site session. Recheck passkey limitations,
   cookie persistence, browser focus/visibility, app suspension, and approval behavior.
6. Decide whether to fund the macOS Codex packaging, sandbox, and integration work. Do not market
   Codex support until the official helper is bundled and its host-tool process is verified.
7. Define signing, privacy disclosures, update/rollback path, release package, and pilot support
   instructions before distribution.

## Official protocol references

- [Sign in with ChatGPT: registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Sign in with ChatGPT: accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Sign in with ChatGPT: models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Sign in with ChatGPT: Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
- [Codex configuration basics](https://developers.openai.com/codex/config-basic)
- [Codex app-server protocol and source](https://github.com/openai/codex/tree/main/codex-rs/app-server)
- [Codex release artifacts](https://github.com/openai/codex/releases)
- [OpenAI Codex repository license](https://github.com/openai/codex/blob/main/LICENSE)
