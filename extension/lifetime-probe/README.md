# Service Worker Lifetime Probe — TEST ONLY

**File:** `extension/lifetime-probe/README.md`
**Description:** Pointer file. This directory is a measurement harness, not product code.
**Author:** safari-ai-agent-sw-lifetime (Claude Code, Opus 5)
**Created:** 2026-10-11
**Last Updated:** 2026-10-11
**Last Updated By:** safari-ai-agent-sw-lifetime

---

**Do not ship any of this, and do not install it for any purpose other than
re-running the measurement.** It is a separate extension with its own bundle id
(`io.labguide.SWLifetimeProbe`) so it can never be confused with, or installed
over, the real Safari AI Agent extension in `extension/web/`.

It exists to answer one question: **how long does a Safari/WebKit MV3 background
service worker actually live, and does the 30 s `alarms` keepalive revive it?**

Results, method, caveats and the reproduction steps are in
**`docs/SERVICE-WORKER-LIFETIME.md`**. Read that, not this.

| Path | What it is |
|---|---|
| `web/` | The probe extension. `probe.js` mirrors only the lifecycle primitives of `extension/web/background.js`. |
| `collector.mjs` | Localhost event collector on 127.0.0.1:4037. Server-side timestamps are the ground truth. |
| `wk-host/main.swift` | Minimal `WKWebExtensionController` host. Loads the probe without Safari, because Safari's unsigned-extension toggle is behind a Touch ID gate. |
| `build-wk-host.sh` | Builds the above. No Xcode project, no signing identity. |
| `make-probe-xcode-project.sh` | The real Safari path, for when a human can authorize unsigned extensions. |
| `analyze.mjs`, `summarize-arms.mjs` | Reduce the event log to the numbers. |
| `evidence-2026-10-11.jsonl` | Frozen raw log backing every number in the doc. |

This directory can be deleted once the Safari.app confirmation listed in
`docs/SERVICE-WORKER-LIFETIME.md` §8 is done.
