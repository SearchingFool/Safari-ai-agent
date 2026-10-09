# Safari AI Agent — Decision log

Updated: 2026-10-09. Each entry is a project decision or an explicitly unresolved design question. A recommendation is not an already-verified implementation.

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
| D-009 | Open | Which client/provider is the first supported end-to-end tool caller? | B1 compatibility spike; Claude remote MCP is a candidate, **not a confirmed implementation** |
| D-010 | Open | Gateway deployment, costs, credential handling and privacy model | B1/B2 findings before backend construction |
| D-011 | Agreed | Manual copy/paste bridge is only a diagnostic path, never MVP completion | Does not meet natural-language browser automation requirement |
| D-012 | Agreed | This repository is the single project home | SearchingFool/Safari-ai-agent; no duplicate repo |
| D-013 | Agreed | Stop repeated open-ended research; verify only decisions that block current work | Link new research to specific FR or B-phase task |

### Next checkpoint

Confirm B1 with evidence from an **actual eligible AI client on the iPad**, then choose the transport architecture in light of demonstrated capabilities. Any alternative requiring external paid API usage must be approved before implementation.
