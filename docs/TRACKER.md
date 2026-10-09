# Safari AI Agent work tracker

Updated: 2026-10-09. Acceptance is based on automated tests plus required device testing, not assumptions.

## Scope

Build an iPad Safari webpage automation layer that can later be driven by provider-independent AI agents. First validate the low-level behavior in Userscripts without a developer membership.

| ID | Task | Status | Depends on | Acceptance |
|---|---|---|---|---|
| M1-1 | Shared DOM snapshot and element references | Implemented | None | Real page inspected, sensitive input values absent |
| M1-2 | Fill, click, highlight, navigate | Implemented | M1-1 | Local smoke test succeeds |
| M1-3 | Manual Userscripts test panel and bundling | Implemented | M1-1, M1-2 | Self-contained `.user.js` loads without remote dependencies |
| M1-4 | Automated checks and demo fixture | Implemented | M1-1 to M1-3 | Unit/build and Chromium tests pass |
| M1-6 | Time input format and HTML validity constraints | Implemented; iPad confirmation pending | M1-2 | Accept `14:30` on HTTPBin; reject malformed, out-of-range and non-step values without changing prior time |
| M1-5 | iPad Safari functional acceptance | **Pending device testing** | M1-1 to M1-4 | All actions demonstrated in Userscripts on iPad |
| M2-1 | Versioned browser capabilities contract | Planned | M1-5 | Schema, permissions and version negotiation documented/tested |
| M2-2 | Workflow persistence across page loads | Planned | M2-1 | Resume safely after navigation and browser suspension |
| M2-G1 | Basic governance policy contract (separate follow-on milestone) | Planned | M2-1 | Versioned policy with explicit allow/deny, site and action scopes, default deny for AI |
| M2-G2 | Deterministic action authorization and approval binding | Planned | M2-G1 | Independent policy check before every AI action, human approval for high-impact operations, expiring task-scoped approval |
| M2-G3 | Audit, quotas and safe interruption | Planned | M2-G2, M2-2 | Local audit events, budgets, timeout, cancellation, and conservative restart policy |
| M2-G4 | Untrusted webpage and prompt-injection tests | Planned | M2-G2 | Website text cannot expand agent authority, approvals or permitted targets |
| M2-3 | Secure external agent transport | Planned | M2-1, M2-G2 | Authenticated, scoped, replay-resistant command flow enforced at execution |
| M2-4 | WebExtension distribution | Planned | M1-5 | Native WebExtension permission/lifecycle tests |
| M3-1 | ChatGPT provider feasibility test | Planned | M2-3 | Validated subscription authorization for eligible accounts |
| M3-2 | Claude MCP connector feasibility | Planned | M2-3 | Supported connector executes approved tool calls |
| M3-3 | Gemini integration feasibility | Planned | M2-3 | Eligibility, supported interface and billing verified |
| M3-4 | Model-driven observe-act-verify | Planned | M2-1, M2-3, provider | Multi-step test site flow reaches correct verified state |
| M4-1 | Injection, permissions and negative tests | Planned | M2-3 | Hostile content cannot bypass policy |
| M4-2 | Multi-page reliability and recovery | Planned | M2-2, M3-4 | Tested failure/retry strategy; no duplicate submissions |

## Concurrency

After M1-5, M2-1 contract design can proceed in parallel with evaluating provider authentication (M3-1 to M3-3) and research on Safari packaging. M2-2 and M2-3 should implement against a reviewed M2-1 contract. AI-driven automation (M3-4) depends on transport, all baseline M2-G1/G2 governance gates, and at least one validated provider. M2-G1 can be designed after M2-1 while M2-2 persistence and M3 provider feasibility analysis proceed in parallel. Baseline governance is **not** part of the current manual Userscripts MVP.

## Known risk and deliberate restrictions

- Only user-initiated local actions are available; **no remote command listener** is installed.
- Snapshot contains up to 2,000 characters of rendered page text and 100 visible interactive elements. It may include sensitive *page text* even though form values are excluded.
- Permission to inject into a website is distinct from permission for an AI to operate it.
- A manual confirmation is not a general security policy. A separate deterministic governance harness is mandatory before remote AI control; it is explicitly deferred until Milestone 2.
- Browser-driven synthetic events may not work on all websites, especially complex editors, browser-native dialogs and protected actions.
- Device acceptance must happen on the user's actual iPad; automated Chromium results do not prove Safari compatibility.
- Paid Apple developer enrollment is deferred; native Safari extension packaging/testing requires revisiting signing options.
