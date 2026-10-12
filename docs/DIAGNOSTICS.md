# Gateway diagnostics and observability contract

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/docs/DIAGNOSTICS.md
**Description:** How to see what is actually happening inside the MCP gateway — the request classifier, the durable event log, the human report, and the rules any new error path must follow.
**Author:** Claude Code (Opus 5)
**Created:** 2026-10-11
**Last Updated:** 2026-10-11
**Last Updated By:** Claude Code (Opus 5)

---

## Why this exists

During the first live Claude-connector attempt the gateway logged exactly one line — its startup banner. The client reported "can't reach the server" and there was no way to tell whether a request had arrived at all, let alone what was wrong with it. Every answer would have been a guess.

This subsystem exists so that never happens again. **Every request is classified into a named outcome with likely causes and concrete next actions.**

## Quick start

```sh
# Diagnostics are ON by default in the Mac test launcher.
bash tools/start-mac-tailscale-test.sh      # live classified narrative in this terminal

# In a second terminal:
npm run diagnose                  # full report: clients, endpoints, issues, verdict
npm run diagnose -- --since 10m   # only the last 10 minutes
npm run diagnose -- --path /mcp   # only the MCP endpoint
npm run diagnose -- --raw         # matching JSONL for scripting
```

Set `SAFARI_LOG_REQUESTS=0` to disable. Set `SAFARI_DIAGNOSTICS_FILE` to relocate the log (default `logs/gateway-diagnostics.jsonl`, gitignored, mode 0600).

## The two surfaces

Per the cross-project observability standard, every event lands on both:

1. **Durable log** — append-only JSONL, one object per request, carrying `requestId`, `correlationId`, timing, request shape, and the full diagnosis.
2. **User-visible response** — `X-Request-Id` and `X-Correlation-Id` headers on every response, and `requestId` inside every error body, so a user can quote an ID and it can be found in the log.

`X-Correlation-Id` is honoured from the caller when supplied (`[\w.-]{1,64}`), so one logical operation can be traced across an MCP call and the device round trip it triggers. Otherwise it defaults to the request ID.

## What is never recorded

**Credential values, webpage text, and tool payloads are never logged.** The classifier records credential *shape* only: scheme, total header length, and whether that length matches what the server expects. That is deliberately enough to tell these apart:

| Observation | Meaning |
|---|---|
| `authLength: 0` | client sent no header at all |
| `authScheme: "Basic"` | wrong scheme |
| length ≠ expected | truncated, doubled, or wrong secret pasted |
| length = expected, still 401 | right shape, genuinely wrong secret |

A test (`tests/diagnostics.test.mjs`) asserts that no token value ever appears in the log output. Keep it that way.

## Diagnosis catalogue

| Code | Severity | Means |
|---|---|---|
| `MCP_OK` / `DEVICE_OK` / `HEALTH_OK` / `DEMO_OK` | ok | Normal exchange |
| `MCP_NO_CREDENTIAL` | error | Client reached us but sent no `Authorization` |
| `MCP_WRONG_AUTH_SCHEME` | error | Not `Bearer` |
| `MCP_TOKEN_LENGTH_MISMATCH` | error | Truncated/doubled paste, or wrong secret of a different length |
| `MCP_TOKEN_MISMATCH` | error | Correct shape, wrong secret |
| `MCP_BROWSER_ORIGIN_REJECTED` | warn | A browser tried to call `/mcp` |
| `MCP_NON_POST_METHOD` | warn | Client opened `GET /mcp` for a server→client SSE stream (unimplemented) |
| `MCP_PROTOCOL_VERSION_MISMATCH` | error | Client wants a different Streamable HTTP revision |
| `MCP_WRONG_CONTENT_TYPE` / `MCP_MALFORMED_JSONRPC` | error | Body problem, often an intermediary |
| `PROBE_OAUTH_DISCOVERY` | warn | Client wants OAuth metadata; **this is the B1 capability signal** |
| `PROBE_LEGACY_SSE_TRANSPORT` | warn | Client expects the deprecated two-endpoint HTTP+SSE transport |
| `DEVICE_NO_CREDENTIAL` / `DEVICE_TOKEN_*` | error | iPad bridge credential problems |
| `DEVICE_ORIGIN_NOT_ALLOWED` | error | iPad page origin is not in `SAFARI_ALLOWED_ORIGINS` |
| `DEVICE_SESSION_CONFLICT` | warn | Duplicate/expired/revoked command — fail-closed, nothing applied twice |
| `UNKNOWN_PATH` | warn | Reveals an endpoint convention the client expected |
| `TOOL_BLOCKED_HIGH_IMPACT` | warn | A hard ceiling refused the control **before** any prompt was offered |
| `TOOL_DENIED_BY_OPERATOR` | info | The operator **actually tapped Deny** in the paired tab |
| `TOOL_STOPPED_BY_OPERATOR` | info | The operator pressed **Stop** while a prompt was open — revokes everything, not just this action |
| `TOOL_APPROVAL_UNANSWERED` | **warn** | **Nobody answered.** Refused, but **not an operator decision** |
| `TOOL_APPROVAL_TAB_HIDDEN` | warn | The tab went off screen while the prompt was open |
| `TOOL_TIMED_OUT` | error | No result came back at all — the outcome is **uncertain**, do not retry blindly |

