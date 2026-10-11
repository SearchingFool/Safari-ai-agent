# Safari AI Agent

**0.2.1 integration candidate — not yet certified for real iPad + Claude use.**

An iPad-first browser automation project under SearchingFool. A user asks a supported AI assistant to inspect, search, navigate, fill and interact with ordinary webpages in Safari; an independently constrained Userscripts bridge executes the approved actions. No iPad-local LLM or Apple Developer membership is required for the Userscripts prototype.

## Risks you must understand before you start

This software lets an AI assistant click and type inside a browser where **you are already logged in**. Read this section in full. It is not boilerplate.

### 1. Web pages you inspect are sent to the AI provider

When the agent looks at a page, that page's visible text goes to the AI company's servers. If you are signed in, that can include your name, your email address, your feed, your messages, your documents. Input values and password fields are deliberately excluded, but **everything else you can see, it can see**.

**Only use this on pages you would be comfortable pasting into a chat window.**

### 2. The agent acts as you, and the website cannot tell

It uses your existing browser session — your cookies, your login. The website has no idea an agent is involved; it sees you. There is no server-side permission check anywhere, and the site's audit log will record your name, not the agent's.

This differs fundamentally from a normal integration, where a service checks a token it issued and can refuse. **Here, the only thing standing between the AI and your account is you clicking "allow".**

### 3. Web pages can try to hijack the agent

A malicious page can embed instructions aimed at the AI rather than at you — "prompt injection". The agent reads the page, and the page tries to give it orders.

This is the single biggest unsolved risk for every AI browser agent, including well-funded commercial ones. In March 2026 a zero-click vulnerability was found in Anthropic's own Chrome extension that let a visited page take control. It was patched — but **assume this project has undiscovered holes too.** It has had no security review.

### 4. Approval fatigue is a real failure mode

You approve each click. After the twentieth prompt, people stop reading them. The prompt now names the control — *"Delete account" (submits a form)* rather than *"click e37"* — specifically so a glance is enough. **Still read them.**

### 5. Some actions cannot be undone

Sending, posting, publishing, purchasing, deleting. Certain controls are refused outright and are never offered for approval. But that protection is a work in progress: it is known to be **too strict in places** (it blocks some harmless navigation) and **not strict enough in others** (Like, Follow and Subscribe currently pass through to an ordinary prompt). See `docs/DECISIONS.md` D-019.

### 6. Running the Mac gateway exposes a public web address

The Tailscale Funnel setup makes your Mac reachable from the internet. Both entrances require passwords, and the demo pages are inert — but it is public while it runs. **Stop it when you finish.**

### 7. Known gaps, stated plainly

| | |
|---|---|
| **D-017** | Two connected tabs deadlock with no way out from the interface |
| **D-019** | The blocked-actions list is a keyword match; it misses non-English labels and icon-only buttons |
| **D-023** | A permission prompt can appear in a tab you are not looking at |
| **D-014** | Depends on Userscripts, an App Store-only app with effectively one maintainer |
| — | No security review. No injection defences. Not audited by anyone |

### 8. What this is for

A **prototype for supervised use on pages you trust**, by the person who set it up. It is not a product, not multi-user, and not suitable for anything sensitive, financial or irreversible. Use the bundled `/demo` pages until you understand how it behaves.

## Where to start

- **[Setup guide](docs/SETUP-GUIDE.md) — step-by-step instructions, written for non-technical users. Start here if you just want to use it.**
- **[Device lifecycle](docs/DEVICE-LIFECYCLE.md) — adding an iPad, and removing everything from one before you pass it on, sell it or return it.** The device token is a standing grant to drive a browser and **signing out of iCloud does not remove it**. Read this before pairing a device you will not keep.
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

## Public demo security

The Mac Tailscale test launcher now generates a **third, independent demo password**. The browser challenges for username `safari-demo` and the local `DEMO_PASSWORD` from `.env.mac-tailscale`; unauthenticated requests receive no demo HTML. The MCP and device credentials remain distinct and are never used as browser passwords. This is basic protection for a test site, not complete production hardening. The HTTPS endpoint remains publicly reachable while Funnel runs. If the Mac launcher was already running, stop it before updating code and relaunching.

## Mac + Tailscale live MCP testing

To test the hosted gateway without Verpex, use the [Mac Tailscale Funnel guide](docs/MAC_TAILSCALE_TEST.md) and the launcher `bash tools/start-mac-tailscale-test.sh`. The Mac hosts Node on localhost; Funnel provides the public HTTPS URL needed by Claude's remote MCP connector. Keep credentials on the Mac and use only the harmless demo for initial testing. **Account and iPad acceptance remain unverified.**
