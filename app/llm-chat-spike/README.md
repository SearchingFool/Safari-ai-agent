# LLM Chat Spike

**File:** `app/llm-chat-spike/README.md`
**Description:** A minimal SwiftUI chat client that proves one hop — app → cloud model over plain outbound HTTPS, with no gateway, no controller and no Mac in the path. First step of the in-app agent architecture.
**Author:** claude-chatspike (Claude Code, Opus 5)
**Created:** 2026-10-14
**Last Updated:** 2026-10-14
**Last Updated By:** claude-chatspike

---

## What this is, and what it is not

**Is:** a throwaway interface test. It sends a conversation to the Messages API and renders the
reply, carrying the provider's `request-id` and token counts into the UI so a run leaves visible
evidence.

**Is not:** the product, an agent loop, or a browser. There is no `WKWebView` here and no tool
calling. Those are the next stages. This exists to answer one question — *can the app itself hold
the model conversation?* — before any effort goes into the harder parts.

**No dependencies.** `URLSession` and `JSONEncoder` only, matching the repo's zero-dependency rule.

## Status

| Claim | Evidence |
|---|---|
| Builds on Swift 6.4 / Xcode 27.1 | `swift build` → `Build complete!` |
| 15 tests pass | `swift test` → `15 tests ... passed`, no network, no key |
| Request shape, error mapping and correlation ids covered | `Tests/LLMChatCoreTests/AnthropicClientTests.swift` |
| **Live API round trip** | **NOT RUN — needs an operator-supplied key** |
| Runs on iPad | not attempted; macOS only so far |

## Run it

```sh
cd app/llm-chat-spike
swift build && swift run LLMChatSpike
```

Or open `Package.swift` in Xcode and run the `LLMChatSpike` scheme.

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

1. **Live round trip** — operator supplies a key; confirm a real reply and record the request id.
2. **`WKWebView` spike** — log into a real target site, confirm the session survives an app
   restart, inject `src/core.js`, drive the page from buttons with no model involved.
3. **Tool calling** — port the tool definitions, descriptions and permission tiers from
   `gateway/server.mjs`.

Stage 2 is the one that can still kill the architecture, so it should not wait long behind this.
