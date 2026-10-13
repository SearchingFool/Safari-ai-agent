# ChatGPT and Gemini on iPad — feasibility research

Verified against official documentation on 2026-10-13. **Research only; no integration implementation plan has been approved.**

Owner facts: Libor has paid ChatGPT and Gemini accounts and both native apps installed on the iPad. Prioritize those subscriptions. Do not purchase services or infer separate API entitlement/billing from a subscription.

| Provider | Official connection mechanism | Current result / remaining check |
|---|---|---|
| Claude | Custom remote MCP connector with fixed Authorization header | Successful real iPad `browser_status` call confirmed in UI and gateway logs on 2026-10-13 |
| ChatGPT | Custom MCP server added as a personal plugin, then installed/invoked in a conversation | Official setup is documented for the web. Native iPad use and the owner's account controls remain unverified. Listed authentication choices are OAuth, no auth, or mixed; the documented “static credentials” are in OAuth context and are not proof our fixed bearer header is supported |
| Gemini | Custom Connected App linked to an MCP server in the web app; then usable in mobile/web | The official article currently limits this to English, US adults, personal accounts, and Keep Activity on. Account/region availability and native iPad behavior must be checked before proposing implementation |

OpenAI documents streaming HTTP and read/write tools. We can reuse the existing seven-tool contract in principle; this is an architectural inference, not a certified connection. Never remove gateway authentication to fit the no-auth option. An OAuth adapter would be a separate approval-required plan. [Official OpenAI custom MCP documentation](https://developers.openai.com/api/docs/guides/custom-mcp-server), [plugin connection/testing](https://developers.openai.com/plugins/deploy/connect-chatgpt).

Google documents web registration, mobile use after connection, and an advanced credentials flow when Dynamic Client Registration is unavailable. It does not establish that the current Claude-style bearer-header setup works unchanged. The US limitation may block the owner's current account/location; do not change region or bypass eligibility. [Official Gemini custom-app instructions](https://support.google.com/gemini/answer/17209137?hl=en-12), [iPhone/iPad Connected Apps guidance](https://support.google.com/gemini/answer/13695044?co=GENIE.Platform%3DiOS&hl=en).

## Candidate next work — not an approved execution plan

1. Finish owner-side acceptance of the current control UI/read-everywhere change.
2. Inspect the owner's actual ChatGPT and Gemini account UIs on iPad/web; record plan name, available custom connection fields and exact authentication choices without sharing secrets.
3. Produce one scoped compatibility proposal per eligible provider. Include authentication, protocol negotiation, account limitations and native-app versus Safari usage. Obtain Libor's approval before any implementation or account changes.
4. Only after approval, test discovery, `browser_status`, inspection, a harmless demo action, denial/cancellation and Safari suspension. Keep subscription usage and API billing separate.

Fleet coordination: codex-01 owns the current controls/read-everywhere change. Claude Code peer review and any next work must use the shared mailbox and current tracker. Neither agent may assign an unapproved implementation to the other.
