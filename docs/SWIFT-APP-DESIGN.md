# Swift app — design, constraints and what remains

**File:** `docs/SWIFT-APP-DESIGN.md` (repo-relative — this repo is public)
**Description:** What the Swift app is for, which of its two possible framings is the viable one and why, what has been proven versus assumed, the three hard constraints that bound it, and the work remaining in the order that wastes least. Written so the next person does not have to re-derive any of it from decision records.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04, D-047/D-052/D-053)
**Created:** 2026-10-25
**Last Updated:** 2026-10-25
**Last Updated By:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04)

---

## 1. Status in one paragraph

An **alternative** to the gateway + Userscripts path, not a replacement for it and not a decided
pivot (D-047). Two spikes exist under `app/llm-chat-spike/`: a chat client that has **never made a
live model call**, and a web-view spike that has now answered two questions on macOS: a session
survives an app restart (**yes**, D-052) and a passkey login works in the web view (**no**,
D-053 — so framing B is bounded to password-authenticated sites). Nothing runs on an iPad. No
decision to migrate has been taken.

## 2. The two framings, and why only one is viable

This is the single most important thing on the page, because the project spent a day describing
the wrong one.

| | **A — the app holds the conversation** | **B — the app is a browser host** |
|---|---|---|
| Who calls the model | our Swift code | **the Claude app** |
| Who pays | **metered API credits** | **the subscription** |
| What it replaces | Claude app + gateway + Safari | **Safari + Userscripts only** |
| Status | **not viable as a default** | **the design** |

**Framing A is priced out by D-006**, which was settled empirically, not argued: with a valid
OAuth token, `GET /v1/models` returned 200 while `POST /v1/messages` returned 400 *"credit balance
too low"*. **Authentication works; inference is unfunded.** A Claude subscription does not pay for
direct Messages API calls, under any auth method.

**The rule that generalises** — and the reason B works: *the subscription pays when **their** app
is the client calling **your** server; **your** code calling **their** model is metered.*

So the app should be a **browser host**:

```
Claude app (subscription) → Anthropic → Mac gateway → the Swift app's WKWebView
```

## 3. What this buys — and what it does not

**Buys: it retires D-014.** The iPad path currently depends entirely on Userscripts — App
Store-only, effectively single-maintainer, in beta since 2026-01, with no fallback transport. That
is the project's recorded single point of failure. A native web view removes it. `src/core.js` is
already host-agnostic by design, which is precisely why D-014 was an acceptable risk in the first
place; the engine ports.

Also gained: real control over the web view's lifecycle and cookie store, the possibility of
screenshots, and no Safari extension permission model in the way.

**Does NOT buy a Split View fix.** D-047 originally claimed it would. That is wrong: **iOS suspends
a backgrounded *app* as readily as a backgrounded *tab*.** The Claude app and the host app would
still both need to be on screen. The only gain is that one sub-case disappears — "Safari is
foreground but the wrong tab is showing" — because the host app has a single view.

**Does NOT remove the Mac.** Anthropic must reach a public HTTPS endpoint, and an iPad cannot host
one. The gateway stays where it is.

**Does NOT improve safety on its own.** The classification tiers (D-019, D-042), approval model
(D-021, D-043) and injection analysis (D-041) are **policy, not transport**. Path B inherits them
or it is a regression. One thing is genuinely *lost*: today the gateway is an independent check
**outside** the browser; in a host app, app and gate are the same process, so compromising the app
compromises the gate. That is a real cost and should be weighed deliberately rather than
discovered.

## 4. The three hard constraints

**Billing (D-006).** Settled. Any design where our code calls the model is metered. This is why
framing B exists.

**Passkeys — MEASURED 2026-10-25, and they do not work (D-053).** It holds. In the spike's
`WKWebView` against `webauthn.io`, `isUserVerifyingPlatformAuthenticatorAvailable()` is **false**
and `navigator.credentials.get()` is rejected in **12 ms with `NotAllowedError` and no prompt**,
with the document focused. **Chrome on the same Mac, same site, reports `true`** — so the refusal
belongs to the web view, not the hardware. The cause is structural: WebAuthn in a third-party
`WKWebView` requires Associated Domains, which requires an `apple-app-site-association` file
served by a domain **you own**, and the operator owns none of the sites in question.

