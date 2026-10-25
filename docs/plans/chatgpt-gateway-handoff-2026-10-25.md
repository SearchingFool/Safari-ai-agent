# Separate ChatGPT gateway — handoff

**File:** `docs/plans/chatgpt-gateway-handoff-2026-10-25.md`
**Description:** Owner request, verified compatibility findings and prerequisites for a separate ChatGPT MCP gateway test.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Codex (handoff documentation)
**Created:** 2026-10-25
**Last Updated:** 2026-10-25
**Last Updated By:** Codex

## Owner direction and present state

Owner first requested read-only investigation of the existing connector with ChatGPT and Gemini, then instructed: “create a separate gateway for chatgpt as the first test rather than trying to put all into one for now.” This authorizes preparing a separate test; no gateway implementation, authentication adapter, deployment or provider-account change was completed in this session. Existing Claude behavior must remain independent. The later handoff request pauses implementation work in favor of a resumable record.

The proposed architecture is a separate ChatGPT MCP entry point with independent credentials, OAuth configuration and session/queue state, reusing reviewed browser-tool logic. It is not an implemented design. Exact routing, lifecycle and deployment choices need a concrete implementation plan after the checks below. No port reservation or new public mapping was created.

## Verified facts and limits

- Code inspection: `gateway/server.mjs` exposes seven MCP browser tools, accepts fixed bearer authentication and advertises protocol `2025-11-25`; no OAuth authorization service was found. Browser permissions remain in the existing gateway/DOM engine.
- Official OpenAI documentation supports custom MCP tools with read/write actions, streaming HTTP, and OAuth or no-auth connection modes. ChatGPT cannot present arbitrary custom API keys in the documented authenticated flow. Do not treat “static credentials” in OAuth setup as our fixed bearer header. An OAuth integration is the expected adaptation, not a completed connection. [Custom MCP](https://developers.openai.com/api/docs/guides/custom-mcp-server), [authentication](https://developers.openai.com/plugins/build/auth).
- OpenAI documents mobile plugin use subject to account availability. No account UI, native iPad connection or tool call was tested. [Mobile availability](https://learn.chatgpt.com/docs/plugins).
- Google documents custom MCP Connected Apps, web registration and mobile use, but currently requires US location, personal account, English, adult eligibility and Keep Activity. Paid subscription alone does not establish availability. Fixed-token compatibility is unverified. [Google instructions](https://support.google.com/gemini/answer/17209137?co=GENIE.Platform%3DDesktop&hl=en-PR).
- Candidate ports were checked against the device registry and OS listeners and found available at that checkpoint; they remain unallocated. Recheck both sources before selecting or binding any port. Public repository reports deliberately omit operator endpoint details.

## Discoveries the next agent must reconcile

Current main already contains **ChatGPT Path C**, committed by another agent as `9c4d5b1`: `poc-chatgpt/` plus `plans/plan-2026-10-25-chatgpt-poc.yaml`. That is a direct Responses/API and extension experiment, distinct from connecting the ChatGPT app to our MCP server. Its tracker says user authentication remains pending. Authored code is not evidence that subscription/API access or iPad operation succeeds. Inspect it before duplicating work; do not assume its scopes or access claims are established.

The broader repo now has a Swift/WKWebView alternative alongside the gateway path; read `docs/SWIFT-APP-DESIGN.md`, `docs/TARGET-ARCHITECTURE.md` and D-047 through D-052 in `docs/DECISIONS.md`. Main commit `bfd615c` makes F2-01/F3-01 actionable but still proposes the existing gateway. This owner's newer direction prefers a separate ChatGPT gateway for the first test.

Latest recorded lead status explicitly says the old rig was intentionally disabled pending credential rotation (D-046). This is a recorded warning, not a fresh runtime measurement. Verify resolution before restoring or exposing anything; do not copy or print existing secrets. No credentials were rotated by this session.

## Coordination and corrections

Launcher `QUEUECTL_AGENT` is empty. It was not set or invented. The handoff coordination report returns exit 1: `HANDOFF: QUEUECTL_AGENT unset — this session's writes are unattributable.` Reservations were nevertheless accepted with that empty value and verified for these documentation writes. This is a coordination failure, not a pass. Relaunch through the proper wrapper before implementation.

Earlier response overstated that the empty identity categorically blocked all file reservation. The actual tool accepted an empty-identity reservation. The explicitly invoked handoff skill says the compliance report is advisory and does not block the handoff, so documentation/save can be completed while preserving the finding. No security-control rejection was routed around.

The earlier research response also failed to mention the pre-existing Path C work; the broader handoff inspection found it. Resume from current repository facts rather than the narrow initial proposal.

## Next actions, in priority order

1. Relaunch with a real launcher identity; read fleet inbox/status and confirm current owners, the intentional-shutdown/rotation disposition and current main. Distinguish Path C from this MCP-gateway request.
2. In an isolated worktree, prepare the separate gateway plan: OAuth discovery/PKCE and consent, independent browser pairing/queue and credentials, port registry allocation, TLS routing and scoped lifecycle. Verify ChatGPT account availability. Preserve Claude behavior and do not weaken auth. Coordinate decisions and dependency changes with the lead; ask the owner only for concrete choices not covered by authorization.
3. Implement and verify after prerequisites are met. Test OAuth failure/replay/expiry/redirect boundaries, MCP discovery and browser status, then demo-page inspection, routine action, denial and Stop. Run all repo gates and record actual iPad results separately from automated checks. Update trackers/mailboxes at each checkpoint; only the owner accepts D2-01.

## Handoff checks

Documentation changes only. No code tests rerun; historical green results are not a current validation claim. `git diff --check` applies to this handoff. No Mission Control generator, declaration or dashboard was discovered, so generation/count/hash verification is not applicable. No derived documentation root requiring regeneration was found. Implementation/provider acceptance remains deferred. Commit on the isolated handoff branch; the fleet lead integrates main. Full local session save goes in ignored `.llm_sessions/` after the commit exists.
