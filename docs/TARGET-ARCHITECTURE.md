# Target architecture

**File:** docs/TARGET-ARCHITECTURE.md
**Description:** Where this project is going and why — the stated goal (Claude-in-Chrome-equivalent capability on Safari, extended to Codex, Antigravity and local models), what Safari actually permits, the gap against the reference implementation, and the phasing to close it.
**Author:** Claude Code (Opus 5), acting as fleet lead
**Created:** 2026-10-11
**Last Updated:** 2026-10-24
**Last Updated By:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04, D-047)

---

## The goal, stated

Deliver what Claude in Chrome and Codex's browser connector provide — an AI assistant that can read and operate ordinary web pages — **on Safari**, and extend it to **Codex, Antigravity and local models**. Claude first, done properly and safely, before breadth.

## Why this project exists at all

Verified 2026-10-11:

- Apple ships an official **Safari MCP server** (`safaridriver --mcp`, 17 tools, Safari 27 / STP 247) — **macOS only**.
- The community `safari-mcp` offers ~98 tools via AppleScript against the real logged-in Safari — **macOS only**.
- `safaridriver` and AppleScript **do not exist on iPadOS**. Nothing ships for iPad.

**On macOS this project is redundant.** Apple's own tooling is better. **On iPadOS it is the only viable shape** — but for a more precise reason than first recorded here.

> **Corrected 2026-10-11 (D-030).** This section previously claimed "iPadOS cannot spawn local processes, so there can be no local MCP server". That is wrong. An iPadOS app *can* bind a local HTTP server while running. **The real blocker is reachability:** a cloud-hosted model reaches the gateway from the provider's own infrastructure, so the endpoint must be publicly routable. The iPad is behind NAT and Tailscale Funnel is unavailable on iOS, so nothing cloud-hosted can route to an on-iPad server. With an **on-device** model, client and server are both local and the Mac disappears entirely — see D-030.

The macOS testing was a rehearsal. **iPad is the entire point.**

## The decision that constrains everything else

**Because the goal is provider independence, the safety model cannot live in the client.**

Claude in Chrome's protections — three approval modes, two injection classifiers, semantic hard blocks, financial-site gating — are *Anthropic's client-side machinery*. Codex will not have them. Antigravity will not. A local model certainly will not.

So any safety inherited from Claude evaporates the moment another client is pointed at the same gateway. **Everything protective must live in our layer: the bridge and the gateway.** This is forced by the goal, not chosen.

## Where enforcement sits today

```
Anthropic servers    connector "ask"        ← client-specific, cannot be relied on
        │
Tailscale Funnel     (pipe, no gates)
        │
Mac gateway          bearer token, origin allowlist,
                     one-in-flight, 25s timeout      ← ours, provider-neutral
        │            (no knowledge of what a control IS)
        │
Safari tab           risk classification,
                     approval prompt                 ← ours, but least trustworthy context
        │
   the web page
```

The split is deliberate: only code in the page can see that a button is a form submit, so classification must happen there. But a page is the least trustworthy place to enforce anything, so the gateway keeps independent gates that do not depend on the browser behaving.

**Unresolved:** policy currently ships *inside* the userscript, so changing it means reinstalling on every device. Either the gateway delivers policy (central control, must trust the gateway) or it stays baked in (tamper-resistant, redeploy per change). This blocks D-019, D-020 and D-021.

## What Safari actually permits

| Capability | Userscripts (today) | Native Safari Web Extension | Claude in Chrome |
|---|---|---|---|
| Act in the foreground tab | yes | yes | yes |
| Background / unattended | **no** | partial (iOS lifecycle limits) | yes |
| Open / close / switch tabs | **no** | yes | yes |
| Screenshots (vision input) | **no** | yes | yes |
| Trustworthy own UI | **no** — injects into the page | yes | yes |
| Real permission model | **no** — GM storage keyed on origin | yes (`host_permissions`) | yes |
| Apple Developer membership | not needed | **needed to ship** | n/a |

**Userscripts reaches roughly 60–70% and then stops.** Tabs, background, screenshots and a trustworthy UI surface all require a native extension.

