# iPad device run sheet — ten-run reliability and the five unconfirmed fixes

**File:** `docs/IPAD-DEVICE-RUN-SHEET.md` (repo-relative — this repo is public)
**Description:** A scripted protocol for the operator to execute on a physical iPad, covering the ten-run reliability measurement that D2-01 requires, the 0.2.4 permission model (site modes, automatic routine actions, saved per-button approvals), and targeted confirmation of the five fixes (D-035, D-036, D-038, D-039/D-040) that are pinned by tests but have never been exercised by hand. Pass/fail for every case is stated before the run so a result cannot be rationalised afterwards. Written to be followed start to finish without further instruction.
**Author:** claude-04 (Claude Code, Opus 5)
**Created:** 2026-10-13
**Last Updated:** 2026-10-14
**Last Updated By:** claude-04 (added Part A2 for the 0.2.4 permission model)

---

## 0. Why this document exists

`docs/TRACKER.md` lists **ten-run reliability** as outstanding for D2-01, and every success on
record is a *single* run. Reliability is the one dimension with no data at all. Separately, five
merged fixes are pinned only by automated tests and **have never been touched by a thumb**.

**The precedent that justifies the paranoia:** D-039 passed its tests and was **silent on real
hardware** with the volume up. That failure is what produced D-040. A green suite is not
evidence for anything in Part B of this sheet.

**Read before starting:** the agent acts inside a browser where you are already logged in. Run
every step in this sheet against the **demo pages**, never a real account, unless a step says
otherwise. See `README.md` risks 1–6.

---

## 1. Before you pick up the iPad

Run these on the Mac. All four must pass; stop if any fails.

```bash
# from the repo root
npm run check                 # full Node gate
npm run test:browser          # five Chromium/Playwright suites
git log --oneline -1          # record this SHA on the results sheet
cat VERSION                   # record this too
```

**Start the rig and leave this terminal visible:**

```bash
SAFARI_EXTRA_ORIGINS=... bash tools/start-mac-tailscale-test.sh
```

**Archive any previous log before you begin**, so the run's diagnostics are unambiguous:

```bash
mv logs/gateway-diagnostics.jsonl logs/gateway-diagnostics.$(date +%Y%m%d-%H%M).jsonl
```

**On the iPad:** install the current userscript from the local gateway — **0.2.4 or newer**, which is what
Part A2 tests; an older copy fails closed on the unknown `ask` mode, open Safari in **Split View** (mandatory, see §4),
pair the device, and confirm `browser_status` returns from Claude before starting Part A.

---

## 2. Part A — the ten-run reliability measurement

> **Run Part A2 (the permission model) FIRST if you have limited time.** A2-3, A2-4 and A2-6 are
> safety cases; Part A is a reliability measurement. A safety failure invalidates the reliability
> number anyway.

**This is the highest-value item on the sheet.** It is the measurement that the word
"reliably" actually refers to, and nothing else on this page substitutes for it.

### The protocol

Run the **same workflow ten times**, identically, with a cold start between each. Do not vary
the task — variation is what you are trying to measure *against*, not introduce.

**The workflow** (the D1-01 path, already proven once): search → navigate → fill a text field →
fill a time field → select an option → preview → verify. Do **not** submit.

**Between every run:** close the Safari tab, re-open, re-pair. A warm session hides exactly the
session-establishment flakiness this is meant to catch.

### What to record per run — use this table

| Run | Completed end-to-end? | Tool calls | Failures / refusals (verbatim) | Re-pair needed? | Approval latencies (s) | Wall-clock |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| … | | | | | | |
| 10 | | | | | | |

**Record every approval latency**, not just a typical one. This is what closes D-016 properly —
the existing three samples (3.6 / 5.5 / 6.8 s against a 25 s timeout) are *not a distribution*,
and the figure that matters is the **worst** one, under a slow network and a distracted operator.

**Do not discard a failed run.** A run that fails is the most valuable data on the sheet. Record
what it did, do not retry-until-green, and move to the next run.

### Reading the result

```bash
npm run diagnose                  # full report
npm run diagnose -- --since 60m   # just this session
npm run diagnose -- --raw         # raw JSONL if you need to dig
```

**Interpretation — agree this before you start, not after:**

- **10/10** — reliability claim supported for *this* workflow on *this* network. Nothing more.
- **8–9/10** — **not reliable.** A 10–20% failure rate on a seven-step workflow is a broken
  product, not a good score. The failures are the finding; characterise them.
- **≤7/10** — stop and bring the diagnostics back. Do not continue to Part B.

---

