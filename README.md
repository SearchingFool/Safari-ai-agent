# Safari AI Agent

**0.2.1 integration candidate — not yet certified for real iPad + Claude use.**

An iPad-first browser automation project under SearchingFool. A user asks a supported AI assistant to inspect, search, navigate, fill and interact with ordinary webpages in Safari; an independently constrained Userscripts bridge executes the approved actions. No iPad-local LLM or Apple Developer membership is required for the Userscripts prototype.

## Where to start

- [Product requirements](docs/PRODUCT_REQUIREMENTS.md) — definitive product MVP acceptance criteria.
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md) — phases B1–D, dependencies and release gates.
- [Decision log](docs/DECISIONS.md) — architecture and decisions still requiring real evidence.
- [MCP setup and deployment](docs/MCP_INTEGRATION.md) — exact setup procedure.
- [Release checklist](docs/RELEASE_CHECKLIST.md) — what remains before user acceptance.
- [Execution evidence](docs/B1_D_STATUS.md) and [work tracker](docs/TRACKER.md).

## Existing components

| Component | Function | State |
|---|---|---|
| `scripts/safari-ai-agent.user.js` | Manual **Browser Lab**; no remote AI connection | v0.1.1; previous iPad form testing |
| `scripts/safari-ai-agent-remote.user.js` | Separately installed, opt-in remote Userscripts bridge | v0.2.1; tested with mocked Userscripts APIs in Chromium |
| `gateway/server.mjs` | Authenticated MCP Streamable HTTP gateway, per-device action queue and authorization | Local HTTP tests passed; not deployed |
| `/demo` and `/demo/product` | Harmless two-page test site served by gateway itself | Tested through gateway; actual Safari flow pending |
| `Dockerfile` | Node 22 container gateway, non-root runtime | Created; image build needs Docker-equipped environment |

The gateway exposes seven browser tools: `browser_status`, `browser_inspect`, `browser_fill`, `browser_click`, `browser_navigate`, `browser_verify`, `browser_cancel`. The iPad bridge uses the GM extension APIs in an isolated content-script context; no model credentials or arbitrary model-generated JavaScript reach the webpage. Clicking requires local approval; consequential controls, cross-site navigation, password filling and real submissions are blocked in this test release.

## Run automated checks

Requirements: Node.js 22+, Python 3.12+, Playwright and Chromium for browser tests. No Node package dependencies.

```sh
npm run check
npm run test:browser
```

GitHub Actions separately runs Node tests and Chromium browser tests, including a full two-page workflow test in an unrestricted CI browser environment. The local gateway-to-DOM test sends actual MCP HTTP requests through the server but mocks Userscripts' privileged GM transport and loads an in-memory fixture because network navigation is restricted in this environment.

## Try after a public HTTPS deployment

1. Configure `MCP_CLIENT_TOKEN`, `DEVICE_TOKEN` (different random secrets), and `SAFARI_ALLOWED_ORIGINS=https://YOUR_HOST` on the deployed gateway, and terminate TLS at the hosting ingress. **Do not post tokens in chat, logs or GitHub.**
2. Verify the public endpoint using `MCP_ENDPOINT=https://YOUR_HOST/mcp npm run check:deployment` with the MCP caller token in a local environment variable.
3. Install the [remote userscript](scripts/safari-ai-agent-remote.user.js) in Userscripts, visit `https://YOUR_HOST/demo`, enter gateway base URL and **device** token, Save and Connect.
4. Add `https://YOUR_HOST/mcp` as a Claude **custom remote MCP connector** and configure a fixed `Authorization: Bearer ...` header holding the distinct **MCP caller** token. These steps require the user's own eligible Claude account.
5. Ask Claude to search for *widget*, open the demo result, fill a fictional name and `14:30`, press *Preview selection*, verify *Preview ready*, and stop without submitting.

See [MCP setup](docs/MCP_INTEGRATION.md) and [release checklist](docs/RELEASE_CHECKLIST.md) for full safeguards and limitations. The same installation is **not** proof that Claude, ChatGPT or Gemini subscription access is active for any specific account.

## Security and scope

Use only on harmless demonstration pages until iPad acceptance and an independent security review. Browser text may contain confidential data and is sent to the connected model when inspected. The optional remote script can be stopped manually; Stop now revokes queued commands at the gateway where reachable. The full configurable governance harness remains a later milestone. **The remote integration is not a general-purpose trusted autonomous browser or an enterprise authorization system.**
