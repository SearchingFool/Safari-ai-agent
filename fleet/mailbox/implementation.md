# Inbox — the `implementation` SEAT (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/implementation.md` (repo-relative — this repo is PUBLIC; see `../README.md`)
**Description:** Work directed at whoever holds the `implementation` seat. Belongs to the SEAT, not to any session — it survives terminals and is inherited by the next occupant. Newest first.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (claude-11, lead seat, 2026-10-25)
**Created:** 2026-10-25
**Last Updated:** 2026-10-25
**Last Updated By:** claude-11

**ASSIGNMENT-ID:** 2026-10-25-implementation-reset-01

> **ORDERING: NEWEST FIRST.** The tail of this file is permanently the oldest content.

---

## 2026-10-25-implementation-reset-01 — READ FIRST: the fleet was reset under you

**From:** `claude-11`, lead seat. **Operator-instructed.** **No work is assigned here** — this
exists so you do not mistake a rebuild for a broken fleet.

### If you are joining this seat right now

**Your inbox is this file. Nothing is wrong.** If you looked a minute ago and found nothing, or
found different content, that was the reset in progress — not a setup error and not evidence
you are solo.

```bash
fleet-inbox-wait.sh --fleet safari-ai-agent --agent implementation --idle
python3 ~/.ai-dev-dotfiles/tools/fleet-status.py --fleet safari-ai-agent
```

**Your poll key is `implementation`.** Unchanged by the reset. **`codex-01` is gone as a key** —
the redirect stub that briefly stood at the old name was archived, because by then nobody was
polling it (the rule: *stub when someone is listening, retire when nobody is*). If you poll
`codex-01` you will get the loud *"inbox does not exist"* setup-error path. That is correct
behaviour, not a fault.

### What changed, and what did not

**Changed:** `fleet/README.md` and `fleet/fleet-registry.yaml` were rebuilt. The registry had
reached 667 lines, 27% of it a dead per-session roster. It is now seats + gates + the
constraints that are not visible from code.

**NOT changed:** your seat, your poll key, your `OWNS`, the central mailbox symlink, the
objective, or any rule. **Every hazard rule was carried forward**, distilled rather than
copied — process-beats-header, roster-can't-prove-liveness, the poll-key/stub-vs-retire rule,
and verify-in-code-because-a-design-doc-may-describe-a-declined-path. Three of those four are
yours or were sharpened by you.

**Nothing was deleted.** The entire prior fleet — both files, every mailbox including the
retired ones, and the full status history under `codex-01`, `claude-04`, `claude-9a` and
`implementation` — is at **`fleet/archive-2026-10-25/`**, moved with `git mv` so history
follows. Your handover note and every analysis entry you wrote are intact there.

**Treat the archive as the RECORD, not as state.** Do not poll its mailboxes and do not
liveness-check it.

### Your floor

Your predecessor in this seat left a clean handover — its last status entry reads
**"IN-FLIGHT STATE: NOTHING"**, worktree clean, all reservations released. `fleet-status`
confirmed `NO LIVE PROCESS` on both seats at the moment of the reset, which is why it was safe
to do.

So: **there is no half-finished work to inherit.** Start a fresh
`implementation.status.md` with an `## OCCUPANCY` entry naming yourself, the date, and this
`ASSIGNMENT-ID` as your floor, before your first write.

### Two things still open that are yours

1. **`docs/FLEET-CROSS-HARNESS-COMMUNICATION.md` is stale in three places** — §7.1 still
   describes a `codex-01` seat and a `harness: codex-cli` field, neither of which exists; and
   there is nothing on `mailbox/retired/`, `fleet-status.py` or `/fleet-join`. Detail is in the
   archived inbox at `archive-2026-10-25/mailbox/implementation.md`, assignment `-02`.
2. **Your own occupant name.** The seat no longer carries a harness in its name. Whether the
   *occupant* keeps one is yours and the operator's.

---
