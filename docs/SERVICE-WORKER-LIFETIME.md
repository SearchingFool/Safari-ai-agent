# Service Worker Lifetime Measurement

**File:** `/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/docs/SERVICE-WORKER-LIFETIME.md`
**Description:** Measured lifetime of the MV3 background service worker that
D-024 (native Safari Web Extension, F-01) depends on, together with what the
numbers mean for the "background execution" justification.
**Author:** safari-ai-agent-sw-lifetime (Claude Code, Opus 5)
**Created:** 2026-10-11
**Last Updated:** 2026-10-11
**Last Updated By:** safari-ai-agent-sw-lifetime

---

## 1. Verdict first

**The background-execution premise behind D-024 is half true, and the half that
is false is the half the current code relies on.**

| Claim | Status |
|---|---|
| A background worker can outlive a page navigation | **Holds** — but only for 30 seconds at a time |
| The worker survives as long as it is doing work | **FALSE.** A 1.2 s `fetch` loop does not extend its life by one millisecond |
| The 30 s `alarms` keepalive restarts a suspended worker | **Holds — by a margin of about 2 ms**, and only because it is armed during top-level evaluation |
| The keepalive restores the *session* in `extension/web/background.js` | **FALSE.** It provably cannot. See §6 |

The headline number: **a non-persistent background service worker gets a hard
30.0-second wall-clock budget**. It is torn down at 30.0 s from its own start,
no matter how busy it is. The only thing that resets that clock is the dispatch
of an extension event — and the shortest alarm period the platform will honour
is *exactly* 30 s, so the standard keepalive does not fire comfortably inside
the budget; it lands precisely on the deadline and wins on ordering alone.

---

## 2. CRITICAL CAVEAT — this was measured on WebKit, not on Safari.app

**I could not enable the extension in Safari.** `Develop > Developer Settings…
> Allow unsigned extensions` (Safari 18.6 moved it there from the Develop menu)
raises a macOS authorization sheet — *"Safari is trying to allow unsigned
extensions. Touch ID or enter your password to allow this."* The
`Add Temporary Extension…` button raises the **same** sheet. Both are a human
authorization gate that an agent cannot and must not satisfy. The sheet was
presented and left up for 90 s in case an operator was present; it was not
authorized, and it was then cancelled and Safari left clean.

So the measurement was made against **WebKit's `WKWebExtensionController`**
(public API, macOS 15.4+) hosted in a small purpose-built app
(`extension/lifetime-probe/wk-host/main.swift`), which loads the probe extension
with no Safari involvement and no signing.

Why this is still worth something, and where it stops being worth something:

* The background-content lifecycle — `scheduleBackgroundContentToUnload`,
  `wakeUpBackgroundContentIfNecessary` — lives in **WebKit**, in
  `Source/WebKit/UIProcess/Extensions/`, not in Safari. Safari is a client of
  the same code. The 30 s budget and the alarm-wake behaviour are therefore
  very likely to be WebKit-wide, not host-specific.
* But Safari may layer its own policy on top: App Nap, power state, Low Power
  Mode, the "browser is fully backgrounded" case, tab count, and the fact that
  Safari's extension runs in a sandboxed `.appex` rather than in-process.
* **Nothing here is a Chromium number.** Chromium was not used at any point.

**Every number below should be read as "WebKit 26.x on macOS 15.7.4, via
WKWebExtensionController" and re-confirmed on Safari.app once a human can tick
the unsigned-extensions box.** §8 lists exactly what to re-run.

---

## 3. Method

* **Harness:** `extension/lifetime-probe/` (test-only, clearly marked, not part
  of the shipped extension). `web/probe.js` is a background service worker that
  deliberately mirrors *only* the lifecycle primitives of
  `extension/web/background.js`: a 1.2 s loop that `fetch`es, and
  `alarms.create(name, {periodInMinutes: 0.5})` armed at top level.
* **Clock:** every event is POSTed to a localhost collector
  (`collector.mjs`, 127.0.0.1:4037, from the registry's 4000–4050 temporary-test
  range) which stamps its **own** receive time. In-worker counters die with the
  worker, so the only trustworthy clock is outside it.
