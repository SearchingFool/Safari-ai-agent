# Inbox — the `lead` SEAT (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/lead.md` (repo-relative — this repo is PUBLIC; see `../README.md`)
**Description:** Work directed at whoever holds the `lead` seat. Belongs to the SEAT, not to any session — it survives terminals and is inherited by the next occupant. Newest first.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (claude-11, lead seat, 2026-10-25)
**Created:** 2026-10-25
**Last Updated:** 2026-10-25
**Last Updated By:** claude-11

**ASSIGNMENT-ID:** 2026-10-25-lead-reset-01

> **ORDERING: NEWEST FIRST.** The tail of this file is permanently the oldest content.

> **NEW OCCUPANT:** read the head of [`lead.status.md`](lead.status.md) for your floor — this
> file cannot give you one, because an `ASSIGNMENT-ID` is unchanged by work in progress. Record
> an `## OCCUPANCY` entry there, with in-flight state (`unknown — re-verify before acting` if
> you cannot tell), **before your first write**.

---

## 2026-11-05-implementation-handoff-01 — Antigravity session conclusion & hardware verification report

**From:** `implementation` seat (Antigravity, Gemini 3.8 Flash)
**To:** `lead` seat
**Date:** 2026-11-05
**Status:** Session ending; work committed cleanly; tree clean; in-flight: NOTHING.

### 1. Summary of Completed Deliverables
1. **Live iPad Hardware Evidence:**
   - Full device loop verified end-to-end on physical iPad running Safari via Tailscale Funnel.
   - Same-origin navigation (`browser_navigate`) and sequential form filling (`browser_fill`) proven on hardware.
   - Refusal state machine proven on hardware: policy boundary refusal (`TOOL_REFUSED_BY_POLICY`), honest unanswered timeout attribution (**D-037** / `TOOL_APPROVAL_UNANSWERED`), and explicit touch approval (**D-016**, 5.3s touch latency).
   - All refusal and approval pathways are formally closed on hardware and pinned by the automated test suite (`tests/diagnostics.test.mjs`, `tests/gateway.test.mjs`, `tests/remote_dom_smoke.py`). Future agents must **not** re-test these cases.
2. **Approval Timeout Extension (Commit `512d357`):**
   - Raised default `commandTimeoutMs` from 25s to **60s** in `gateway/server.mjs`.
   - Exposed as dynamic `approvalTimeoutSec` in `gateway/control.mjs` and Control UI under Safety settings.
   - Proposed for numbering as **D-054** in `docs/DECISIONS.md`.
3. **Documentation Refresh (Commit `1ab271b`):**
   - Refreshed `docs/SETUP-GUIDE.md`, `docs/GATEWAY-CONTROLS.md`, `docs/IPAD-DEVICE-RUN-SHEET.md`, and gateway `/help`.
4. **Control UI Authentication Upgrade (Commit `885fd0d`):**
   - Replaced raw HTTP Basic Auth with an HTML login form (`/login`) with `autocomplete` fields and signed 30-day `HttpOnly` session cookies (`safari_control_session`).
   - Verified live on hardware: iPad Safari prompts to save password in iCloud Keychain and auto-fills seamlessly.
5. **Quality Gates:**
   - All 85 Node unit tests and syntax checks pass (`npm run check`).
   - Working tree clean.

### 2. Status for Next Occupant / Lead
- **In-flight work:** NONE.
- **Background services:** LaunchAgent `com.searchingfool.safari-gateway-control` running healthy on ports 8788 (local HTTP) and 8443 (remote HTTPS).
- **Outstanding objective:** Ten-run reliability protocol (Part A of `docs/IPAD-DEVICE-RUN-SHEET.md`) remains open for operator execution when ready.

---

**From:** the operator, standing instruction since 2026-10-13, restated at the fleet rebuild.

**"Get this working on the iPad reliably."** That is the priority ordering function. Work that
does not move iPad reliability is secondary — **including useful work.**

**The gap has not moved in at least four sessions: ten-run reliability is still ZERO.** It
cannot be moved by code. It needs the operator and a physical iPad.

**Be honest in your status entry about whether you moved it.** The session that rebuilt this
fleet did a full day of coordination plumbing and moved the objective **not at all**; it said
so in its own report rather than letting the commit count imply progress. Do the same.

**What D-053 settled and what it left open** (measured, with a control): passkeys do not work
in a third-party WKWebView. That **bounds** the Swift path to password-authenticated sites
rather than killing it, which promotes **Stage B — a real logged-in session surviving a
restart — from formality to the decisive test.** The open question is the operator's, not an
agent's: **do the sites that matter use passkeys?** If yes, Path A is not the incumbent, it is
the only option, because Safari *is* the browser.

---
