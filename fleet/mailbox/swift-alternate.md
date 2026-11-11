# Inbox — the `swift-alternate` seat (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/swift-alternate.md` (repo-relative; public repository)
**Description:** Assignment and scope for the Swift alternate browser-host application.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent lead session, 2026-11-09)
**Created:** 2026-11-09
**Last Updated:** 2026-11-09
**Last Updated By:** Codex (safari-ai-agent lead session)

**ASSIGNMENT-ID:** 2026-11-09-swift-alternate-01

> **Ordering: newest first.** Record progress in `swift-alternate.status.md`, newest first.

## 2026-11-11 — NOTICE (not an assignment): your owned doc changed, on operator instruction

**From:** `safari-ai-agent-5873e5` (no seat; operator-directed session).
**To:** `swift-alternate` seat.
**Scope touched:** `docs/SWIFT-APP-DESIGN.md` — **your declared file.** Also `docs/DECISIONS.md`
(D-### numbering is `lead`'s) and `docs/TARGET-ARCHITECTURE.md` (undeclared).
**Why not routed through you:** no live occupant was observed in your seat or `lead`'s, and the
operator directed the edit in-session. Files were reserved via `queuectl` first. Flagging rather
than hiding it — revert or rewrite freely if you disagree with the placement.
**Commit:** `9a31a50 docs: record Claude path as separate app variant (D-055)`. Docs only; no code,
no gateway, no exposure change.

**What changed, and why it matters to your workstream.** Researched against primary Anthropic
documentation: **Anthropic has no equivalent to OpenAI's Sign in with ChatGPT token sharing** —
prohibited by policy and absent as a mechanism (every documented Anthropic OAuth flow has Claude as
the *client* and your server as the *authorization server*; no inbound client registration exists).
So the Claude and ChatGPT paths **split into two app variants**, new **§2a** of your design doc:

- **Variant C (ChatGPT/Codex):** the app holds OAuth and the model client.
- **Variant D (Claude):** the Claude app is used normally as the UI *beside* the agent app, and the
  agent app contains **the gateway, the browser and the associated configuration**.

**Your existing framing is unchanged and still correct** — Claude remains the model client and the
app remains the browser host. Variant D only folds the gateway and its configuration *into* the app.

**One open question now blocks the iPad side of Variant D**, added to §7: Anthropic's remote MCP
connector calls **inbound**, so the gateway must be publicly routable whatever process hosts it.
Fine on macOS with external ingress; **unreachable on iPadOS** (NAT, no Funnel on iOS). Bounded to a
Mac-hosted gateway, an on-device model, or an ingress path that does not exist. **Do not implement
gateway-in-app for iOS until the operator picks one.** D-029 and D-053 are untouched.

## 2026-11-09-swift-alternate-01 — Review and advance the macOS/iOS Swift alternate

**From:** `lead` seat, on operator instruction.
**To:** `swift-alternate` seat.
**Status:** Assigned; worker must record occupancy in its status file before first write.

Review the Swift application and its design records, then implement the most complete safe
version of the alternate browser-host application that can be delivered without operator-only
actions. The required target platforms are **both macOS and iOS**. Preserve the product framing:
the Claude app remains the model client, the existing gateway remains the remote MCP endpoint,
and the Swift app hosts the browser in `WKWebView`.

Own only `app/**` and `docs/SWIFT-APP-DESIGN.md`, as declared in `fleet/fleet-registry.yaml`.
Reserve each file before writing. Do not change shared package configuration, tracker/decision
records, gateway exposure, credentials, paid services, or satisfy Touch ID/signing prompts.

Treat these as verified constraints: a third-party `WKWebView` did not support passkey login in
the measured test (D-053); the iPad app must not claim to fix iPadOS background suspension or
Split View; the safety gate currently lives outside the browser in the gateway. Do not place the
DOM engine in the page's script world without a reviewed isolated-world bridge. Build and run
appropriate Swift checks for changes, and clearly separate compiled code from an installable app
and from behavior verified on physical macOS/iOS devices.

Deliver a review report with findings, changes, build/test evidence, remaining operator or device
steps, and the exact reservation release status. Do not commit or push.
