# Safari AI Agent

**Integration candidate — Claude/iPad workflow proven; final reliability and security acceptance remain open.**

**Status as of 2026-11-09: controlled pilot candidate, not accepted product.** The tracker records
physical iPad workflow, approval, policy refusal, form-fill, and control-panel evidence from
2026-11-05. The ten-run reliability protocol and independent security review remain open; the
owner has not accepted the full MVP. The current remote userscript is **0.2.5**. Tailscale Funnel
is the tested gateway path; the setup guide's other tunnel references are untested and are not
supported setup procedures. No versioned pilot release has been published.

An iPad-first browser automation project under SearchingFool. A user asks a supported AI assistant to inspect, search, navigate, fill and interact with ordinary webpages in Safari; an independently constrained Userscripts bridge executes the approved actions. No iPad-local LLM or Apple Developer membership is required for the Userscripts prototype.

## Risks you must understand before you start

This software lets an AI assistant click and type inside a browser where **you are already logged in**. Read this section in full. It is not boilerplate.

### 1. Web pages you inspect are sent to the AI provider

When the agent looks at a page, that page's visible text goes to the AI company's servers. If you are signed in, that can include your name, your email address, your feed, your messages, your documents. Input values and password fields are deliberately excluded, but **everything else you can see, it can see**.

**Only use this on pages you would be comfortable pasting into a chat window.**

### 2. The agent acts as you, and the website cannot tell

It uses your existing browser session — your cookies, your login. The website has no idea an agent is involved; it sees you. There is no server-side permission check anywhere, and the site's audit log will record your name, not the agent's.

This differs fundamentally from a normal integration, where a service checks a token it issued and can refuse. **Your website permissions and approvals authorize the agent to act in your session.** Full permission executes recognised navigation and page interactions without an individual prompt; submissions, data changes and unclear controls still ask. Classification cannot prove what a website's JavaScript will do.

### 3. Web pages can try to hijack the agent

A malicious page can embed instructions aimed at the AI rather than at you — "prompt injection". The agent reads the page, and the page tries to give it orders.

Reading across websites broadens the content that can enter the AI conversation. A read-only page can contain instructions that influence a later action on a trusted website in the same conversation. Per-site action permissions and local approval remain enforced, but they do not remove those instructions from the model's context.

This is the single biggest unsolved risk for every AI browser agent, including well-funded commercial ones. In March 2026 a zero-click vulnerability was found in Anthropic's own Chrome extension that let a visited page take control. It was patched — but **assume this project has undiscovered holes too.** It has had no security review.

### 4. Approval fatigue is a real failure mode

Ask mode prompts before each action. Full permission avoids prompts for recognised navigation and page interactions. The remaining prompts name the target and action category. **Read them before approving.** “Always allow this button on this page” saves a control-specific approval in isolated Userscripts storage; revoke saved approvals in Remote AI. Stop cancels execution and disconnects; it does not erase those saved preferences.

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

## How it fits together

Three pieces. **Everything runs on your Mac and your iPad except the model itself.**

```mermaid
flowchart LR
    subgraph IPAD["iPad"]
        C["Claude app<br/>you type here"]
        B["Safari + Userscripts<br/>the bridge"]
    end
    subgraph MAC["Mac — must be awake and logged in"]
        G["gateway<br/>tools, policy, approvals"]
        P["control panel<br/>Start / Stop"]
    end
    AI["Anthropic<br/>off-device"]
    SITE["the website<br/>your logged-in session"]

    C -->|"your request"| AI
    AI -->|"public HTTPS"| G
    B -->|"polls over your tailnet"| G
    B -->|"acts as you"| SITE
    G -->|"page text + result"| AI
    B -.->|"Start/Stop"| P

    classDef mac fill:#e6f0ff,stroke:#2c5aa0
    classDef ipad fill:#e8f8e8,stroke:#2e7d32
    classDef off fill:#ffe6e6,stroke:#c0392b
    class G,P mac
    class C,B ipad
    class AI,SITE off
```

**Full detail, with every hop and what authenticates it:**
[Architecture and data flow](docs/ARCHITECTURE-DATAFLOW.md).

## What is required, what is optional, and what Tailscale gives you

**The remote AI provider must be able to reach the gateway over public HTTPS.** The gateway can
run on a computer or server you control; the tested setup in this repository runs it on a Mac.
The iPad does not need to join the host's private VPN.