* **The one decisive signal:** top-level code in an MV3 service worker runs
  exactly once per worker instantiation. The probe emits a `boot` event with a
  fresh random `bootId` from top level. **A new `bootId` is proof that the
  previous worker was destroyed.** Silence in the collector log is proof that
  nothing is running.
* **Experiment control without a GUI:** the collector returns the desired arm in
  its HTTP response body, so arms can be switched from a shell.
* **Raw evidence:** `extension/lifetime-probe/evidence-2026-10-11.jsonl`
  (1 193 events, 10:11–11:15 UTC on 2026-10-11). Reduce it with
  `node extension/lifetime-probe/analyze.mjs` and
  `node extension/lifetime-probe/summarize-arms.mjs`.

Conditions: macOS 15.7.4 (24G517), Apple Silicon, on AC power, not in Low Power
Mode, machine otherwise lightly loaded, host app in a normal foreground window
unless an arm says otherwise.

---

## 4. The numbers

### 4.1 Hard 30.0-second budget; activity does **not** extend it

Arm: no alarm at all (the 30 s keepalive explicitly `alarms.clear()`-ed, with a
single one-shot alarm armed further out), 1.2 s `fetch` loop left running.

Every worker instance behaved identically:

```
boot 11:10:05.132
ticks 11:10:06.337 .. 11:10:33.966   24 ticks over 27.6s
(silence)
boot 11:10:35.208                    <- new bootId, 30.08s after the previous boot
```

24 ticks at 1.2 s = 28.8 s after boot; the 25th tick would have been due at
30.0 s and never happened. Reproduced across 7 consecutive instances in one arm
and in three separate sweeps (`silent:0.5`, `silent:0.75`, `silent:1`).

**A service worker issuing a network request every 1.2 seconds is killed at
30.0 seconds.** This is the single most important result, and it is the opposite
of the intuition that "the loop keeps it warm". It does not.

### 4.2 The alarm keepalive does revive a dead worker, and it is fast

With all other wake sources removed and a one-shot alarm armed 30 s / 45 s / 60 s
out, the alarm **always** arrived at a *freshly booted* worker
(`respawnedForThisAlarm = true`, `sinceBootMs` = 1–4 ms):

| One-shot delay | Respawned for the alarm | Alarm lateness |
|---|---|---|
| 30 s | 2/2 | 70 ms, 75 ms |
| 45 s | 2/2 | 95 ms, 105 ms |
| 60 s | 3/3 | 86 ms, 97 ms, 98 ms |
| 180 s | 1/1 | 99 ms |

**Wake-up latency: 70–105 ms** (n = 9, median ≈ 95 ms). That is the full cost of
spinning a new worker process, evaluating `probe.js` top-to-bottom and
dispatching the alarm handler. For comparison, when the alarm is delivered to an
*already running* worker, lateness is 0–2 ms.

**70–105 ms is small** relative to D-016's 3.2–14.9 s human approval latency
against a 25 s command timeout. Wake-up cost is **not** a meaningful threat to
that budget. One respawn adds roughly 0.4 % of the timeout.

### 4.3 The keepalive survives only on a ~2 ms margin

This is the uncomfortable one, and it was found by accident when an
instrumentation bug produced the opposite result.

* Keepalive armed **at top level** (i.e. at worker start, t ≈ 0 ms), period
  0.5 min: the worker was **never** torn down.
  - 720 s continuous, 24 consecutive alarms, one single `bootId`, 0/24 respawns.
  - A later clean run: 451 s continuous, 14 consecutive alarms, one `bootId`,
    0/14 respawns.
* Keepalive **re-created from inside the running worker at boot + 2 ms**, same
  0.5 min period: the worker was torn down **every single cycle**.
  - 26/26 alarms arrived at a brand-new worker, across both foreground and
    background arms, plus 6/6 in a later arm. Not one survival.

The mechanism: WebKit schedules the teardown at 30.0 s from worker start.
`alarms.create()` on an existing name **resets** that alarm's schedule. Arming
it 2 ms after boot therefore makes it fire at 30.002 s — two milliseconds after
the worker is already gone. Arming it during top-level evaluation makes it fire
at 30.000 s, where it wins on run-loop ordering and resets the teardown timer.