## 2b. Part A2 — the 0.2.4 permission model (NEW; did not exist when Part A was written)

0.2.4 added four site modes, automatic routine actions under full permission, and **saved
per-button approvals that persist**. None of it has been exercised by a thumb. These cases are
on the approval path, so they gate everything else.

**Pass/fail for every case below is written BEFORE the run and is not open to interpretation
afterwards.** If a result does not match a stated PASS, it is a FAIL — record it and continue;
do not retry until it passes and do not reclassify it.

### The model you are testing (so you can judge a result without asking an agent)

| Tier | What it is | Behaviour |
|---|---|---|
| `BLOCKED` | payment, account deletion, credential/security controls | **Always refused.** Never promptable, never grantable, on any site including trusted |
| `ELEVATED` | the fail-closed default — form submits, follow/like/subscribe, state toggles, unnamed buttons, anything not provably inert | **Always prompts.** Never auto-runs, never offers "Always allow" |
| `ROUTINE` | provably inert — same-origin links, disclosures, tabs, pagination | Auto-runs **only** under full permission; the **only** tier that may be saved |

Site modes: **Read only** · **Fill and navigate** · **Ask every time** · **Full permission (trusted)**.

### A2-1 — Ask every time: denial

Set the site to **Ask every time**. Have Claude fill a text field. **Deny** the prompt.

- **PASS:** the field is **unchanged**, and the result reports a denial.
- **FAIL:** the field changed; or the result says "timed out"/"uncertain" rather than denied.

D-037 is the precedent: an unanswered prompt must not be reported as an operator decision, and a
denial must not be reported as a timeout. **These are different outcomes and must read differently.**

### A2-2 — Ask every time: approval, and no standing grant offered

Same site. Approve a fill.

- **PASS:** the field fills, **and no "Always allow" option is offered anywhere in the prompt.**
- **FAIL:** "Always allow" appears in Ask mode.

### A2-3 — Full permission: routine runs, elevated still asks

Set the site to **Full permission**. Have Claude do a multi-step tour: follow same-origin links,
open a disclosure, switch a tab, paginate. Then have it click something consequential — a
**Follow/Subscribe/Like** control if the site has one.

- **PASS:** the routine steps run **without prompting** (this is the tour fix), **and the
  Follow/Subscribe/Like control still prompts.**
- **FAIL — and this is the one that matters most:** a Follow/Subscribe/Like fires **without a
  prompt**. That is D-042's rejected behaviour reaching the device. **Stop the run and report it.**

### A2-4 — The submit boundary holds under full permission

Still on **Full permission**, have Claude fill a form and then press its **submit** button.

- **PASS:** the submit **prompts**, even though the site has full permission.
- **FAIL:** the submit fires unprompted. **Stop the run and report it.**

### A2-5 — Saved approval: it saves, and it survives

On a **routine** control under full permission, choose **Always allow**. Repeat the same action.
Then **reload the page** and repeat it. Then **disconnect and reconnect** and repeat it.

- **PASS:** no prompt on any repeat, and the approval is **listed in the Remote AI panel**.
- **FAIL:** it prompts again (grant not saved), or it is not listed (saved but invisible, so it
  cannot be revoked).

### A2-6 — Different-button isolation ⚠ the important one

With a saved approval on button A, have Claude click a **different** control, button B.

- **PASS:** button B **prompts**. The grant covered A, not the page.
- **FAIL:** B runs unprompted. A grant that leaks to a neighbouring control is a **serious
  defect** — report immediately and stop testing grants.

### A2-7 — Revocation works, individually and in bulk

In the panel: **revoke one** approval, then confirm that control prompts again. Then save two or
three and use **Revoke all**.

- **PASS:** a revoked control prompts again, immediately, with no reconnect needed.
- **FAIL:** a revoked control still runs unprompted.

### A2-8 — ⚠ What does Stop do to saved approvals? (EXPECTATION CHECK, not a bug hunt)

Save an approval, then press **Stop**. Reconnect and repeat that action.

**Read this before judging the result.** The code does this **deliberately**: Stop cancels
execution and resets policy to read-only, but *"saved approvals remain in isolated storage until
explicitly revoked"*. So the expected behaviour is that **the approval survives Stop**.

**This case exists to test your expectation, not the code.** D-021 originally proposed grants
*"time-boxed to the current connected session, revoked by Stop"*, and the implementation
deliberately diverges.

- **Record which you expected** before reconnecting, then what happened.
- **If you expected Stop to clear approvals and it did not, that is a finding** — a mismatch
  between the emergency control and the operator's mental model, not a code bug. It needs a
  decision, not a patch.