**Therefore F-01 is promoted from "Future" to required** (D-024). `src/core.js` was deliberately written host-agnostic, so the DOM engine survives the move; the bridge and panel are rewritten.

## Gap against the reference implementation

| | Claude in Chrome | Here | Decision |
|---|---|---|---|
| Approval granularity | once / this site / deny, revocable | one prompt, every time | D-021 |
| Hard blocks | semantic categories | one English regex, fails open | D-019 |
| Injection defence | 2 classifiers + RL training | **none** | open |
| Always-confirm classes | downloads, sensitive input, auth grants | no such concept | D-019 |
| Site risk tiering | financial, adult, pirated | flat allowlist | D-020 |
| Security review | audited, pentested | **none** | open |

Narrow areas where this design is stronger: no arbitrary model-supplied code (seven fixed verbs); a stricter *default* (human-gated every action, where Chrome's default is classifier-gated auto-approval); and no screenshots — bounded text only, input values and password fields excluded.

Sobering benchmark: **ShadowPrompt** (March 2026) was a zero-click full-browser compromise in Anthropic's own Chrome extension, via origin trust plus a DOM-XSS in a CDN-hosted component. A far better-resourced team shipped a critical hole in this exact product category. **Assume this project has undiscovered ones.** Design so blast radius is bounded by our layer, not by the model behaving well.

## Provider plan

MCP is already the right abstraction and the gateway is already a compliant server. Only transport and auth differ.

| Client | Transport | Auth | Status |
|---|---|---|---|
| Claude | remote MCP over HTTPS | static bearer header | **proven 2026-10-11** |
| Codex | MCP (stdio or HTTP) | local config | spike needed |
| Antigravity | MCP | varies | spike needed |
| Local model | MCP over loopback | none needed | harness needed |

Local models need **no Funnel at all** — loopback only, removing public exposure entirely, and **page text never leaves the device**. That is the strongest privacy position available here and deserves first-class treatment rather than being an afterthought.

## Phasing

**Phase 1 — Claude on Safari, properly gated.** D-022 annotations *(done)*, describe-before-approve *(done)*, session identity D-017/D-023, then approval modes and per-site tiers D-020/D-021. All within Userscripts.

**Phase 2 — provider independence.** stdio transport, Codex and Antigravity connection documented, one local model proven end-to-end on loopback.

**Phase 3 — native Safari Web Extension.** Tabs, background, screenshots, real permission model, trustworthy UI. Needs Apple Developer membership to ship; free provisioning suffices to prove it.

**Phase 4 — classifier-assisted auto-approve.** Only once a local model is in the stack, so classification costs nothing external.

## Two transports, one engine — the Swift alternative (2026-10-24)

> **Design, constraints and remaining work: [SWIFT-APP-DESIGN.md](SWIFT-APP-DESIGN.md).**
> It records why only the browser-host framing is viable, the three hard constraints, and the
> order of work that wastes least. Read it before writing Swift.

Everything above describes **Path A**: Claude → a Mac gateway published over Tailscale Funnel →
a Userscripts bridge inside Safari. On 2026-10-14 a second shape appeared in the repo, and it is
being evaluated **in parallel**, not as a replacement. See [D-047](DECISIONS.md).

**Path B — Swift in-app.** A SwiftUI app holds the model conversation itself over ordinary
outbound HTTPS and drives a **`WKWebView` it owns**. No gateway, no Funnel, no public endpoint,
no Mac in the path.

### Why it is worth evaluating

**⚠ The original reason given here was wrong, and is kept visible rather than quietly deleted.**
This section claimed Path B dissolves **D-029** because Split View "exists because *Safari* is
the app being backgrounded". **It does not dissolve it:** iOS suspends a backgrounded *app* as
readily as a backgrounded *tab*, so the Claude app and the host app would still both have to be
on screen. The only sub-case that disappears is "Safari is foreground but the wrong tab is
showing". See `SWIFT-APP-DESIGN.md` §3.

**It also does not remove the Mac.** Anthropic must reach a public HTTPS endpoint and an iPad
cannot host one, so the gateway, the Funnel, D-045's rig-recovery problem and D-046's exposure
surface all stay. That claim depended on the app calling the model itself, which **D-006 priced
out** — with a valid OAuth token `/v1/messages` returns *"credit balance too low"*. The viable
framing is the app as a **browser host**, where the Claude app is still the client and the
gateway is still in the path.

**What is actually left, and it is still worth having: it retires D-014.** The iPad path depends
entirely on Userscripts — App Store-only, effectively single-maintainer, in beta since 2026-01,
with no fallback transport. That is the project's recorded single point of failure, and a native
web view removes it. Also gained: control over the web view's lifecycle and cookie store, the
possibility of screenshots, and no Safari extension permission model in the way.

It does not change the goal stated at the top of this document. It changes **which process holds
the page**.

### Why it has not replaced anything

**No live model call has ever been made from it,** and under D-006 none will be: a subscription
does not fund direct Messages API calls. The chat spike belongs to the framing that was priced
out. A **second** spike now exists — `Sources/WebViewSpike`, which *does* contain a `WKWebView` —
but **nothing has run on an iPad** and there is **no tool calling**. Path A drove a real Safari
tab through a 17-call workflow on hardware. *A spike that has not driven one page cannot retire
that.*

### The decisive test — two of its three parts are now answered

The test: a `WKWebView` that logs into a real site, **survives an app restart with the session
intact**, and runs `src/core.js` from buttons with **no model involved**.

| Part | Result |
|---|---|
| The data store survives a restart | **YES — D-052**, macOS. Cookies present before any navigation, and **zero** after Clear data, so the store causes it |
| It can log in with a **passkey** | **NO — D-053**, macOS, with Chrome on the same Mac as the control. Bounds Path B to **password-authenticated sites** |
| A real **logged-in** session survives a restart | **not run** — D-052 used ordinary browsing cookies. This is now the decisive one |
| `src/core.js` runs in the web view | **not attempted** |

**Session persistence was the specific risk and it did not materialise.** The risk that did is
**authentication**: if the sites that matter use passkeys, Path B cannot log into them at all,
and Path A is the only option because Safari *is* the browser. That is an operator decision, not
an engineering one.

### What transfers, and what does not

**`src/core.js` transfers.** It is deliberately host-agnostic — the same property that made D-014
an acceptable risk. The page engine is not the thing being rewritten.

**The safety model transfers, and must.** The classification tiers (D-019, D-042), the approval
model (D-021, D-043) and the injection analysis (D-041) are **policy, not transport**. They are
not Userscripts artefacts and Path B does not get a clean slate. **Path B has no safety gate
today** — it is a chat client. Any page-driving work there inherits these decisions or it is a
regression, whatever the architecture diagram says.

**The gateway's enforcement does not transfer for free.** Today the gateway is a second,
independent check that sits outside the browser. In Path B, app and enforcement are the same
process, so a compromise of the app is a compromise of the gate. That is a real loss and it should
be weighed deliberately rather than discovered later.

## Explicitly rejected

**Chasing Chrome parity on Userscripts.** The effort would not buy tabs, background or screenshots. Userscripts is the proving ground — it has been an excellent one — not the destination.

**Relying on the client's safety model.** Defeats the provider-independence goal, as above.

**A gateway-served setup page exposing the device token.** It would let the demo password reveal the device token, collapsing two independent secrets into one.

> **Still rejected, and note it is Path-A-specific.** Path B has no gateway and no device token,
> so this does not constrain it — but the credential-transfer problem it was rejected over remains
> unsolved on Path A (Universal Clipboard needs proximity, so remote setup has no sanctioned
> channel). Do not read Path B as solving that; it sidesteps it by not having the secret.

## Open questions blocking design

1. **Where does policy live** — shipped in the script, or delivered by the gateway?
2. **Product framing** — draft-and-review, read-only research, trusted-site completion, or plan-level approval? The gate design is downstream of this.
3. **D-015** — Claude requested MCP protocol `2026-07-28`; the gateway advertises `2025-11-25`.
4. **D-016** — approval latency measured 3.2–14.9 s against a 25 s timeout; unmeasured on iPad.