| | Required? | Why |
|---|---|---|
| **A public address with a trusted TLS certificate** | **Yes** | The remote MCP client runs outside your private network and must reach the gateway. |
| **A gateway host that stays online** | **Yes** | The gateway must run while the user works. The documented controller and acceptance evidence currently target macOS. |
| **A private network (VPN) between your own devices** | **No — optional** | Your iPad reaches the gateway over the *same public address*. The **device token** is what authenticates it, not the network. |
| **Tailscale specifically** | **No, but it is the tested route** | The supplied Mac controller and setup script use Tailscale Funnel. Other tunnel options need manual setup and have not been tested with this product. |

### Why the VPN is optional, stated plainly

Because the gateway is published publicly, **the device token works from anywhere.** Taking a
device off your private network does **not** revoke its access — only
[rotating the token](docs/SETUP-GUIDE.md) does. This is important when passing a device on; see
[device lifecycle](docs/DEVICE-LIFECYCLE.md).

A VPN is still worth having as a second layer, and there is **one place it genuinely belongs**:
the **Start/Stop control panel** is used only by your own devices — Anthropic never touches it —
so it does not need to be public at all.

### What Tailscale is actually doing

Two separate jobs that happen to arrive in one app:

| Tailscale feature | What it gives you | Could something else do it? |
|---|---|---|
| **Funnel** | A **public** HTTPS address with a real, trusted certificate — no domain to buy, no router to configure, no certificate to renew, no hosting bill | Other tunnels can publish HTTPS, but their requirements and limits differ; see the untested options in the [setup guide](docs/SETUP-GUIDE.md#other-vpn-and-tunnel-options-not-tested). |
| **The tailnet** | A private path between your Mac, iPad and phone | Yes: WireGuard, OpenVPN, ZeroTier — or just the same Wi-Fi |

**A VPN alone is not a substitute.** Swap Tailscale for plain WireGuard and your iPad still works,
but **Claude stops entirely** — there is no longer a public address for Anthropic to call. Public
ingress and a VPN are different capabilities; Tailscale just happens to do both.

**The browser bridge and MCP gateway protocol do not depend on Tailscale.** The supplied Mac
controller and launcher do: they discover a Tailscale hostname, start and stop Funnel, and build
the control-panel URLs from that hostname. An alternative tunnel therefore needs a manually
configured public gateway URL and may need a separate control-panel route; it is not managed by
the supplied Start/Stop controller. Tunnel choice does not change the browser permission model.

> **Want no public gateway address at all?** No VPN or tunnel option provides that for this
> architecture: the remote MCP client still has to reach the gateway. The Swift browser-host
> alternative is also designed to use the existing gateway, so it does not currently remove this
> requirement. See [the Swift path status](docs/SWIFT-APP-DESIGN.md).

## Installing it — start here if you are new

**For the tested path you need:** a **Mac** (macOS 12+, awake and online) · an **iPad** (iPadOS 15.1+) ·
**[Tailscale](https://tailscale.com)** on the **Mac** (the iPad may use the public HTTPS route without joining the tailnet) ·
a **Claude account** that supports custom connectors · **Node.js 22+** on the Mac for the documented
pilot setup and quality-check gate ·
about **30 minutes**.

The Tailscale setup is the only end-to-end documented host-and-tunnel procedure. The gateway
could be hosted elsewhere, but the owner must provide a public HTTPS MCP endpoint and configure
the host, credentials, origin policy and lifecycle themselves. VPNs that only connect private
devices do not make the gateway reachable to Claude. See the setup guide's [untested tunnel
options](docs/SETUP-GUIDE.md#other-vpn-and-tunnel-options-not-tested) before choosing a different
host or tunnel.

**Read the risks above first**, then follow **[the setup guide](docs/SETUP-GUIDE.md)** — it is
written step by step for non-technical users and names which device each step happens on. It
starts by cloning this repo; you do not need anything from here first.

Roughly: **Mac** (get the code, start the gateway) → **Claude** (add a connector) →
**iPad** (install the bridge, pair it).

Once it is running, the gateway serves its own instructions at **`/help`** — open that on the
iPad and follow along there. No password, and it contains no credentials.

### Two ways to start it, once installed


**Read the risks above first.** Then follow **[the setup guide](docs/SETUP-GUIDE.md)**, which is
written step by step for non-technical users and covers the Mac, Claude and the iPad in order.

| | Route A — control panel *(easier)* | Route B — Terminal |
|---|---|---|
| **Start it** | Double-click **`Safari Gateway.command`** | `bash tools/start-mac-tailscale-test.sh` |
| **Then** | Start/Stop from a web page, including from the iPad | Leave the Terminal window open; closing it stops everything |
| **Good for** | Everyday use | Debugging, or watching the log live |
| **Details** | [Gateway controls](docs/GATEWAY-CONTROLS.md) | [Setup guide](docs/SETUP-GUIDE.md) Part 1 |

**Once the gateway is running it serves its own instructions at `/help`** — open that address on
the iPad and follow along there. No password, and it contains no credentials.

### Updating it later

Nothing updates itself, and the parts are separate — **[setup guide Part 5](docs/SETUP-GUIDE.md)**
covers the code on the Mac, the script on the iPad, and the passwords. A running gateway keeps
using the code it started with, so an update does nothing until you restart it.

### Stuck?

```sh
npm run gateway:status
```

Checks every layer and tells you what to press. In Claude Code or the Claude desktop app,
**`/safari-agent-gateway`** knows the whole lifecycle — install, start, update, rotate — and can
read the gateway log, which tells a wrong password apart from an unreachable server. The error
messages on screen cannot.

## Where to start

- **[Setup guide](docs/SETUP-GUIDE.md) — step-by-step instructions, written for non-technical users. Start here if you just want to use it.**
- **[Device lifecycle](docs/DEVICE-LIFECYCLE.md) — adding an iPad, and removing everything from one before you pass it on, sell it or return it.** The device token is a standing grant to drive a browser and **signing out of iCloud does not remove it**. Read this before pairing a device you will not keep.
- [Product requirements](docs/PRODUCT_REQUIREMENTS.md) — definitive product MVP acceptance criteria.
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md) — phases B1–D, dependencies and release gates.
- [Decision log](docs/DECISIONS.md) — architecture and decisions still requiring real evidence.
- [Swift app design](docs/SWIFT-APP-DESIGN.md) — the alternative path: what is proven, what is not, and the work remaining in the order that wastes least.
- [MCP setup and deployment](docs/MCP_INTEGRATION.md) — exact setup procedure.
- [Release checklist](docs/RELEASE_CHECKLIST.md) — what remains before user acceptance.
- [Execution evidence](docs/B1_D_STATUS.md) and [work tracker](docs/TRACKER.md).

## Existing components

| Component | Function | State |
|---|---|---|
| `scripts/safari-ai-agent.user.js` | Manual **Browser Lab**; no remote AI connection | v0.1.1; previous iPad form testing |
| `scripts/safari-ai-agent-remote.user.js` | Separately installed, opt-in remote Userscripts bridge | **v0.2.5**; automated checks and physical iPad workflow evidence; ten-run reliability is still open |
| `gateway/server.mjs` | Authenticated MCP Streamable HTTP gateway, per-device action queue and authorization | Mac-hosted self-managed gateway; not a managed multi-user service |
| `/demo` and `/demo/product` | Harmless two-page test site served by gateway itself | Test fixture; use for first-run checks |
| `Dockerfile` | Node 22 container gateway, non-root runtime | Created; image build needs Docker-equipped environment |

The gateway exposes seven browser tools: `browser_status`, `browser_inspect`, `browser_fill`, `browser_click`, `browser_navigate`, `browser_verify`, `browser_cancel`. The iPad bridge uses the GM extension APIs in an isolated content-script context; no model credentials or arbitrary model-generated JavaScript reach the webpage. Reading is permitted across websites. Site permissions can restrict the agent to reading, require approval for each action, allow fills, or automatically execute recognised routine actions. Submissions, data changes and unclear actions still ask; payment, account-deletion and credential/security controls are refused. The current remote script is **0.2.5**. There is no automatic script update; the pilot install instructions distinguish the current development artifact from a future versioned release.

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

To test the gateway without any separate hosting, use the [Mac Tailscale Funnel guide](docs/MAC_TAILSCALE_TEST.md) and the launcher `bash tools/start-mac-tailscale-test.sh`. The Mac hosts Node on localhost; Funnel provides the public HTTPS URL needed by Claude's remote MCP connector. Keep credentials on the Mac and use only the harmless demo for initial testing. **Account and iPad acceptance remain unverified.**