And there is no way to buy margin, because:

### 4.4 The alarm period is clamped to a 30 s minimum

Arming the keepalive with `periodInMinutes: 0.4` (24 s) did **not** produce a
24 s alarm. Successive boots were 30.08 s apart — identical to the 0.5 min case.
The platform clamped 0.4 → 0.5 min. (`periodInMinutes: 0.6` / 36 s *was*
honoured: the worker died at 30 s and lay dead for ~6 s until the 36 s alarm
revived it, 5/5 cycles.)

**So the shortest keepalive the platform allows is exactly equal to the teardown
deadline.** There is no alarm period that fires strictly inside the budget. The
keepalive is not a safety margin; it is a photo finish that happens to be
scheduled by the same event that starts the clock.

### 4.5 Foreground vs. background: no difference observed

A clean A/B with the keepalive armed at top level, host app visible and frontmost
for 231 s, then hidden (`System Events … set visible to false`) with Safari
brought to the front for a further 220 s:

| Arm | Duration | New workers | Alarms | Respawned |
|---|---|---|---|---|
| Foreground | 231 s | 1 (the initial one) | 7 | 0/7 |
| Hidden / backgrounded | 220 s | 0 | 7 | 0/7 |

The same worker instance spanned both halves — 451 s total, 14 alarms, zero
teardowns. **Hiding the host app changed nothing.**

*Honesty note:* an earlier backgrounded run showed 28/28 respawns and looked
like a dramatic backgrounding effect. It was not. It was the §4.3 arming bug,
which was present in that build and absent from the clean A/B. The initial
reading was wrong and is recorded here so nobody rediscovers it as a finding.
Also note that hiding a small AppKit host is a **weak proxy** for Safari being
backgrounded — this is one of the things §8 asks to re-run on Safari.

---

## 5. What happens to in-flight state

