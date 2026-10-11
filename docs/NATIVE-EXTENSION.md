# Native Safari Web Extension

**File:** `/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/docs/NATIVE-EXTENSION.md`
**Description:** What the native Safari Web Extension scaffold in `extension/` is, what it unlocks over the Userscripts-based bridge, what iPadOS still forbids, how to build and run it on macOS Safari with no paid Apple Developer membership, and what a membership adds.
**Author:** safari-ai-agent-native-extension (Claude Code, Opus 5)
**Created:** 2026-10-11
**Last Updated:** 2026-10-11
**Last Updated By:** safari-ai-agent-sw-recovery (D-028 session-resume fix)

---

## 1. Status: what is real and what is not

This is a **scaffold**. Read this section before relying on anything below it.

### Verified on this machine (2026-10-11, Xcode 26.3, Swift 6.2.4, 0 codesigning identities)

| Claim | How it was verified |
|---|---|
| `xcrun safari-web-extension-converter` accepts `extension/web` and emits an Xcode project | Ran `bash extension/make-xcode-project.sh --no-build`; converter reported no manifest warnings |
| The project **builds unsigned** with zero signing identities | `xcodebuild ... CODE_SIGNING_ALLOWED=NO` → `** BUILD SUCCEEDED **` |
| All web assets, including the vendored engine, land inside the built `.appex` | Listed `SafariAIAgent.app/Contents/PlugIns/SafariAIAgent Extension.appex/Contents/Resources` |
| `extension/build.mjs` stages `src/core.js` verbatim and detects drift | Ran `node extension/build.mjs` then `node extension/build.mjs --check` |
| All extension JavaScript parses | `node --check` on `background.js`, `content/content.js`, `popup/popup.js`, `build.mjs` |
| The repo gate is unaffected | `npm run check` → 23 tests, 23 pass, 0 fail (31/31 as of 2026-10-11) |

### Verified 2026-10-11 by the D-028 fix (simulation only, still not Safari)

| Claim | How it was verified |
|---|---|
| The session survives a service-worker teardown with no user action | `node --test extension/background.test.mjs` — 15 tests. A teardown is modelled the way it actually behaves: the entire JS realm is discarded and `background.js` is re-evaluated in a fresh one, keeping only `storage.local` |
| The resumed worker re-polls as the **same** `instanceId` | Same suite. Without this the gateway would treat the respawned worker as a rival tab and answer 409 |
| `alarms.create` is armed during top-level evaluation | Same suite, asserted with no `await` in between — i.e. on the state of the world at the instant evaluation returned. Also enforced statically by `node extension/build.mjs`, which refuses to stage the bundle otherwise |
| Those two tests actually fail when the invariant is broken | Mutation-tested: moving `alarms.create` behind an `await` fails 2 tests; deleting the top-level `boot()` fails 6; restoring the old `state.running` alarm guard fails the alarm-recovery test |
| An interrupted command is never replayed or re-reported | Same suite, plus a read of `gateway/server.mjs`: a claimed command is never re-delivered, and `/device/result` rejects unknown ids (409) and foreign instances (403) |

### NOT verified — nobody has run this extension in Safari

I did not load the built app into Safari, did not enable the extension, did not connect it to a gateway, and did not drive a page with it. Specifically unproven:

- **The whole runtime path.** Poll → execute → result has never executed once in this extension against a real gateway and a real page. The equivalent path is proven in `src/remote.js`, but that is a different host with different APIs.
- **The 30-second teardown-and-resume, end to end, in Safari.** The resume logic is proven against a simulated teardown (above) and the teardown itself is measured on WebKit (`docs/SERVICE-WORKER-LIFETIME.md`), but the two have never been observed together in Safari.app. Enabling an unsigned extension raises a Touch ID sheet that an agent must not satisfy.
- **`permissions.request()` semantics in Safari.** Safari presents its own per-site grant UI ("Allow for One Day" / "Always Allow on This Website") and does not necessarily behave like Chrome's optional-permission model. The popup's connect flow assumes a Chrome-shaped boolean result.
- **`action.setBadgeText`** behaviour in Safari — cosmetic, but it is now also the operator's only at-a-glance signal of session health, so it matters more than it did.
- **`tabs.get(...).active` as a proxy for `document.visibilityState`.** See §2.1.
- **iPadOS.** Nothing has been built for iOS/iPadOS at all (see §5). The `--macos-only` flag is currently set.
- **The approval sheet's appearance.** The shadow-DOM CSS has never been rendered.

### Second defect found while fixing D-028 — the device calls were malformed

