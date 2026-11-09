# Inbox — the `swift-alternate` seat (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/swift-alternate.md` (repo-relative; public repository)
**Description:** Assignment and scope for the Swift alternate browser-host application.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent lead session, 2026-11-09)
**Created:** 2026-11-09
**Last Updated:** 2026-11-09
**Last Updated By:** Codex (safari-ai-agent lead session)

**ASSIGNMENT-ID:** 2026-11-09-swift-alternate-01

> **Ordering: newest first.** Record progress in `swift-alternate.status.md`, newest first.

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
