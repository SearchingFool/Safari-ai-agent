# Target architecture

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/docs/TARGET-ARCHITECTURE.md
**Description:** Where this project is going and why — the stated goal (Claude-in-Chrome-equivalent capability on Safari, extended to Codex, Antigravity and local models), what Safari actually permits, the gap against the reference implementation, and the phasing to close it.
**Author:** Claude Code (Opus 5), acting as fleet lead
**Created:** 2026-10-11
**Last Updated:** 2026-10-11
**Last Updated By:** Claude Code (Opus 5)

---

## The goal, stated

Deliver what Claude in Chrome and Codex's browser connector provide — an AI assistant that can read and operate ordinary web pages — **on Safari**, and extend it to **Codex, Antigravity and local models**. Claude first, done properly and safely, before breadth.

## Why this project exists at all

Verified 2026-10-11:

- Apple ships an official **Safari MCP server** (`safaridriver --mcp`, 17 tools, Safari 27 / STP 247) — **macOS only**.
- The community `safari-mcp` offers ~98 tools via AppleScript against the real logged-in Safari — **macOS only**.
- `safaridriver` and AppleScript **do not exist on iPadOS**. Nothing ships for iPad.

**On macOS this project is redundant.** Apple's own tooling is better. **On iPadOS it is the only viable shape**, and for a structural reason: iPadOS cannot spawn local processes, so there can be no local MCP server. An iPad agent *must* reach a remote MCP endpoint — which is exactly the architecture already built and proven.

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

## Explicitly rejected

**Chasing Chrome parity on Userscripts.** The effort would not buy tabs, background or screenshots. Userscripts is the proving ground — it has been an excellent one — not the destination.

**Relying on the client's safety model.** Defeats the provider-independence goal, as above.

**A gateway-served setup page exposing the device token.** It would let the demo password reveal the device token, collapsing two independent secrets into one.

## Open questions blocking design

1. **Where does policy live** — shipped in the script, or delivered by the gateway?
2. **Product framing** — draft-and-review, read-only research, trusted-site completion, or plan-level approval? The gate design is downstream of this.
3. **D-015** — Claude requested MCP protocol `2026-07-28`; the gateway advertises `2025-11-25`.
4. **D-016** — approval latency measured 3.2–14.9 s against a 25 s timeout; unmeasured on iPad.
