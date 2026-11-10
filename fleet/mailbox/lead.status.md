# Status — the `lead` SEAT (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/lead.status.md` (repo-relative — this repo is PUBLIC; see `../README.md`)
**Description:** Reports from whoever holds the `lead` seat. Belongs to the SEAT, not to any session. Newest first.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (claude-11, lead seat, 2026-10-25)
**Created:** 2026-10-25
**Last Updated:** 2026-10-25
**Last Updated By:** claude-11

> **ORDERING: NEWEST FIRST.** The tail is permanently the oldest content.

> **EVERY ENTRY CARRIES ITS OCCUPANT:** `## YYYY-MM-DD — <occupant> — <subject>`.
> This file outlives its authors.

> **THIS FILE IS THE SEAT'S HIGH-WATER MARK** — the inbox cannot give a new occupant a floor.

## 2026-11-10 — safari-ai-agent-90e45e — integrated pilot path and both client choices

**OCCUPANCY:** `safari-ai-agent-90e45e`, Codex, continuing the operator-assigned lead work.
Fleet status showed no live lead or implementation occupant before integration.

**Integrated:** fast-forwarded `docs/releasepath` into `main` at `461e896` and merged
`feat/swiftalt` at `6672735`. The repo now contains both the Userscripts and Swift clients. Updated
the root README to present them as user choices, linked a source-build/install guide for Swift,
and clarified that the first pilot should use Userscripts. The Swift client remains experimental.

**Verification:** `npm run check` passed (85 tests); `npm run test:browser` passed all workflows
and approval-layout checks; `npm run diagnose` exited 0 and reported 1,020 historical events
needing attention, chiefly 989 device-token mismatches, plus MCP protocol mismatches and three
session conflicts. Swift protocol tests passed (6); unsigned macOS and iOS Simulator builds
passed. These results do not exercise the Swift gateway/action flow or certify physical-device
acceptance.

**Next:** pilot publication is still pending. Checklist now limits onboarding to one user and one
iPad, with Userscripts. A human must choose that pilot user, configure/review the gateway endpoint
and credentials, publish the versioned artifact, and run the real iPad install/use/Stop/removal
rehearsal. The ten-run reliability and independent security gates remain open.

## 2026-11-10 — safari-ai-agent-90e45e — Swift alternate advanced; validation boundary recorded

**OCCUPANCY:** `safari-ai-agent-90e45e`, Codex session, continuing the lead assignment from
2026-11-09. **Floor:** the assignment entry immediately below. Fleet status showed no live
implementation or lead peer before work resumed.

**In-flight:** the Swift app now handles the five shared page commands, applies per-origin policy,
uses a native one-time approval overlay, and checks arguments/expiry/origin locally. macOS fixture
inspection has runtime evidence; current macOS and iOS Simulator builds pass; six Swift protocol
tests, `npm run check` (85 tests), `npm run test:browser`, and `npm run diagnose` pass. The current
simulator build was installed and launched. The Swift gateway exchange, remote approvals/actions,
physical iPad, signing, and pilot acceptance remain unverified. Changes are uncommitted in the
`feat/swiftalt` worktree per the Swift seat assignment; do not treat these as ready for pilot use.

**Operator decisions still open:** weigh the same-process gate in the app, passkey incompatibility
(D-053), and whether the Swift host complements or replaces Userscripts. Ten-run physical iPad
reliability remains open. No gateway exposure or credentials were changed.

## 2026-11-09 — safari-ai-agent-90e45e — release and Swift workstreams assigned

**OCCUPANCY:** `safari-ai-agent-90e45e`, Codex session, assigned the `lead` seat by the
operator on 2026-11-09. **Floor:** 2026-11-05 implementation handoff at the head below;
fleet-status reported no live seat occupants and no findings before this assignment.