The scaffold's `background.js` posted `{origin}` to `/device/poll`, `/device/result` and
`/device/disconnect`. `gateway/server.mjs` has required a per-tab `instanceId` on **every**
`/device/*` call since the D-023 fix, and answers `400 "A per-tab instanceId is required"`
without it. It also refuses to hand a command to a tab that did not report
`visibility: "visible"`, and the scaffold never reported visibility at all.

So the extension could not have completed a single poll against the current gateway even
within its first 30 seconds. D-028 described it as "non-functional for any session longer than
30 seconds"; it was in fact non-functional for any session at all. Both fields are now sent, as
`src/remote.js` has always sent them, and the suite pins it. **The gateway was not changed.**

### Behaviour change: clearing the gateway config now ends the session

`clearConfig` previously forgot the credential while leaving a session running against it. It
now stops the session first. Forgetting the token that authenticates a live bridge should not
leave the bridge up.

### Explicitly stubbed, by design

- **Screenshots.** `background.js` implements a `captureTab` message using `tabs.captureVisibleTab`, which the userscript cannot do at all. **Nothing can call it**: `gateway/server.mjs` advertises no `browser_screenshot` tool. Wiring it is a gateway protocol change and was outside this scaffold's write scope.
- **Tab management.** The extension holds the `tabs` permission and could open, close, and switch tabs. The gateway exposes no tools for it, so none is implemented.
- **Safety tiering (D-019 / D-020 / D-021).** The approval model here is a straight port of `src/remote.js`: every click and navigation asks, every form submission is blocked. The open decision about read-only vs interactive tiers by site trust, and allow-once vs allow-always, is **not** addressed. The approval sheet has an "Allow once" button and no "Always allow" button precisely so it does not pre-empt that decision.
- **MCP protocol version (D-015).** Untouched; this is a gateway concern.

---

## 2. Architecture

```
  Remote MCP gateway (HTTPS, Tailscale Funnel today)
            ^  POST /device/poll  /device/result  /device/disconnect
            |  Authorization: Bearer <device token>
            |
  +---------+------------------------------------+
  | background.js  (MV3 service worker)           |   <- owns the credential
  |  - poll loop, tab-bound session, navigation   |   <- survives page unload
  +---------+------------------------------------+
            |  browser.tabs.sendMessage (no credential ever crosses this line)
            v
  +----------------------------------------------+
  | content/content.js  (injected on demand)      |
  |  - action allowlist + approval sheet          |
  |  - delegates ALL DOM work to:                 |
  |    vendor/core.js == verbatim src/core.js     |
  +----------------------------------------------+

  popup/  -> extension-origin UI: gateway URL, device token, connect/stop, status
```

Still a **remote** gateway over HTTPS, exactly as today. iPadOS cannot spawn local
processes, so a local-server design is not an option and none is proposed here.

### 2.1 The session is resumable, not long-running (D-028)

This is the single most important thing to understand before editing
`background.js`. `docs/SERVICE-WORKER-LIFETIME.md` measured, on WebKit 26.x, that the
background worker is **destroyed 30.0 seconds after its own start regardless of what it is
doing** — a 1.2 s fetch loop runs 24 ticks and dies on schedule. The platform offers
**resumable execution in 30-second instalments**, not a worker that keeps running.

The original scaffold assumed the opposite. It held the session in a module-level object and
guarded the keepalive alarm on `state.running`, which the teardown had already reset to
`false` — so the alarm fired, saw nothing to do, and the session died silently 30 seconds
after it was connected while the badge still read `ON`. That is D-028. Three rules follow, and
`background.js` is built around them:

1. **`storage.local` holds the session of record; worker memory is a cache.** The `session`
   key carries `{tabId, origin, instanceId, lastCommand, lastBeatAt}`. A session is live if
   and only if that key exists — "stopped" is the absence of the key, never a flag inside it,
   so there is no half-state a respawned worker can misread.
2. **Recovery starts at top-level evaluation**, which is the only code guaranteed to run on
   every respawn. The last line of `background.js` is `void boot();`. The alarm's job is to
   *cause* the respawn (and to retry a boot whose storage read failed); it does not itself
   carry the recovery logic.
3. **The `instanceId` is persisted and reused.** The gateway keys the device session on
   `{origin, instanceId}`. A respawned worker that minted a fresh id would be told 409
   "Another tab already owns the device session" by its own previous self.

**The keepalive alarm must be armed at top-level evaluation.** Measured: armed there, 0/24 and
0/14 teardowns survived; re-armed 2 ms later from inside the worker, 26/26 and 6/6 — never
survived once. `periodInMinutes: 0.4` is clamped back up to 30 s, so no margin can be bought.
This is a ~2 ms photo finish with no runtime symptom when broken, so it is pinned twice: by
`extension/background.test.mjs` and by `node extension/build.mjs`, which refuses to stage the
bundle if the call moves.