Blast radius is limited — only `ROUTINE` controls can ever be saved — but Stop is the panic
button and what it forgets should be what you think it forgets.

---

## 3. Part B — the five fixes no thumb has touched

Each is merged and test-pinned. Each is on the **approval path**, which every single action
crosses. Confirm them deliberately; do not assume Part A exercised them.

### B1 — D-038: 44 pt touch targets

Trigger any approval prompt. **Measure, don't eyeball** — the bug was every button at 37 px
against the 44 pt minimum, and it looked fine on inspection.

- [ ] Can you hit **Deny** cleanly, first attempt, holding the iPad naturally?
- [ ] Repeat **five times**. A mis-tap that approves something is the exact failure D-038 fixed.
- [ ] Try one-handed, and with the iPad in the other orientation.

**Note:** the original mis-tap was *not* carelessness — it was a 37 px target. If you mis-tap
now, that is a finding, not your fault.

### B2 — D-039 / D-040: the approval alert

The thing that already failed on hardware once. Reproduce the **exact** conditions of the
original failure — those specifics are what made it silent.

- [ ] Volume **up**, ringer **on**, **YouTube playing in the same browser**.
- [ ] Leave a prompt unanswered and confirm you get an **audible** alert.
- [ ] Confirm the **visual border pulse** happens *regardless* — this is the load-bearing
      channel. D-039's design error was shipping sound as the only channel; audio is the bonus.
- [ ] Repeat with the device **muted**. The pulse must still fire.

### B3 — D-036: Stop is reachable while a command is queued

Listed as outstanding for D2-01 and previously **impossible to test** because Stop was covered.

- [ ] Issue a command, and while it is queued and the prompt is up, **find and press Stop**.
- [ ] Confirm the command is actually revoked — not merely that the UI closed.
- [ ] Confirm the gateway reports a **stop**, not a timeout and not an operator decision.

### B4 — D-037: an unanswered prompt reports itself as unanswered

- [ ] Let a prompt time out untouched (25 s).
- [ ] Confirm the result says *timed out / outcome uncertain* and **does not** claim you denied
      it. Claiming the operator decided something they did not is the defect.

### B5 — D-035: stale-poll ordering (opportunistic only)

A **~1-in-8** race that **cannot be triggered on demand** — do not chase it.

- [ ] Switch tabs back and forth ~20 times, watching for a handover that stalls and forces a
      manual **Take over**.
- [ ] If it happens: capture the timestamp and the diagnostics immediately. That is a rare catch.
- [ ] If it does not happen: that is **not** confirmation. Record "not observed in N transitions."

---

## 4. Part C — the Split View limit (D-029)

**Accepted as a documented operating limit** (operator decision, 2026-10-13). This part
characterises it rather than testing a fix; there is no fix.

iPadOS **suspends** a backgrounded Safari tab. The session ages out of the 45 s window and
page-touching tools fast-fail in ~1 ms. **No code change lifts this**, and the native extension
does not either — `docs/SERVICE-WORKER-LIFETIME.md` measured the MV3 worker at ~30 s of life per
wake, with a keepalive that provably cannot restore the session.

- [ ] Confirm Split View with Safari **visible** works for a full workflow.
- [ ] Background Safari mid-command; confirm the refusal is **clean and honest** — *"No active
      iPad Safari device"* or *"The paired Safari tab is not visible"* — and never a false success.
- [ ] Time how long after returning before the session recovers. Record it.

**The important question for the future-scoping work:** how often does normal use *naturally*
break this? Note every time you instinctively swiped away and broke a run. That frequency is the
real input to whether the architecture needs to change.

---

## 5. After the session

1. Archive the log: `cp logs/gateway-diagnostics.jsonl logs/device-run-$(date +%Y%m%d).jsonl`
2. Run `npm run diagnose` and keep the report.
3. Hand both plus the Part A table back to the fleet lead for analysis.
4. **Stop the rig** — Funnel makes the Mac publicly reachable while it runs (`README.md` risk 6).

### What this session can and cannot close

| Can close | Cannot close |
|---|---|
| D2-01 ten-run reliability (Part A) | **Independent security review** — needs an outside party |
| Stop-while-queued (B3) | D-035 (race; absence is not proof) |
| D-016 properly, with a real distribution | Same-origin recovery, if not covered by Part A |
| D-038, D-039/D-040 on hardware | Anything about ChatGPT/Gemini — research only, unapproved |

**Do not mark D2-01 accepted on this sheet alone.** The independent security review is a
separate, still-open gate, and `docs/TRACKER.md` is explicit that a green suite is not acceptance.
