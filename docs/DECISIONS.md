# Safari AI Agent — Decision log

Updated: 2026-10-11. Each entry is a project decision or an explicitly unresolved design question. A recommendation is not an already-verified implementation.

| ID | Status | Decision / question | Basis and next action |
|---|---|---|---|
| D-001 | Agreed | Focus on AI operating real webpages (read, fill, click, navigate), not chat/summarization | End-to-end MVP acceptance in PRODUCT_REQUIREMENTS |
| D-002 | Agreed | Safari/iPad first; reuse Userscripts for no-developer-membership prototype | Existing iPad installation and 0.1.1 work |
| D-003 | Agreed | Do not require an on-iPad model or a dedicated native browser | Model hosted by eligible provider/other approved runtime |
| D-004 | Agreed | Keep browser engine/model interface provider-agnostic | Common versioned browser capability contract |
| D-005 | Proposed, needs technical validation | Expose browser tools through MCP where supported | First validate a real iPad client using existing subscriptions; gateway may be required |
| D-006 | Preference, not verified | Reuse ChatGPT/Claude/Gemini subscriptions without extra API charges | Must verify each integration and billing; installed apps alone are insufficient |
| D-007 | Agreed | Mac-hosted controller is optional, not mandatory | Remote or supported direct integration preferred |
| D-008 | Agreed | Full configurable governance harness follows, not included in, initial MVP | Basic secure execution boundaries still required before remote AI actions |
| D-009 | **Closed 2026-10-11** | Which client/provider is the first supported end-to-end tool caller? | **Claude, via a custom remote MCP connector with a static `Authorization: Bearer` header.** Verified live: full `initialize` / `tools/list` / `tools/call` handshake and a complete multi-page browser workflow. Remaining providers are optional adapters (F-01). |
| D-010 | **Closed 2026-10-11** | Gateway deployment, costs, credential handling and privacy model | **Tailscale Funnel over a loopback-bound Node gateway.** Public HTTPS with trusted TLS, no hosting account, no router changes, no recurring cost. Three distinct local secrets (MCP caller, device, demo login); none leave the Mac. |
| D-014 | **Open risk, accepted for prototype** | Userscripts (quoid) is a single point of failure for the iPad path | GPL-3.0 and not archived, but **App Store-only distribution with no sideload or version pinning**, effectively one maintainer, and in `v5.0.0-beta.*` since 2026-01 with the last substantive commit 2026-05-10 (verified 2026-10-11). Accepted because `src/core.js` is deliberately host-agnostic and portable to a native Safari WebExtension (F-01), which is the named fallback if Userscripts becomes unavailable. |
| D-015 | **Open** | MCP protocol version target | Claude requested `2026-07-28`; the gateway advertises `2025-11-25` and returned 400, after which the client renegotiated successfully. Non-fatal, but the compatibility target should be reviewed deliberately rather than loosened. Do not widen version validation without testing. |
| D-016 | **Open** | Human approval latency vs. command timeout | Measured 3.2 s–14.9 s to approve a click against a 25 s `commandTimeoutMs`. A timeout returns "outcome uncertain", the one class that cannot be safely retried. Needs an iPad measurement before D2 acceptance; consider separating approval wait from execution timeout. |
| D-011 | Agreed | Manual copy/paste bridge is only a diagnostic path, never MVP completion | Does not meet natural-language browser automation requirement |
| D-012 | Agreed | This repository is the single project home | SearchingFool/Safari-ai-agent; no duplicate repo |
| D-013 | Agreed | Stop repeated open-ended research; verify only decisions that block current work | Link new research to specific FR or B-phase task |

### Next checkpoint

B1 and the transport architecture are now settled (D-009, D-010), but **on macOS Safari, not on the iPad**. The next checkpoint is to repeat the same workflow on the physical iPad and measure what changes there: Userscripts extension permissions, tab suspension and backgrounding, approval-dialog latency (D-016), and reconnection after navigation. Until that is recorded, B2-01 and D2-01 stay open and the MVP is not accepted. Any alternative requiring external paid API usage must still be approved before implementation.