**What a teardown costs, and what it cannot corrupt.** Respawn latency is 70–105 ms, about
0.4 % of the 25 s command timeout. A command that was in flight when the worker died is
**not** replayed: `gateway/server.mjs` marks a command `claimed` when it hands it out and
never re-delivers it, so the caller gets the honest "action outcome may be uncertain. Inspect
again." timeout rather than a silent double-click. Nothing about an in-flight command is
persisted, deliberately — persisting it is the one change that would make a resumed worker
dangerous.

**Honest limits of the badge.** The toolbar badge is browser UI state and outlives the worker,
so a badge set to `ON` before a teardown stays `ON`. Every worker boot re-derives it from the
persisted record within one storage read, and the popup is answered only after that read
completes, so a stale `ON` is now bounded by "the worker never came back at all" — a state no
in-worker code can signal. `snapshotStatus()` additionally reports `beatAgeMs`, the age of the
last completed poll, so a stalled session is distinguishable from a healthy one.

**Visibility is reported from a proxy, not from the page.** The gateway will not deliver a
command to a tab that did not report `visibility: "visible"`, because the approval sheet would
open where the operator cannot see it. `src/remote.js` reports `document.visibilityState`
directly; the worker has no page to ask without injecting into one, so it reports
`tabs.get(tabId).active` instead. That is deliberately *not* narrowed with `windows.focused` —
the operator drives this from another application, which is the normal case and which leaves
`document.visibilityState` at `visible` too. The honest gap is the other direction: a minimised
or fully occluded window still reports `active` where `visibilityState` would report `hidden`.

### How `src/core.js` is reused rather than forked

`src/core.js` is the only DOM engine in this project and **was not modified**. It already
publishes `globalThis.SafariAIAgentCore` from an IIFE, which is directly loadable as a
content script.

`extension/build.mjs` copies it **byte for byte** into `extension/web/vendor/core.js`, prefixed
with a "GENERATED — DO NOT EDIT" banner and the SHA-256 of the source. `background.js` injects
`vendor/core.js` before `content/content.js`, so `content.js` just calls
`SafariAIAgentCore.createAgentCore(document, window)` — the same call `src/remote.js` makes.

The copy is gitignored, so there is no second engine in version control. Drift is detectable:

```
node /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/extension/build.mjs --check
```

This is deliberately the same relationship the userscript has: `tools/build.mjs` concatenates
`src/core.js` into `scripts/safari-ai-agent.user.js`. One engine, two packagings.

**No change to `src/core.js` was needed.** Two details made this work without one: the engine
takes `(doc, win)` rather than reaching for globals, and its `isVisible()` filter already
excludes `[data-safari-ai-agent-host]`, so the extension's approval sheet reuses that attribute
and is invisible to `inspect()` — the agent cannot see or click its own approval UI.

---

## 3. What the extension unlocks versus the userscript

`docs/DECISIONS.md` D-014 records the Userscripts ceilings. Against each:

| Capability | Userscript today | Extension |
|---|---|---|
| **Background execution** | None. The poll loop lives in the page and dies on every navigation — `src/remote.js` sets `running=false` before `location.assign`, and the operator reconnects by hand | Loop lives in the service worker. `background.js` navigates via `tabs.update` and **keeps polling**. Not a long-running loop: the worker is destroyed every 30 s and the session is *resumed* from `storage.local` on each respawn, at a measured cost of 70–105 ms. See §2.1 |
| **Tab management** | Impossible | `tabs` permission held. Can enumerate, open, close, switch. No tools wired yet |
| **Screenshots** | Impossible | `tabs.captureVisibleTab` implemented in `background.js`, unreachable until the gateway gains a tool |
| **Permission model** | A userscript's `@match` block is granted wholesale at install time, with no per-site revoke | `optional_host_permissions` requested from a user gesture, scoped to **one origin plus the gateway**, revocable later in Safari Settings without touching code. No declarative `content_scripts` at all — nothing is injected into any page until the operator connects a tab |
| **UI surface** | `window.confirm` for approvals, and a panel injected into the page's own DOM | Approvals are a structured sheet in a **closed** shadow root showing the control description, the origin, and a warning when the control has no accessible name. Config lives in a real popup at an **extension origin**, which the automated page cannot read, cover, or spoof. A toolbar badge shows session state |
| **Credential exposure** | Token in GM storage, but the fetch is initiated from a script sharing a global with the site | Token lives in extension storage, read only inside the service worker. It never enters any page's JavaScript realm. The popup can ask *whether* a token is saved but **cannot read its value back** |
| **Session binding** | Bound to an **origin**. D-023: a second window on the same site hijacks or breaks the session | Bound to a **tab id** plus origin. A tab id is not reachable from page content. `tabs.onRemoved` ends the session when the tab closes; `tabs.onUpdated` ends it if the tab leaves the session origin. Because those listeners cannot fire while the worker is dead, **every poll also re-verifies the tab from the browser**: a tab closed or navigated off-origin during a teardown ends the session on the next boot rather than being acted on |
| **Distribution** | Depends on one maintainer's App Store app (D-014) | Self-contained app you build. No third-party dependency |
| **CORS escape** | Needs `GM.xmlHttpRequest` | Plain `fetch` from the worker with a host permission |