**Assignments:** `implementation` is assigned the pilot release/onboarding path. Its scope now
includes `docs/RELEASE_CHECKLIST.md`; its existing README and setup-guide ownership is unchanged.
`swift-alternate` is a new function seat for `app/**` and `docs/SWIFT-APP-DESIGN.md`, targeting
both macOS and iOS. The release path keeps Tailscale as the documented primary setup and may
mention other free tunnel/VPN options only from official documentation; those alternatives are
not to be represented as tested or supported. These are separate write scopes.

**In-flight:** both workers are reviewing read-only until their seat inboxes and scopes are
available in their worktrees. The operator's ten-run iPad reliability protocol remains open;
this coordination work does not close it. No device acceptance or security review is claimed.

---

## 2026-10-25 — claude-11 — Fleet rebuilt; objective still untouched

**OCCUPANCY:** `claude-11`, Claude Code (Opus 5), session `safari-ai-agent-11`, queuectl
`safari-ai-agent-claude-11`, lead seat from 2026-10-25. **Floor: none — this seat's files were
recreated today.** Prior lead history is at `../archive-2026-10-25/mailbox/lead.status.md`.

**The honest headline, first: this fleet's objective did not move today.** Ten-run iPad
reliability is still **zero**. Everything below is coordination machinery, justified only
because the fleet could not wake its own agents and every exchange cost the operator a manual
approval.

**Rebuilt the fleet at operator instruction.** The registry had reached 667 lines, 27% of it a
dead per-session roster, plus four layers of correction in the README. Now: seats, gates, and
the constraints not visible from code. **Nothing deleted** — the whole prior fleet is in
`archive-2026-10-25/`, `git mv`'d so history follows. Every hazard rule carried forward,
distilled not copied. Done at a verified-safe moment: `fleet-status` showed `NO LIVE PROCESS`
on both seats and the departing occupant had recorded `IN-FLIGHT STATE: NOTHING`.

**What was fixed earlier in the day, in order of how much it mattered:**

1. **Self-polling was silently dead fleet-wide.** `fleet-inbox-wait.sh:99` resolves to the
   central path; the 2026-10-13 in-repo move left that a real directory of frozen files, so
   every poll watched dead files, **never fired and never errored**. Fixed by symlinking the
   central path (mailbox *and* registry) to the live in-repo one. Diagnosed by the
   `implementation` occupant.
2. **Seats replaced per-session identities** — four `claude-*` entries in twelve days, each a
   liveness check waiting to fail.
3. **A seat named after a harness broke an identity check.** Renamed `codex-01` →
   `implementation`, with a redirect stub during the transition.
4. **Launch criteria are now recorded** on `session_started.data.launch` (dotfiles `455f100`),
   because autonomy was chosen per launch and written nowhere — which made "why do messages
   need approval now?" unprovable after the fact.

**What I got wrong, which is the more useful record:**

- **Overrode my own correct process check with a file header** and nearly stood down from a
  seat that was mine. Rule now: *a header is an assertion, a process is evidence.*
- **Wrote the wake-up section wrong three times**, every time by reasoning from documentation
  instead of reading code — once promoting a **rejected** design to an intended one. Closed the
  recurrence vector with a correction banner on `FLEET-TMUX-LAUNCH.md`, not just a local fix.
- **Asserted the 2026-10-12 decision as fact before verifying it**, when my own grep had come
  back empty and I did not flag that.
- **Nearly shipped a check that would have flagged six healthy fleets.** Caught by the peer.

**Tooling delivered:** `fleet-status.py` + the `/fleet-join` skill (dotfiles `2993e6c`,
`687bbcc`) — liveness by process, env-stamp and misnomer detection, self-poll health,
assignment floor. **Running it found three defects in itself**, including reporting a live peer
as dead.

**Open and not an agent's call:** nothing pushed; six other fleets unaudited for the self-poll
defect; and **the iPad measurement, which is the only item here that moves the objective.**

**Coordination:** every write reserved and released; no peer file edited except the
operator-instructed seat rename and this reset, both of which moved content without altering it.

---
