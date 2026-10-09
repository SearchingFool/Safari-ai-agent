# Safari AI Agent — Implementation plan

Status: **Proposed baseline for review** | Updated: 2026-10-09  
Canonical product requirements: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md). Decisions: [DECISIONS.md](DECISIONS.md). Progress: [TRACKER.md](TRACKER.md).

## Release vocabulary

- **Prototype 0.1.1 (existing, not the product MVP):** A manual Userscripts panel. DOM inspect/fill/click/navigate implemented. Automated checks passed; full iPad acceptance remains incomplete.
- **End-to-end MVP (target):** One real AI client, via supported tooling (preferably MCP), performs a supervised, multi-page workflow in iPad Safari without copying tool requests by hand.
- **Post-MVP governance milestone:** Configurable controller policies, capability leases, budgets, richer approvals/audit and comprehensive prompt-injection protection. Minimum action authorization in the MVP is mandatory and is not deferred.

## Work breakdown and dependencies

| Phase | Work package | Depends on | Deliverable / exit test | Status |
|---|---|---|---|---|
| A | Close Userscripts iPad device smoke tests | Existing v0.1.1 | Evidence for snapshot, fill/time, click, navigation and permissions | Partly confirmed by user; complete formal checklist pending |
| B1 | **AI client + subscription + MCP compatibility spike** | None | Actual eligible account invokes harmless authenticated test tool from iPad; record billing limits | **Next critical-path task** |
| B2 | iPad transport/lifecycle spike | A; preliminary tool contract | Foreground command round-trip, page-load resume strategy, network permissions | Not started |
| C1 | Versioned capability contract | A and B1 findings | Schemas for observe/fill/click/navigate/verify, errors, stale refs and authorization | Not started |
| C2 | MCP gateway and task/session routing | B1, C1 | Authenticated remote tool calls to scoped device session; no arbitrary execution | Not started |
| C3 | iPad Userscripts transport adapter | B2, C1, C2 | Paired session, validated commands, result/ack flow, reconnect behavior | Not started |
| C4 | Minimal MVP action enforcement | C1, C3 | Origin/action allowlists, expiry, replay resistance, per-action user approval | Not started |
| D1 | Observe–decide–act–verify workflow and navigation recovery | C2–C4 | AI repeats tool calls and completes a safe multi-page workflow | Not started |
| D2 | Device acceptance and CI integration | D1 | Complete test matrix and recorded actual iPad results | Not started |
| E | Configurable agent-governance harness | MVP accepted | Policy profiles, capability leases, structured audit, risk tiers, injection testing | **Deferred; separate milestone** |
| F | Additional provider adapters and full Safari WebExtension packaging | MVP accepted | Independent client integration and native lifecycle tests | Future |

**Parallel work:** B1 (provider/client capability) and remaining A tests can proceed together. Contract drafting C1 can begin using the existing DOM engine, but its final transport bindings depend on B1/B2. Gateway and userscript adapter can be implemented in parallel after the contract is frozen. The next research work is restricted to B1/B2 blocking questions.

## Phase B1 — Mandatory feasibility test (before committing to a gateway)

1. Identify a provider-supported tool/connector path *on iPad* that can call an arbitrary approved tool. Prioritize existing subscriptions; do not infer this from the presence of native AI apps.
2. Using a harmless MCP echo tool, establish whether the user's account can authenticate and receive a structured result.
3. Check which features/entitlements actually apply (e.g. subscription vs API, quotas, jurisdiction, availability).
4. Record evidence: client/version/account-plan constraints, setup steps, successful invocation, failure states and expected running costs.
5. Choose **one** verified provider for MVP. Remaining providers become optional adapters.

**If B1 fails:** Do not declare MCP or subscription-based AI working. Raise a specific decision to either use a supported paid API, another AI client, a Mac-hosted agent, or change the MVP assumptions. A copy/paste workflow is not a substitute for the end-to-end acceptance criterion.

## Phase B2 — iPad bridge test

Use a purpose-built innocuous test site, not personal production pages. Validate that the foreground userscript can initiate an authorized HTTPS connection, receive a structured action, execute one local action and return its result. Test navigation, Safari tab suspension, page reloads, loss of connectivity, stale references and Safari site permissions. Never put provider secrets in page JavaScript.

## Phase C — Engineering baseline

- **Tool contract:** versioned `observe`, `fill`, `click`, `navigate`, `verify`, `get_status`, `cancel`. Schemas should carry session ID, page URL/origin, action ID, expiry, request/response correlation ID and explicit error classification.
- **Transport:** authenticated client-facing MCP gateway with an outbound iPad channel; scoped one-time pairing, TLS, replay prevention. The foreground/paused browser lifecycle is a design input, not a hidden assumption.
- **Execution:** reuse `src/core.js`, preserving the separation between webpage data, model decisions and validated commands. Re-inspect after material DOM changes.
- **Approval:** deny operations beyond explicitly granted site/action scope. Require the user's approval for form submission or consequential actions; when confirmation cannot be obtained, stop.
- **Testing:** harmless fixtures first, negative cases including expired session, wrong origin, malformed command, duplicate action and prompts embedded in webpage content.

## Completion and release gate

The end-to-end MVP ships only when all acceptance tests in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) are evidenced **on the user's actual iPad**, with a working provider integration and no copy/paste bridge. CI and Chromium tests are supporting evidence, not replacements for Safari device testing.

## Process and change control

1. **Single source of truth:** requirements and scope in PRODUCT_REQUIREMENTS; architecture/sequence here; decisions in DECISIONS; implementation state in TRACKER.
2. Before every code change: link it to an FR ID and a work package. Update the tracker with status and test evidence in the same PR.
3. No new provider or architectural pivot based solely on attractive documentation or another general search. Research is tied to an open blocking item and recorded in a dated decision.
4. Work on a branch, verify, then merge; preserve the working 0.1.1 prototype and opt into new network functionality. Never silently introduce billing or expose webpages externally.
5. Maintain a short **Current focus** line in the tracker; close it before starting unrelated features, unless independent work can legitimately proceed in parallel.