**What it does not fix:** D-016 (approval latency vs the 25 s command timeout) is unchanged and
is marginally worse, by the measured 70–105 ms respawn cost — about 0.4 % of the timeout, so
not a meaningful threat to that budget. D-017 (two-tab deadlock,
409 with no takeover path) is a gateway-side problem and is untouched. The approval sheet is
still drawn inside the page's layout — an extension cannot render a true OS-level modal over a
web page, so a hostile page can still compete for the operator's attention around it.

---

## 4. Build and run on macOS Safari — no paid membership

Prerequisites: Xcode (26.3 here), Node 20+. **No Apple Developer membership, no signing
identity, no enrolment, no payment.** This machine has `0 valid identities found` and the build
succeeds anyway.

### 4.1 Build

```
cd /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent
bash /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/extension/make-xcode-project.sh
```

This stages `src/core.js`, runs `safari-web-extension-converter`, and builds with
`CODE_SIGNING_ALLOWED=NO`. Output:

```
extension/xcode/DerivedData/Build/Products/Debug/SafariAIAgent.app
```

### 4.2 Let Safari load an unsigned extension (one time)

1. Safari → Settings → **Advanced** → tick **Show features for web developers**.
2. Safari → **Develop** menu → **Allow Unsigned Extensions**.
   This resets every time Safari restarts. Re-tick it after each restart.

### 4.3 Enable it

1. Open the built app once (double-click `SafariAIAgent.app`) so macOS registers the extension.
2. Safari → Settings → **Extensions** → enable **Safari AI Agent**.
3. Grant site access when Safari asks. Prefer **Allow for One Day** over **Always Allow** while testing.

### 4.4 Use it

1. Start the gateway the usual way (`docs/MAC_TAILSCALE_TEST.md`), noting its HTTPS URL and device token.
2. Open the page you want to automate.
3. Click the toolbar icon. Enter the gateway URL and the device token, press **Save**.
4. Press **Connect this tab**. Safari asks for permission for that site and the gateway origin.
5. The badge reads **ON**. Drive it from the MCP client as today. Clicks and navigations raise the approval sheet in the page.
6. **Stop** disconnects and asks the gateway to revoke queued commands.

Keep the connected tab the **selected** tab in its window. It does not need to be the frontmost
application — driving Safari from another app is the normal case — but the gateway refuses to
deliver a command to a tab that is not the selected one, because the approval sheet would open
where the operator cannot see it. The popup says `Paused` when that happens.

### 4.4a The test that matters most, and is not yet in the gate

```
node --test /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/extension/background.test.mjs
```

15 tests covering the D-028 lifetime contract (§2.1): teardown-and-resume, the persisted
`instanceId`, the top-level alarm, badge honesty, and the no-replay guarantee. It is **not** run
by `npm run check` or by CI, because `package.json` and `.github/` were outside the write scope
of the change that added it. Wiring it in is a one-line change to the `test` script and should
be done.

### 4.5 If it does not work

Debug the extension's JavaScript via Safari → **Develop** → **Web Extension Background Content**
→ Safari AI Agent, for the service worker; the content script appears under the page's own
inspector. Expect to need this: per §1, nothing here has been run.

Expect the background inspector to **detach roughly every 30 seconds** — that is the worker
being destroyed and respawned, not a crash (§2.1). A correct session shows a fresh evaluation
followed immediately by a `/device/poll` carrying the *same* `instanceId` as before. If the
`instanceId` changes across a respawn, or no poll follows the respawn, the recovery path is
broken and the session is dead even though the badge may still read `ON`.

### 4.6 Note on the bundle identifier

