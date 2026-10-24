# Status Tracker: ChatGPT Path C Safari Agent

**File:** `poc-chatgpt/docs/STATUS-TRACKER.md`
**Status:** Active Tracking Ledger
**Last Updated:** 2026-10-25

---

## 1. Acceptance Gates & Success Criteria

| Gate | Target Capability | Verification Method | Status |
| :--- | :--- | :--- | :---: |
| **Gate 1** | **Sign in with ChatGPT + Responses API Access**<br/>• OIDC PKCE flow works<br/>• Scope `chatgpt.tokens.use.direct` is issued<br/>• `/v1/responses` streams on ChatGPT Plus/Pro plan | Run `node poc-chatgpt/spike/oauth_login.mjs`<br/>Run `node poc-chatgpt/spike/responses_stream_test.mjs` | 🟡 Ready for User Auth |
| **Gate 2** | **Multi-Turn DOM Tool Loop**<br/>• DOM serialized into compact `e1..eN` tokens<br/>• Model outputs structured tool call<br/>• Tool output fed back into agent loop | Run `node poc-chatgpt/spike/run_agent_loop.mjs` against mock form | ✅ Code Complete & Testable |
| **Gate 3** | **Safari Web Extension on iOS/macOS**<br/>• Manifest V3 bundle runs in Safari<br/>• UI trigger inside Safari toolbar<br/>• Direct content script execution on active tab | Load unpacked extension in Safari;<br/>Run test journey on demo page | ✅ Scaffolding Complete |

---

## 2. Work Packages (WP) Breakdown

### [WP01] Workspace Scaffolding & Documentation ✅
- [x] Create directory structure `poc-chatgpt/{docs,spike,engine,web-extension,tests}`
- [x] Author canonical [ARCHITECTURE.md](ARCHITECTURE.md)
- [x] Author technical [DESIGN.md](DESIGN.md)
- [x] Author status tracker [STATUS-TRACKER.md](STATUS-TRACKER.md)

### [WP02] OAuth PKCE Authentication Spike ✅ (Auth Ready)
- [x] Author `poc-chatgpt/spike/oauth_login.mjs` with PKCE generation and ephemeral callback listener
- [x] Secure token storage with `.gitignore` and `0600` permissions on `.env.chatgpt-token`
- [ ] User interactive run: `node poc-chatgpt/spike/oauth_login.mjs` with personal ChatGPT Plus/Pro account

### [WP03] Responses API Streaming Spike ✅
- [x] Author `poc-chatgpt/spike/responses_stream_test.mjs`
- [x] Stream tool definitions (`browser_inspect`, `browser_click`, `browser_fill`) to `https://api.openai.com/v1/responses`
- [x] Implement robust SSE chunk parsing for function call delta frames

### [WP04] Standalone DOM Engine & Bridge ✅
- [x] Author `poc-chatgpt/engine/dom_content.js` (DOM cleaner, ID assigner, synthetic action dispatcher)
- [x] Author `poc-chatgpt/engine/dom_bridge.mjs` (system prompt formatter and user message builder)
- [x] Implement sensitive field masking regex for password/cvv/ssn fields

### [WP05] Multi-Turn Agent Loop Coordinator ✅
- [x] Author `poc-chatgpt/spike/run_agent_loop.mjs` with simulated browser DOM feedback loop
- [x] Test multi-turn feedback loop (Inspect → Reason → Action → Fresh DOM → Completion)

### [WP06] Safari Web Extension Scaffold (Manifest V3) ✅
- [x] Author `web-extension/manifest.json` (Safari MV3 compatible)
- [x] Author `web-extension/popup/` (interactive trigger, login button, real-time activity log)
- [x] Author `web-extension/scripts/content.js` & `background.js` (messaging bridge to DOM engine)
- [x] Author `tests/verify_loop.mjs` smoke test harness

---

## 3. Evidence Log

| Date | WP | Test / Action | Outcome & Evidence |
| :--- | :---: | :--- | :--- |
| 2026-10-25 | WP01 | Scaffolding & Docs | Architecture, technical design, and tracker committed. |
| 2026-10-25 | WP02 | PKCE OAuth Spike | `oauth_login.mjs` authored with S256 challenge, state check, and local token persistence. |
| 2026-10-25 | WP03 | Streaming Responses API | `responses_stream_test.mjs` authored with SSE stream parser and tool schemas. |
| 2026-10-25 | WP04 | DOM Engine | `dom_content.js` authored with sensitive input protection and monotonic ref mapping. |
| 2026-10-25 | WP05 | Agent Loop Coordinator | `run_agent_loop.mjs` authored with multi-turn tool response handling. |
| 2026-10-25 | WP06 | Safari Web Extension | Manifest V3 bundle (popup, content script, background service worker) scaffolded. |
