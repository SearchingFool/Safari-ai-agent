# Inbox — claude-04 (fleet `safari-ai-agent`)

**ASSIGNMENT-ID:** 2026-10-13-claude-04-01-LEAD-IPAD-RELIABILITY
**UPDATED:** 2026-10-13
**FROM:** operator (Libor Ballaty) — "consider yourself the lead but work collaboratively
with the other agent"; then "review the repo I need to get this working on the ipad reliably"
**QUEUECTL_AGENT:** `safari-ai-agent-claude-04`

> **ORDERING: NEWEST FIRST.** My current assignment is the ID line above, and its body is the
> **first `##` section below**. Everything further down is older, closed history kept for
> context. **The tail of this file is permanently the oldest content** — reading the end to
> check whether a new assignment landed is structurally guaranteed to produce a false
> negative. Read the top.

---

## Communication

- **Operator** — interactive terminal, Claude Code session **`safari-ai-agent-04`** (`f1e05f`).
- **Orchestrator** — none live. The registry's `lead` (`claude-safari-ai-agent`, 2026-10-11) has
  produced no mailbox traffic and is not a discoverable session. Seat treated as **vacant**.
- **Peer `codex-01`** — cross-harness, **no direct messaging**. `codex-01.md` is the channel;
  the operator relays. It may not be fleet-activated at all (empty mailbox until 2026-10-13).

---

## ASSIGNMENT — lead; drive iPad reliability

**Role:** lead engineer / architect / integrator. Granted 2026-10-13, **collaborative** — I set
priority, run the gate, own D-### numbering and integrate. I do **not** redirect `codex-01`
mid-task, edit its files, or overrule the operator.

**Objective:** *"get this working on the iPad reliably."* This is the priority ordering function.
Work that does not move iPad reliability is secondary, including useful work.

**Reserved to the operator** (carried forward from the 2026-10-11 grant — lead does NOT hold
these): widening the gateway origin allowlist, exposing new public endpoints, spending money,
enrolling in paid programmes. Plus: `git reset`, and satisfying the Touch ID sheet that enabling
an unsigned Safari extension raises.

**Gate state (reviewed 2026-10-13):** the blocker is not a bug list. Ten-run reliability has
**zero** runs; D-029/Split View is a platform ceiling no code lifts; five approval-path fixes are
test-pinned but never touched by a thumb. Full analysis in `fleet-registry.yaml` →
`ipad_reliability_gate`. The first and third need the operator and a physical iPad.

### OWNS (disjoint write-scope) — stay inside this

- `fleet/mailbox/claude-04.md`
- `fleet/mailbox/claude-04.status.md`
- `fleet/mailbox/README.md` (channel map)
- `fleet/fleet-registry.yaml` (own `agents:`
  entry and the proposed `codex-01` entry only — **not** the `leadership:` block)

**Nothing inside the repo working tree is in my scope yet.**

**Not mine:** `gateway/server.mjs`, `src/remote.js`, `tools/build-remote.mjs` — uncommitted and
modified 2026-10-13 ~17:40, presumed `codex-01`'s live work. Also not mine: the `leadership:`
block of the registry, `docs/DECISIONS.md` D-### numbering (lead-owned), and the live test rig.

### Boundaries and standing rules

- Gate before any commit: `npm run check` (23/23), `npm run test:browser`, `npm run diagnose`.
- Branch work in a **separate worktree** — `git checkout` is wrapper-blocked in the primary
  checkout; `git reset` is denied to agents and goes to the operator.
- Path-form commits after verifying the staged set. No `Co-Authored-By` trailers.
- No new npm dependency without a decision record. Zero-dependency is deliberate here.
- Do not widen this `OWNS` myself — ask the operator.
