# Native Safari Web Extension

**File:** `/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/docs/NATIVE-EXTENSION.md`
**Description:** What the native Safari Web Extension scaffold in `extension/` is, what it unlocks over the Userscripts-based bridge, what iPadOS still forbids, how to build and run it on macOS Safari with no paid Apple Developer membership, and what a membership adds.
**Author:** safari-ai-agent-native-extension (Claude Code, Opus 5)
**Created:** 2026-10-11
**Last Updated:** 2026-10-11
**Last Updated By:** safari-ai-agent-native-extension

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
| The repo gate is unaffected | `npm run check` → 23 tests, 23 pass, 0 fail |

### NOT verified — nobody has run this extension in Safari

I did not load the built app into Safari, did not enable the extension, did not connect it to a gateway, and did not drive a page with it. Specifically unproven:

- **The whole runtime path.** Poll → execute → result has never executed once in this extension. The equivalent path is proven in `src/remote.js`, but that is a different host with different APIs.
- **Service-worker suspension.** MV3 workers get suspended when idle. `background.js` creates a 30-second `alarms` keepalive that restarts a dead pump, but Safari's actual suspension behaviour during a 1.2 s poll loop was not measured. **This is the single most likely thing to be broken.** If Safari suspends the worker mid-session the agent silently stops responding.
- **`permissions.request()` semantics in Safari.** Safari presents its own per-site grant UI ("Allow for One Day" / "Always Allow on This Website") and does not necessarily behave like Chrome's optional-permission model. The popup's connect flow assumes a Chrome-shaped boolean result.
- **`storage.session` / `action.setBadgeText`** behaviour in Safari — used only cosmetically, but untested.
- **iPadOS.** Nothing has been built for iOS/iPadOS at all (see §5). The `--macos-only` flag is currently set.
- **The approval sheet's appearance.** The shadow-DOM CSS has never been rendered.

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
| **Background execution** | None. The poll loop lives in the page and dies on every navigation — `src/remote.js` sets `running=false` before `location.assign`, and the operator reconnects by hand | Loop lives in the service worker. `background.js` navigates via `tabs.update` and **keeps polling**. Subject to the SW-suspension risk in §1 |
| **Tab management** | Impossible | `tabs` permission held. Can enumerate, open, close, switch. No tools wired yet |
| **Screenshots** | Impossible | `tabs.captureVisibleTab` implemented in `background.js`, unreachable until the gateway gains a tool |
| **Permission model** | A userscript's `@match` block is granted wholesale at install time, with no per-site revoke | `optional_host_permissions` requested from a user gesture, scoped to **one origin plus the gateway**, revocable later in Safari Settings without touching code. No declarative `content_scripts` at all — nothing is injected into any page until the operator connects a tab |
| **UI surface** | `window.confirm` for approvals, and a panel injected into the page's own DOM | Approvals are a structured sheet in a **closed** shadow root showing the control description, the origin, and a warning when the control has no accessible name. Config lives in a real popup at an **extension origin**, which the automated page cannot read, cover, or spoof. A toolbar badge shows session state |
| **Credential exposure** | Token in GM storage, but the fetch is initiated from a script sharing a global with the site | Token lives in extension storage, read only inside the service worker. It never enters any page's JavaScript realm. The popup can ask *whether* a token is saved but **cannot read its value back** |
| **Session binding** | Bound to an **origin**. D-023: a second window on the same site hijacks or breaks the session | Bound to a **tab id** plus origin. A tab id is not reachable from page content. `tabs.onRemoved` ends the session when the tab closes; `tabs.onUpdated` ends it if the tab leaves the session origin |
| **Distribution** | Depends on one maintainer's App Store app (D-014) | Self-contained app you build. No third-party dependency |
| **CORS escape** | Needs `GM.xmlHttpRequest` | Plain `fetch` from the worker with a host permission |

**What it does not fix:** D-016 (approval latency vs the 25 s command timeout) is unchanged and
may be *worse*, because a suspended service worker adds wake-up time. D-017 (two-tab deadlock,
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

### 4.5 If it does not work

Debug the extension's JavaScript via Safari → **Develop** → **Web Extension Background Content**
→ Safari AI Agent, for the service worker; the content script appears under the page's own
inspector. Expect to need this: per §1, nothing here has been run.

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
- **Background execution is still restricted.** An MV3 service worker on iPadOS is suspended aggressively, and Safari itself is suspended when backgrounded. The extension lifts the userscript's *in-page* limits; it does not make iPadOS a general-purpose background host. Do not expect a session to survive a locked screen.
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
| `extension/web/background.js` | Service worker: credential, poll loop, tab-bound session, navigation |
| `extension/web/content/content.js` | Action allowlist, approval sheet; delegates all DOM work to the shared engine |
| `extension/web/popup/*` | Extension-origin UI: gateway config, connect/stop, status |
| `extension/web/images/*` | Toolbar/app icons |
| `extension/web/vendor/core.js` | **Generated**, gitignored. Verbatim `src/core.js` |
| `extension/build.mjs` | Stages the engine; `--check` detects drift |
| `extension/make-xcode-project.sh` | Generates and builds the Xcode project |
| `extension/xcode/` | **Generated**, gitignored. Regenerate, never commit |

The Xcode project is not committed because the converter bakes in a bundle identifier, a
development team, and absolute paths. `extension/web` is the source of truth and the project
regenerates in seconds.
