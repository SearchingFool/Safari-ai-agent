# LLM Chat Spike

**File:** `app/llm-chat-spike/README.md`
**Description:** Two Swift spikes for the in-app path (D-047). `LLMChatSpike` is a chat client for the framing that D-006 priced out — kept for reference, not extended. `WebViewSpike` is the live one: it answered D-052 (the web view's data store survives an app restart) and D-053 (passkeys do not work in a third-party `WKWebView`).
**Author:** claude-chatspike (Claude Code, Opus 5)
**Created:** 2026-10-14
**Last Updated:** 2026-10-25
**Last Updated By:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04, D-053)

---

## Read this first: the package holds TWO spikes, and only one is live

**`WebViewSpike` is the live one.** It owns a `WKWebView` with the default (persistent) data
store and exists to answer, cheaply, the questions that can kill the in-app path before anything
is built on it. It has answered two. **Design, constraints and the remaining work are in
[`docs/SWIFT-APP-DESIGN.md`](../../docs/SWIFT-APP-DESIGN.md) — read that, not this file, before
writing Swift.**

**`LLMChatSpike` is reference only — do not extend it.** It was built for the framing in which
*our* code calls the model, and **D-006 priced that out empirically**: with a valid OAuth token
`GET /v1/models` returns 200 while `POST /v1/messages` returns 400 *"credit balance too low"*.
Authentication works; inference is unfunded. The viable framing is the app as a **browser host**,
where the Claude app is the client and the subscription pays. So the live round trip below is not
a pending task — **it is a step that will not be taken.**

**Neither is the product, an agent loop, or a safety gate.** There is no tool calling and no
classification tier here.

**No dependencies.** `URLSession` and `JSONEncoder` only, matching the repo's zero-dependency rule.

## Status

| Claim | Evidence |
|---|---|
| Builds on Swift 6.4 / Xcode 27.1 | `swift build` → `Build complete!` |
| 15 tests pass | `swift test` → `15 tests ... passed`, no network, no key |
| Request shape, error mapping and correlation ids covered | `Tests/LLMChatCoreTests/AnthropicClientTests.swift` |
| **Live API round trip** | **WILL NOT BE RUN** — D-006, unfunded. Not a pending task |
| `WKWebView` data store survives an app restart | **PROVEN on macOS — D-052.** Both halves: cookies before any navigation, zero after Clear data |
| A **passkey** login works in the web view | **NO — D-053.** `NotAllowedError` in 12 ms, document focused; Chrome on the same Mac reports the authenticator available, so it is the web view, not the hardware |
| A real **logged-in** session survives a restart | **not run.** Needs a *password* login. The decisive remaining test |
| `src/core.js` runs in the web view | not attempted |
| Runs on iPad | not attempted; macOS only so far |

## Run it

```sh
cd app/llm-chat-spike
swift build && swift run LLMChatSpike
```

Or open `Package.swift` in Xcode and run the `LLMChatSpike` scheme.

The live spike, and the probe that produced D-053:

```sh
swift run --package-path app/llm-chat-spike WebViewSpike          # opens the window

# Unattended passkey probe — prints the verdict to stderr and exits. Costs nothing.
SPIKE_PASSKEY_PROBE=1 swift run --package-path app/llm-chat-spike WebViewSpike
SPIKE_PASSKEY_PROBE=1 SPIKE_PASSKEY_URL=https://example.com \
  swift run --package-path app/llm-chat-spike WebViewSpike
```

`swift run` produces a bundle-less binary that macOS will not show a window for, so the spike
self-bundles into a `.app` and relaunches. In probe mode it executes the bundled copy **directly**
rather than via `open`, so stderr and the environment survive — and so WebAuthn is not judged on
an unbundled process, which would confound the result rather than measure it.

Tests:

```sh
cd app/llm-chat-spike
swift test
```

## The key

The app reads `ANTHROPIC_API_KEY` from the environment at launch. If it is absent, a secure field
appears in the window and the key is held **in memory for that run only** — never written to disk,
never put in `UserDefaults`, never logged.

**This is deliberate.** See `docs/DECISIONS.md` D-046: this repo has already had one incident where
live credentials were printed into a transcript. There is no code path here that can log the key,
and `SpikeLog` does not accept it as a parameter.

**API usage is metered** and is not covered by a Claude subscription. Per `AGENTS.md` §6, spending
is reserved to the operator — so no live call happens until a key is supplied by hand.

## Model

`AnthropicModel.default` is **Sonnet 5**, not Opus 5, because this is a throwaway test and tokens
cost money. Switch by passing `AnthropicModel.opus` to `AnthropicClient`, or by changing
`ChatViewModel.model`.

## Layout

```
Sources/LLMChatCore/      UI-free, testable
  AnthropicClient.swift   the one HTTPS POST; transport is injectable
  ChatMessage.swift       conversation turn, model ids, reply type
  SpikeError.swift        structured errors + the logging surface
Sources/LLMChatSpike/     SwiftUI shell, deliberately thin
  LLMChatSpikeApp.swift   entry point (must not be main.swift — @main conflict)
  ChatViewModel.swift     transcript, in-flight state, last error
  ChatView.swift          transcript, composer, status line
Tests/LLMChatCoreTests/   15 tests, no network
```

The split is the point: everything worth asserting lives in `LLMChatCore`, so the agent loop can
be built and tested later without going through a UI.

## Error handling

Every failure is a `SpikeError` with a stable `code`, a human `message`, the provider `request-id`
when one came back, and the HTTP status. It is logged through `SpikeLog` *and* rendered in the
status line with its ref, so the log record and what the operator sees can be tied together. No
bare `print()` in an error path, and no generic "request failed" without a code.

Covered failure modes: missing key (short-circuits before any network call), rejected key, rate
limit, provider fault, transport failure, `200 OK` with an unparseable body, and `200 OK` with no
text block.

## What comes next

**Canonical order lives in [`docs/SWIFT-APP-DESIGN.md`](../../docs/SWIFT-APP-DESIGN.md) §6** —
ordered so each step can kill the path before the next one costs anything. Summarised:

1. ~~Passkey authentication in `WKWebView`~~ — **done, it cannot (D-053).** Bounds the path to
   password-authenticated sites rather than ending it.
2. **Stage B — a real logged-in session across a restart.** A *password* login, quit, relaunch,
   still logged in. D-052 proved the *store* persists; this proves a *session* does, which is not
   the same claim. **This is now the decisive test.**
3. **`src/core.js` inside the web view**, driven by buttons, no model. Proves the engine ports.
4. The same three on an actual iPad.
5. **Device-bridge protocol** — speak `/device/poll` and `/device/result` so the existing gateway
   drives the app exactly as it drives the userscript.

**None of it needs API credits.** Do not buy any for this.
