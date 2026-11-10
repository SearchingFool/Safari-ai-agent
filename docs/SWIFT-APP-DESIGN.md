# Swift app — design, constraints and what remains

**File:** `docs/SWIFT-APP-DESIGN.md` (repo-relative — this repo is public)
**Description:** What the Swift app is for, which of its two possible framings is the viable one and why, what has been proven versus assumed, the three hard constraints that bound it, and the work remaining in the order that wastes least. Written so the next person does not have to re-derive any of it from decision records.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04, D-047/D-052/D-053)
**Created:** 2026-10-25
**Last Updated:** 2026-11-10
**Last Updated By:** Codex (safari-ai-agent lead session)

---

## 1. Status in one paragraph

An **alternative** to the gateway + Userscripts path, not a replacement for it and not a decided
pivot (D-047). A separate shared-source Xcode app project builds for macOS and iOS. The macOS app
has loaded the local fixture and run the shared engine in its named isolated world; the iPad
simulator app has been installed and launched. The app now implements the same five page commands
as the Userscripts bridge—inspect, verify, fill, click, and same-origin navigate—with shared core
policy checks and native one-time approvals where policy requires them. Protocol unit tests and
both platform builds pass. No end-to-end gateway exchange, remote action/approval runtime, or
physical iPad run has occurred. Passkey login remains unavailable in third-party WKWebView (D-053);
no decision to migrate has been taken.

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
| Xcode app targets build for macOS and iOS Simulator | **proven 2026-11-10** — unsigned Debug builds |
| iOS app opens | **proven in iPad simulator 2026-11-10** — current build installed and launched; no page loaded |
| `src/core.js` is bundled unchanged | **proven 2026-11-10** — SHA-256 matches in both current app bundles |
| Pairing UI, Keychain token storage, HTTPS poll/result transport and five command handlers compile | **proven by Xcode builds** — no gateway exchange exercised |
| Inspect, verify, fill, click, same-origin navigate use the shared engine and command policies | **implemented and code-reviewed** — no bridge runtime test |
| A local macOS fixture page runs core inspection in the named world | **runtime-verified** — snapshot shown in the app; no field value exposed |
| Per-command argument validation and expiry/origin checks | **proven by six Swift protocol unit tests** — does not verify model dispatch |
| Native approval, refusal, timeout, and post-ack action dispatch | **implemented; no runtime verification** |
| An in-app web view can authenticate to a **passkey** site | **NO — measured on macOS** (D-053), with Chrome on the same Mac as the control |
| An in-app web view can authenticate to a **password** site | **not run.** Nothing measured blocks it; that is not the same as proven |
| Gateway token, poll, command result, remote approval/action, active/hidden lifecycle | **not runtime-verified** |
| Physical iPad install/use | **not attempted** |

The new app lives in `app/browser-host/`. The engine is registered in a named `WKContentWorld`,
never in the page's JavaScript world. Local Inspect keeps its snapshot in the app. Gateway setup
stores its device token in Keychain and polls only while the app and browser window are visible.
Remote actions are constrained by the shared core and the gateway's per-origin policy; required
approvals appear in a native app overlay and expire before the command deadline. Click and
navigation are submitted to `/device/result` before dispatch and are reported as dispatched, not
verified. Fill follows the existing Userscripts contract and updates the page before result
submission. The app does not implement `browser_status` as a device command: that tool is fulfilled
inside the gateway. Gateway auth, reachability, delivery, result binding, approval, lifecycle,
cancellation, and redirection remain untested. A gateway inspection sends page-derived text to the
model caller, so it is not private local-only inspection.

### Current comparison with the Userscripts path

| Area | Userscripts-based product | Swift browser host | Evidence difference |
|---|---|---|---|
| Browser surface | Runs in Safari through Userscripts | Hosts its own `WKWebView`; it does not control Safari tabs | Swift UI/build verified; cross-app integration is not intended |
| Page engine | Shared `src/core.js` | Same shared engine, bundled unchanged in a named isolated world | macOS fixture inspection runtime-verified; iOS injection not run |
| Page commands | Inspect, verify, fill, click, same-origin navigation | Same five commands now implemented | Userscripts gateway/browser path has integration evidence; Swift handlers have only compile and protocol-test evidence |
| Permission policy | Gateway origin policy plus the shared core and Userscripts approval UI | Gateway origin policy plus the shared core and a native one-time approval overlay | Swift approval and dispatch have not been exercised against a gateway |
| Model and control plane | Existing MCP gateway connects to the client | Same MCP gateway; Claude remains the model client | Swift URLSession transport is compile-only so far |
| Authentication | Safari's browser authentication capabilities | Third-party `WKWebView` cannot perform the measured passkey ceremony (D-053) | Swift path is limited to sites with another login route or an existing session |
| iPad lifecycle | Safari tab must remain visible; Split View is an accepted limit (D-029) | Host app must remain visible; Split View and suspension limits remain | No physical iPad acceptance for Swift |
| Distribution | Userscripts setup plus gateway reachability instructions | Signed/installable macOS and iOS app still needs packaging, provisioning, and user setup | Swift targets currently have unsigned simulator/macOS Debug build evidence only |

This is capability parity at the command surface, not verification parity. Do not substitute the
Swift implementation for the Userscripts pilot path until the local HTTPS gateway fixture and
physical iPad acceptance steps below pass.

## 6. Work remaining, in the order that wastes least

Ordered so that each step can kill the path before the next one costs anything.

1. ~~**Passkey authentication in `WKWebView`.**~~ **DONE 2026-10-25 — it cannot (D-053).** Run it
   again with `SPIKE_PASSKEY_PROBE=1 swift run WebViewSpike` (optionally
   `SPIKE_PASSKEY_URL=<site>`); the two in-app buttons do the same thing by hand. It did not kill
   framing B, but it **bounds it to password-authenticated sites**, which makes step 2 the
   decisive one rather than a formality.
2. **Stage B — a real logged-in session across a restart.** Free. Needs a *password* login. D-052
   proved the store persists; this proves a *session* does, which is not the same claim.
3. **Run the host-side command path against a local HTTPS gateway fixture.** Cover correct and
   incorrect tokens, allowlist refusal, poll/result binding, policy changes, native approval,
   approval expiry/denial, fill/click/navigation dispatch, cancellation, redirects, and app
   backgrounding. The protocol package tests argument validation only; they do not exercise the
   app model or transport.
4. **Run the current app on an actual iPad.** Check browsing, password-authenticated session
   persistence across restart, clearing site data, lifecycle pause/resume, and Split View behavior.
   A simulator build is not device acceptance; provisioning and installation were not attempted.
5. **Decide the independent-gate and consent boundary** (§3) before using page-changing actions
   with a pilot or shipping the alternate path. The native app has a one-time approval UI, but it
   places the gate in the same process as the browser and has no separate gateway confirmation.

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
- `app/browser-host/SafariAIAgentHost.xcodeproj` — shared-source macOS and iOS app targets. See
  [`app/browser-host/README.md`](../app/browser-host/README.md) for the implemented command path,
  setup boundary, current evidence, and remaining acceptance work. It does not change gateway
  exposure.
- Build artefacts live in gitignored `.build/`, including two generated `.app` bundles.

**Related:** D-006, D-014, D-029, D-041, D-042, D-047, D-052, D-053 in `docs/DECISIONS.md`;
`docs/TARGET-ARCHITECTURE.md` §"Two transports, one engine".