Nothing survives. The worker's entire JS realm is destroyed. In the probe, the
only reason work resumes after a respawn is that `startTimer()` is called from
**top level**, so every new worker re-arms itself from scratch. `chrome.storage.local`
does persist across the teardown (the probe's journal was intact), but it is
explicitly *not* used by `background.js` to hold session state.

---

## 6. Consequence for `extension/web/background.js` — a real defect

`extension/web/background.js` holds its session in a module-level object:

```js
const state = { running: false, pumping: false, tabId: null, origin: null, … };
```

and guards the keepalive with:

```js
api.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === KEEPALIVE_ALARM && state.running && !state.pumping) void pump();
});
```

`state.running` is set `true` in exactly one place: `start()`, which only runs in
response to a `start` message from the popup. **The teardown that the keepalive
exists to recover from is the same teardown that resets `state.running` to
`false`.** So when the alarm fires on the respawned worker, `state.running` is
`false`, the guard short-circuits, and `pump()` is never called.

The comment at line 35 says *"restoreSession() below re-arms only from an
explicit record"*. **`restoreSession()` does not exist in the file.** It is
referenced in prose and never implemented.

Net effect, assuming Safari matches WebKit: **a connected session dies silently
after 30 seconds** and the keepalive cannot bring it back. The badge keeps
saying `ON` (it was set before the teardown and never cleared), the gateway
keeps queueing commands, and the operator has no signal that the bridge is dead.
This is strictly worse than the userscript's failure mode, which at least forced
a visible manual reconnect.

Two things must change before the background-execution claim in D-024 is real:

1. **Session state must be persisted to `chrome.storage.local`** and reloaded
   from top level on every worker start — i.e. actually write the
   `restoreSession()` that the comment already promises — so a respawned worker
   knows there is a session to resume.
2. **The pump must be restarted from top-level evaluation**, not only from the
   alarm handler, because top level is the one thing guaranteed to run on every
   respawn. Keep the alarm as the thing that *causes* the respawn.

Both are in `extension/web/background.js`, which is outside this task's write
scope; they are not fixed here.

---

## 7. What this means for D-024

**Background execution is a real capability, but it is not free and it is not
what was assumed.** Specifically:

* **The justification does not collapse.** A native extension genuinely can keep
  a session alive across navigations and across worker teardowns, and the
  wake-up cost (70–105 ms) is negligible against the 25 s command timeout. The
  Userscripts host cannot do this at all. Tab management and screenshots — the
  other two legs of D-024 — are untouched by any of this.
* **But "the background worker just keeps running" is false**, and the current
  implementation is built on exactly that assumption. What the platform actually
  offers is *resumable* execution, in 30-second instalments, which is a
  materially different engineering model: every piece of session state must be
  externalised, and every entry point must be re-establishable from top level.
* **The 30 s keepalive is load-bearing and fragile.** It works, but with a ~2 ms
  margin that depends on it being armed during top-level evaluation, and the
  platform will not let anyone buy more margin because 30 s is the clamped
  minimum period. Any future refactor that moves `alarms.create` out of top
  level — into an `onInstalled` handler, into `start()`, behind an `await`, or
  into a bundler-generated async init — will silently turn a persistent session
  into one that dies every 30 seconds. That deserves a comment in the source and
  a regression test, not just this document.
* **Honest summary:** D-024 should stand, but its stated rationale should be
  rewritten from "background execution" to "resumable background execution with
  mandatory externalised state", and the defect in §6 should be tracked as a
  blocker for the native path being usable at all.

---

## 8. What could NOT be measured, and what to re-run

1. **Safari.app itself.** Blocked by the Touch ID / password authorization on
   `Allow unsigned extensions`. **This is the big one.** Once an operator ticks
   that box, re-run §4.1 (30 s budget), §4.3 (top-level vs. late arming) and
   §4.5 (foreground vs. background) against the real
   `extension/lifetime-probe/make-probe-xcode-project.sh` build. Note the toggle
   resets on every Safari restart.
2. **Message-triggered wake latency, separately from alarm wake.** The probe
   ships a content script for this, but `WKWebExtensionController` only injects
   content scripts into web views registered as tabs, and the measurement host
   deliberately implements no `WKWebExtensionTab`/`WKWebExtensionWindow`
   provider. The alarm figure (70–105 ms) is the respawn cost and should
   dominate either path, but this is an inference, not a measurement.
3. **Safari genuinely backgrounded** — app hidden *and* the machine idle, on
   battery, or in Low Power Mode. Hiding a small AppKit host is a weak proxy.
   App Nap and power state are the most likely places for Safari to diverge from
   this host.
4. **iOS/iPadOS.** Not attempted. iPadOS is the project's actual target surface
   (B2-01 / D2-01 are still open) and has far more aggressive process
   management. Nothing here should be assumed to transfer.
5. **Long-horizon behaviour.** The longest single uninterrupted observation was
   720 s. Whether a worker held alive by the keepalive is eventually retired
   after, say, an hour was not tested.

---

## 9. Reproducing

```bash
# 1. collector (binds 127.0.0.1:4037)
node /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/extension/lifetime-probe/collector.mjs active

# 2a. WebKit host — works with no Safari and no signing authorization
bash /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/extension/lifetime-probe/build-wk-host.sh
/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/extension/lifetime-probe/wk-host/build/SWLifetimeProbeHost.app/Contents/MacOS/SWLifetimeProbeHost \
  /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/extension/lifetime-probe/web

# 2b. OR the real Safari path (needs the human Touch ID step)
bash /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/extension/lifetime-probe/make-probe-xcode-project.sh

# 3. drive the arms
curl -X POST 'http://127.0.0.1:4037/mode?m=active'       # 1.2s fetch loop
curl -X POST 'http://127.0.0.1:4037/mode?m=idle'         # no loop, 30s keepalive only
curl -X POST 'http://127.0.0.1:4037/mode?m=silent:1'     # NO keepalive, one-shot alarm at 1 min
curl -X POST 'http://127.0.0.1:4037/mode?m=period:0.6'   # re-arm keepalive with a 36s period
curl 'http://127.0.0.1:4037/note?t=my-arm-label'         # mark the timeline

# 4. read the results
node /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/extension/lifetime-probe/analyze.mjs
node /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/extension/lifetime-probe/summarize-arms.mjs
```

The whole of `extension/lifetime-probe/` is test-only and can be deleted once
Safari.app confirmation in §8 is done and the §6 defect is fixed.
