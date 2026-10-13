# Status — claude-04 (fleet `safari-ai-agent`)

> **ORDERING: NEWEST FIRST.** The most recent report is the first `##` section below.
> Everything further down is older history. **The tail of this file is permanently the oldest
> content** — do not read the end to find current state.

---

## 2026-10-13T16:05Z — took lead; reviewed repo against the iPad-reliability goal

**Operator granted lead, collaboratively.** Recorded in `fleet-registry.yaml` with an explicit
`collaboration_clause` (lead may set priority and gate; may NOT redirect codex-01 mid-task or
edit its files) and the reserved-to-operator list carried forward from the 2026-10-11 grant.
Still **zero repo files touched by me** — no edit, no stage, no commit, no branch, no worktree.

**Goal restated by operator:** *"get this working on the iPad reliably."* Recorded as the
fleet's priority ordering function.

**Review result — the gap is structural, not a bug list.** "Works on iPad" is proven
(2026-10-11, 17 tool calls, full workflow). "Works *reliably*" has almost no evidence:

1. **Ten-run reliability: zero runs.** Every success on record is a single run. The one
   dimension the operator named is the one with no data. Needs operator + device.
2. **D-029 Split View is a platform ceiling.** iPadOS suspends backgrounded tabs; session ages
   out; page tools fast-fail in 1 ms. No code lifts it — **and neither does the native
   extension**: `docs/SERVICE-WORKER-LIFETIME.md` says the MV3 worker lives ~30 s at a time and
   the keepalive provably cannot restore the session. Product-shape decision for the operator.
3. **Five approval-path fixes (D-035/036/038/039/040) are test-pinned, never touched by a
   thumb.** Approval is on the critical path of every action. **D-039 already passed its tests
   and was silent on real hardware** — that is the precedent proving tests don't substitute here.
4. D-014 single point of failure (Userscripts: App Store-only, single-maintainer, beta).
5. F-01 native extension has **never run in Safari once** — not a ready escape hatch for 2 or 4.

Full detail written to `fleet-registry.yaml` → `ipad_reliability_gate`. Also corrected the
registry's `open_defects`, which was stale from fleet formation and wrongly listed **D-016 as
open** — it is **closed favourably** on device (iPad 3.6/5.5/6.8 s vs 25 s timeout, *faster* than
macOS). Left a staleness warning pointing at `docs/TRACKER.md` as source of truth.

**Two concrete defects found in codex-01's in-flight work**, sent as findings not orders:

- **`npm run check` does not cover the new control files.** The script enumerates `node --check`
  targets explicitly rather than globbing, so `gateway/control.mjs`, `gateway/control-ui/app.js`
  and `tools/install-gateway-controls.mjs` escape the syntax gate silently — suite green, new
  code unchecked.
- **Ports 8787 and 8788 are unregistered and both listening now** (process ids redacted ). No
  collision with anything registered, so nothing is broken — but 8788 is a new permanent binding
  and the port rule makes registration due. Offered to write the registry entry since it's
  outside codex-01's scope; **will not touch it unasked.**

**Assessment of codex-01's work, for the record:** the gateway control plane is careful work —
`timingSafeEqual`, loopback-only bind, refuses to stop a gateway it didn't start, tests written
alongside. But it is **Mac-operator convenience and not on the iPad-reliability critical path.**
I did not ask it to stop: killing a tested task mid-flight wastes more than it saves. Told it
where the work sits so we don't both think the critical path is covered.

**Blockers:**
1. **codex-01 has still not replied** and remains unconfirmed as fleet-activated. Needs operator
   relay. Asked it two questions: full write scope, and whether the control panel is near landing.
2. **Two operator decisions needed**, neither of which an agent can make: (a) accept "Split View,
   foreground, no app-switching" as a documented operating limit, or change product shape;
   (b) schedule a device session — ten-run reliability and the five thumb-untested fixes both
   require a physical iPad and cannot be unblocked by code.
3. `QUEUECTL_AGENT`/`FLEET_ID` still unset — hook reported my own claims as `⛔ CONTENDED` six
   more times this turn, all self-matches. Would block me in block mode.

**Next:** awaiting codex-01's reply and the operator's call on the two decisions. Will not start
repo work until scope is deconflicted.

---

## 2026-10-13T15:45Z — joined the fleet; idle, awaiting deconfliction + role

**Who I am:** `claude-04`, Claude Code (Opus 5), session `safari-ai-agent-04` (`f1e05f`), on
libors-macbook-pro-2. `QUEUECTL_AGENT` should be `safari-ai-agent-claude-04` — **it is unset in
my environment**, see Blockers.

**What I did:** coordination read only. No repo file touched, no branch, no worktree, no commit.

- Read `fleet-registry.yaml` — fleet formed 2026-10-11, lead `claude-safari-ai-agent`. No mailbox
  traffic from it, not a live session ⇒ **treating the orchestrator seat as vacant.**
- Determined channels rather than assuming them: **no tmux transport** on this machine (only an
  unrelated `tc-probe` socket on `/tmp/tmux-501/`), and Codex is **not discoverable** from Claude
  Code. So `claude-04 ↔ codex-01` is cross-harness with **no direct messaging** — the file is the
  channel and the operator relays. Recorded in `README.md`.
- Found the primary checkout dirty: `gateway/server.mjs` (+16/-3), `src/remote.js` (+12/-2),
  `tools/build-remote.mjs` (+2/-1), all mtime 2026-10-13 ~17:40 local. Operator says the other
  agent is Codex ⇒ presumed **live, in-flight** work.
- Wrote `README.md` (participants + channel matrix), `codex-01.md` (peer deconfliction request —
  explicitly *not* an assignment), this file, and my own inbox.
- Reserved via queuectl: the three fleet-coordination files above. **Nothing in the repo.**

**Deliberate non-action — the one judgment call worth flagging:** the standing
"commit-everything / never leave the worktree dirty" default would push me to commit those three
files. **I did not.** That default targets *completed* work at handoff; this diff was modified
minutes ago by a live peer, and committing underneath an agent mid-edit destroys work rather than
preserving it. Logged here so the choice is visible and reversible rather than silent.

**Blockers / questions:**

1. **Awaiting `codex-01`'s reply** in `codex-01.status.md` — three questions in `codex-01.md`:
   are the three dirty files its live work, what is its write scope, and which open defects is it
   *not* taking. **Codex may not be fleet-activated** (this mailbox was empty until today and
   Codex has never written here), so this likely needs an operator relay to land at all.
2. **My role/`OWNS` is unconfirmed.** Operator asked me to align with Codex first rather than
   take work. Staying narrow until told otherwise (contract rule 2). Candidate work, pending both
   the reply and operator assignment: D-016, D-017, D-019, D-020, D-021, D-023.
3. **`QUEUECTL_AGENT` and `FLEET_ID` are unset in my session env.** Consequence: the Claude
   pre-write coordination hook cannot tell my own reservations from a peer's, so it reports my
   own active claims as `⛔ CONTENDED` (observed three times while writing these files — all
   self-matches, no real conflict). Harmless in warn mode; **would block me in block mode.** Fix
   is to export `QUEUECTL_AGENT=safari-ai-agent-claude-04` at session launch.
4. **Lead seat vacant.** Neither worker may assign the other. `OWNS` confirmation, D-### numbering
   and the open architecture decisions (safety-policy location blocking D-019/D-020/D-021;
   product framing; D-015 protocol version; F-01 native extension) need the operator or a
   reinstated lead.

**Next:** idle. Will re-read `codex-01.status.md` at the start of each turn and act once scope is
confirmed.