`APP_NAME` must have no spaces and `BUNDLE_ID` must end in exactly `APP_NAME`. The converter
sets the container app's id from `$(PRODUCT_NAME:rfc1034identifier)` but gives the appex the
literal `<bundle-id>.Extension`. With `APP_NAME="Safari AI Agent"` these diverged and
`ValidateEmbeddedBinary` failed. The script keeps them in sync by construction; the comment
there records the exact failure.

---

## 5. iPadOS: what is still forbidden

Running this on an iPad is **not** covered by §4 and is **not** scaffolded. Current state is
`--macos-only`.

**Still structurally impossible on iPadOS, extension or not:**

- **No local processes.** No local MCP server, no local gateway. The remote-HTTPS-gateway architecture is not a workaround; it is the only available shape.
- **No sideloading without Apple.** Unlike macOS, iPadOS has no "Allow Unsigned Extensions" escape hatch. Any build on a real iPad requires a provisioning profile, which requires an Apple ID registered for development.
- **Free provisioning expires after 7 days.** A free Apple ID can sign and install on your *own* device via Xcode, but the profile dies in a week and the app stops launching. You re-deploy weekly, with the iPad cabled or on the same network.
- **No distribution to anyone else.** Not to a second person, not to a second household device you do not control. TestFlight and the App Store both require membership.
- **Background execution is still restricted, and the 30-second model is unmeasured there.** The macOS numbers in §2.1 come from WebKit on a Mac. An MV3 service worker on iPadOS is suspended at least as aggressively, Safari itself is suspended when backgrounded, and whether the `alarms` keepalive is honoured at all is unknown. The resume-from-storage design in §2.1 is the right shape for a *more* aggressive host, but nothing about the timing transfers. Do not expect a session to survive a locked screen.
- **Approval latency (D-016) is likely worse on iPad** than the 3.2–14.9 s measured on macOS, against a 25 s command timeout. This remains unmeasured on iPad and is a real risk to the whole design.

**To attempt an iPad build later:** remove `--macos-only` from
`extension/make-xcode-project.sh` and update the `-scheme` argument to `"$APP_NAME (iOS)"` —
with both platforms the converter emits two suffixed schemes instead of one bare one. Then sign
with free provisioning in Xcode. This path has **not** been tried.

---

## 6. What a $99/yr Apple Developer membership adds

For the record, so the decision is informed. **Do not enrol without the operator's explicit
decision** — nothing in this scaffold requires it.

| | Free (today) | With membership |
|---|---|---|
| Build the extension | Yes | Yes |
| Run in macOS Safari | Yes, via "Allow Unsigned Extensions", re-ticked each Safari restart | Yes, signed, persists across restarts, no developer-mode toggle |
| Install on your own iPad | 7-day profile, re-deploy weekly | 1-year profile |
| Install on an iPad you do not own | No | Yes, via TestFlight (up to 100 internal / 10 000 external testers) |
| Ship to anyone | No | App Store |
| Notarised distribution of the macOS app outside the App Store | No — Gatekeeper blocks it on other Macs | Yes, Developer ID + notarisation |
| App Groups / iCloud / push / other entitlements | No | Yes (none currently needed) |

**Practical reading:** a membership is *not* needed to develop or to evaluate this on macOS. It
becomes necessary the moment you want the iPad to work for more than a week at a time, which is
the actual product goal. The honest sequencing is: prove the runtime path on macOS first (§1
says it is wholly unproven), then decide on the membership.

---

## 7. Files

| Path | Role |
|---|---|
| `extension/web/manifest.json` | MV3 manifest. No declarative content scripts — injection is on demand |
| `extension/web/background.js` | Service worker: credential, poll loop, tab-bound session, navigation, and the resume-from-storage recovery in §2.1 |
| `extension/background.test.mjs` | Regression tests for the §2.1 lifetime contract. Not in `npm run check` yet |
| `extension/web/content/content.js` | Action allowlist, approval sheet; delegates all DOM work to the shared engine |
| `extension/web/popup/*` | Extension-origin UI: gateway config, connect/stop, status |
| `extension/web/images/*` | Toolbar/app icons |
| `extension/web/vendor/core.js` | **Generated**, gitignored. Verbatim `src/core.js` |
| `extension/build.mjs` | Stages the engine; `--check` detects drift; refuses to stage at all if the keepalive alarm leaves top-level evaluation |
| `extension/make-xcode-project.sh` | Generates and builds the Xcode project |
| `extension/xcode/` | **Generated**, gitignored. Regenerate, never commit |

The Xcode project is not committed because the converter bakes in a bundle identifier, a
development team, and absolute paths. `extension/web` is the source of truth and the project
regenerates in seconds.