### Telling a refusal from a non-decision (D-037)

These four used to be **one** code. An approval that expired untouched was logged `TOOL_DENIED_BY_OPERATOR` at `info`, asserting *"the operator declined"* and *"working as intended"* — a decision nobody made, recorded in the flattering direction at the severity least likely to be read. Found on a device: the operator touched nothing and the log said they had.

**`TOOL_DENIED_BY_OPERATOR` now means a real tap and nothing else.** If you see `TOOL_APPROVAL_UNANSWERED`, the correct response is *not* "the user said no" — it is **"the user probably never saw it"**. Check the tab is on screen, then retry.

Recurring `TOOL_APPROVAL_UNANSWERED` is a **usability defect, not a user choice**. It is `warn` for that reason, and it is the signal that led to the audible/visual approval alert (D-039, D-040).

## Timing a session handover

```sh
npm run handover              # whole log
npm run handover -- --since 10m
```

`/device/poll` events carry `deviceInstance` (the per-tab session id) and `deviceVisibility`, so ownership can be reconstructed over time and every transfer timed. Without those fields a handover is **invisible** — every poll looks alike — and the question "did it hang, or did you not wait long enough?" has no answer.

The tool names which path a transfer took:

- **~1 s after a `hidden` final poll** — the new visible tab followed (D-033 working)
- **~45 s after a `visible` final poll** — the leaving tab's notification lost the race with iPadOS suspension, so the claimant waited out `deviceFreshMs`

Measured on an iPad 2026-10-11: **1.25 / 1.27 / 1.27 s**, three for three.

### The two highest-value signals

`PROBE_OAUTH_DISCOVERY` **with no authenticated request following** means the client requires OAuth and static-header auth cannot work. That is a genuine capability blocker and the answer to work package B1 — record it as a decision and choose an alternative. **Do not disable authentication to get past it.**

`UNKNOWN_PATH` is logged rather than silently 404'd precisely because the path a client asks for identifies what it expected.

## Rules for new error paths

1. Route every error through `fail()` so the request ID reaches the caller.
2. Never return a bare status with no machine-readable body.
3. If a new failure mode is added, add a diagnosis code for it — a failure the classifier cannot name is a failure someone will debug by guessing.
4. Diagnostics must never break a request: the sinks are wrapped so a logging fault cannot fail a call.
5. Never add a credential value, page text, or tool argument to a log event.

## Known gaps

- `remote` is always the loopback address behind Tailscale Funnel; the true client IP is not visible. `userAgent` is the practical client identifier.
- There is no log rotation. The file is append-only for a test session; delete it between sessions if it grows.
- This is single-operator diagnostics, not multi-tenant audit. The post-MVP governance milestone (E-01) owns structured audit, retention and risk tiers.
