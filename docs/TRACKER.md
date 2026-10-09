# Safari AI Agent — Delivery tracker

Updated: 2026-10-09 | This tracker tracks implementation evidence, not ideas.

**Current focus:** Deploy a trusted HTTPS MCP endpoint, connect an eligible Claude account, and complete real iPad Safari device acceptance. Gateway and browser bridge implemented in v0.2 development branch; live B1/B2/D acceptance **not confirmed**. Do not count synthetic Chromium and mock-GM tests as actual iPad or subscription validation.

**Authoritative project documents:** [Product requirements](PRODUCT_REQUIREMENTS.md) · [Implementation plan](IMPLEMENTATION_PLAN.md) · [Decision log](DECISIONS.md).

## Versions and release meaning

- **0.1.1 — Manual browser-action prototype:** implemented and merged; unit/Chromium tests passed. User reports that form manipulation seems to work on iPad; complete iPad regression evidence has not yet been recorded.
- **End-to-end MVP — Not implemented:** AI client -> supported tool integration/MCP -> iPad Safari DOM executor -> verified result, through a real multi-page workflow.
- **Post-MVP — General governance harness:** configurable policy, approval profiles, capability leases, budgets, detailed audit and extensive adversarial protections. **Not implemented and intentionally outside initial MVP**, while basic authorization/approvals for any remote execution remain mandatory.

## Delivery milestones

| ID | Work package | State | Blocking dependency | Exit evidence |
|---|---|---|---|---|
| A-01 | Page snapshots, references and actions | Done in 0.1.1 | None | Existing merged code and Chromium tests |
| A-02 | Time inputs and field constraints | Done in 0.1.1 | A-01 | Browser regression tests; user retest recommended |
| A-03 | iPad Safari acceptance checklist | Partially observed, open | A-01/A-02 | Recorded inspect/fill/click/navigate/permission tests on actual iPad |
| B1-01 | Supported AI-client custom-tool/MCP feasibility | **Next** | None | Actual tool invocation from user's eligible iPad AI account |
| B1-02 | Subscription entitlement, terms and costs | Open | B1-01 | Verified supported subscription or approved alternative; no guessed billing |
| B2-01 | Foreground iPad outbound transport and lifecycle | Open | A-03; initial tool contract | Command response, navigation, suspend and resume results |
| C1-01 | Versioned browser tool contract and errors | Open | B1/B2 findings | Schemas and contract tests |
| C2-01 | Authenticated MCP gateway/session routing | Open | B1-01, C1-01 | Tool-call round-trip through approved gateway |
| C3-01 | Userscripts transport adapter | Open | B2-01, C1-01, C2-01 | Pairing and authorized observation/action in Safari |
| C4-01 | **Minimum MVP safety gate**, not full harness | Open | C1-01, C3-01 | Allowlisted origins/actions; expiring, replay-safe requests; submission confirmation |
| D1-01 | Model-driven observe/act/verify and navigation recovery | Open | C2, C3, C4 | End-to-end safe multi-page task without manual copy/paste |
| D2-01 | Device acceptance, regression, documented limits | Open | D1-01 | All MVP release criteria in PRODUCT_REQUIREMENTS met |
| E-01 | **Separate post-MVP governance harness** | Deferred | MVP acceptance | Independently specified policy and capability-lease milestone |
| F-01 | Additional provider adapters and native packaging | Future | MVP acceptance | Independently verified adapters and Safari packaging |

## Current blockers and decisions to close

1. Is a supported custom MCP/tool caller available in at least **one** of the user's actual subscription-backed iPad AI clients? This has not been demonstrated yet.
2. Is a secure remotely reachable gateway required, and what does it cost? Need proof, not assumption.
3. What can a foreground Userscripts page reliably send/receive across navigation and Safari suspension? Requires device tests.

If B1 fails, record a decision and seek approval for one alternative: supported API billing, a different tool client, an optional Mac-hosted agent, or an adjusted requirement. **Do not quietly redefine the MVP as manual copy/paste.**

## Development discipline

Each implementation PR must identify FR IDs, work-package IDs, expected acceptance, performed tests, and affected decisions. Keep at most one current critical-path priority while pursuing genuinely independent parallel tests. Research only to close documented blockers.

## Preserved historical task mapping

Original `M1-1`–`M1-6` work is covered by A-01/A-02/A-03. Former `M2-1`–`M2-4` map to B2/C1/C2/C3 and future packaging. Former `M3-1`–`M3-4` map to B1 and D1. Original `M2-G1`–`M2-G4` described early governance ideas; the basic mandatory authorization controls are now C4 while the **configurable full harness is E-01 after MVP**, reflecting the user's scope decision. Former `M4` adversarial and recovery work is split between MVP C4/D2 acceptance and later E hardening.

## Known limits (existing 0.1.1)

- No external command listener or provider integration exists today.
- Snapshot collects bounded page text (potentially sensitive) but omits input values; this does not make it safe to send to an unapproved service.
- Element references can go stale; synthetic clicks may fail on protected/complex controls.
- Safari website permissions and foreground execution constrain actions. Chromium success is not proof of iPad Safari behavior.
- Apple Developer membership and native WebExtension packaging are deferred.

## 2026-10-09 B1–D implementation evidence

- **Implemented:** MCP gateway, authenticated single-device command queue, allowlisted origins, command timeout/cancellation/replay rejection, seven browser tools, remote Userscripts script using isolated GM APIs, explicit site opt-in, confirmation prompts, block of consequential clicks, same-origin navigation with dispatch-only acknowledgement.
- **Passed locally:** `npm run check` (10 automated gateway/build tests) and Chromium manual/remote smoke suites (the remote test uses a mock GM API); no extra inference API billing.
- **Still blocked:** public HTTPS gateway deployment, actual Claude custom connector authentication/entitlement, iPad GM network/permission/lifecycle proof, live multi-page AI task, external security audit and ten-run reliability measurements.
- **Supporting details:** [MCP_INTEGRATION.md](MCP_INTEGRATION.md), [B1_D_STATUS.md](B1_D_STATUS.md).
- **Release decision:** **not ready for end-to-end iPad user acceptance**; do not tag the AI MVP as released.

## 2026-10-09 additional B1–D hardening and acceptance evidence

- Implemented explicit /device/disconnect server-side revocation on Stop, MCP transport protocol/content-type validation, a public inert two-page /demo workflow, Docker gateway packaging and a non-destructive HTTPS MCP deployment checker.
- Automated local validation: **13/13 Node tests pass**; 3 Chromium suites pass, including a real authenticated MCP HTTP-to-DOM roundtrip using a mocked GM transport.
- GitHub CI now runs a separate Playwright browser-integration job, including a true navigated two-page scenario where CI permits networking. CI results must be checked before merge.
- Actual iPad Claude connection, public HTTPS deployment, device-specific lifecycle and ten-run reliability **remain blocked on external account/device access**. Do not mark D2 accepted.
- Release evidence and prerequisites: [B1_D_STATUS.md](B1_D_STATUS.md), [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