**So framing B is bounded, not dead: it works for password-authenticated sites only.** D-052
already showed the store persists, so a password session should survive a restart; and an
existing session cookie arriving by other means is unaffected, because what is blocked is
performing the ceremony, not being logged in.

**Path A is immune**, because Safari *is* the browser and passkeys work natively. That is an
advantage of the current architecture that appeared on no scorecard until 2026-10-25, and it is
now the deciding factor if the sites that matter use passkeys.

**Split View (D-029).** Accepted as a documented operating limit. Framing B does not lift it.

## 5. What has actually been proven

| Claim | Status |
|---|---|
| A chat client can be built with no dependencies | **proven** — builds, 15/15 tests, Swift 6.4 |
| It can call the model | **never run.** Blocked by D-006 billing |
| `WKWebView` keeps a session across an app restart | **proven on macOS** (D-052), both halves: cookies survived a relaunch, and stopped surviving after Clear data |
| A **logged-in** session survives | **not run.** D-052 used ordinary browsing cookies, not an authenticated session |
| Any of it works on an iPad | **never attempted.** macOS only |
| An in-app web view can authenticate to a **passkey** site | **NO — measured on macOS** (D-053), with Chrome on the same Mac as the control |
| An in-app web view can authenticate to a **password** site | **not run.** Nothing measured blocks it; that is not the same as proven |
| `src/core.js` runs in `WKWebView` | **not attempted** |

## 6. Work remaining, in the order that wastes least

Ordered so that each step can kill the path before the next one costs anything.

1. ~~**Passkey authentication in `WKWebView`.**~~ **DONE 2026-10-25 — it cannot (D-053).** Run it
   again with `SPIKE_PASSKEY_PROBE=1 swift run WebViewSpike` (optionally
   `SPIKE_PASSKEY_URL=<site>`); the two in-app buttons do the same thing by hand. It did not kill
   framing B, but it **bounds it to password-authenticated sites**, which makes step 2 the
   decisive one rather than a formality.
2. **Stage B — a real logged-in session across a restart.** Free. Needs a *password* login. D-052
   proved the store persists; this proves a *session* does, which is not the same claim.
3. **`src/core.js` inside `WKWebView`**, driven by buttons, no model. Free. Proves the engine ports.
4. **The same three on an actual iPad.** Needs Xcode and free provisioning; no paid Developer
   membership required to prove a build (see `docs/NATIVE-EXTENSION.md`).
5. **Device-bridge protocol** — make the app speak `/device/poll` and `/device/result` so the
   existing gateway drives it exactly as the userscript does. Only now does it become useful.
6. **Decide on the independent-gate loss** (§3) before shipping anything that acts on a page.

**Do not** buy API credits for any of this. Framing B never calls the model.

## 7. Open questions needing a decision, not more code

- **Is the loss of an out-of-process gate acceptable?** (§3)
- **Passkeys DO fail in `WKWebView` (D-053) — is framing B acceptable for password-only sites?**
  This is now the question that decides the path, and it is the operator's: it turns on which
  sites they actually want the agent to work on and how those sites authenticate. If the answer
  is "they use passkeys", Path A is not the incumbent, it is the only option.
- **Does the app replace Userscripts, or ship alongside it** while D-014's risk is live?

## 8. Where the spikes are

- `app/llm-chat-spike/Sources/LLMChatCore` — transport, wire types, structured errors. UI-free and
  testable without a network or a key. **Belongs to framing A; keep for reference, do not extend.**
- `app/llm-chat-spike/Sources/WebViewSpike` — the persistence spike behind D-052 and the passkey
  probe behind D-053. `swift run WebViewSpike` self-bundles and opens a window;
  `run-webview-spike.sh` does the same explicitly. `SPIKE_PASSKEY_PROBE=1` runs the passkey test
  unattended and prints the result to stderr instead of opening an idle window — so the finding
  is a command anyone can re-run, not a report of what somebody saw on screen.
- Build artefacts live in gitignored `.build/`, including two generated `.app` bundles.

**Related:** D-006, D-014, D-029, D-041, D-042, D-047, D-052, D-053 in `docs/DECISIONS.md`;
`docs/TARGET-ARCHITECTURE.md` §"Two transports, one engine".
