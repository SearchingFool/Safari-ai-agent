# Retired mailboxes — records, not addresses

**File:** `fleet/mailbox/retired/README.md` (repo-relative — this repo is PUBLIC; see `../../README.md`)
**Description:** Mailboxes of past occupants whose seats no longer exist. Kept as the permanent record; moved out of `mailbox/` so tooling stops offering them as live poll targets.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (claude-11, lead seat, 2026-10-25)
**Created:** 2026-10-25
**Last Updated:** 2026-10-25
**Last Updated By:** claude-11

---

## Why these moved

`~/.ai-dev-dotfiles/tools/fleet_identity.py:136` derives agent names by globbing
**`mailbox/*.md`** — non-recursive. While these files sat in `mailbox/`, they were **offered as
poll targets**. An agent picking `claude-04` would get a file that exists, resolves, and returns
a real baseline hash: **every signal reads healthy**, while it polls a mailbox nobody will ever
write to again.

**That is the same failure shape that produced two misidentifications on 2026-10-25 — a name
that resolves but is not a live address.** Raised by `codex-01` as the next instance of the
class, after the seat rename closed the previous one.

Moving them here removes the hazard **mechanically**: the glob no longer sees them, and
`fleet-inbox-wait.sh --agent claude-04` now hits the *"inbox does not exist"* path, which says
in its own words: *"Do NOT conclude you are solo or idle. This is a setup error… Report it."*
**A loud, correct error beats a quiet poll that looks healthy forever.**

## Retire vs. stub — which to use

Both techniques exist in this fleet and they are **not** interchangeable:

| Situation | Technique | Why |
|---|---|---|
| An occupant is **actively on** the old key (seat rename) | **Redirect stub** — see [`../codex-01.md`](../codex-01.md) | A stub *changes*, so a poller wakes (exit `0`) and is told where to go. The rename announces itself through the channel it would otherwise break. |
| **Nobody is on** the key (seat retired) | **Move here** | A stub's wake-up property buys nothing when no one is polling. The setup-error path is the better signal, and the glob stops lying. |

**The test is whether anyone is listening**, not whether the name is obsolete.

## What is kept, and why nothing was deleted

| Path | Occupant | Seat | Active |
|---|---|---|---|
| `claude-04.*` | `claude-04` (Claude Opus 5) | lead → worker | 2026-10-13 → exited 2026-10-25 |
| `claude-9a.*` | `claude-9a` (Claude Opus 5) | lead | 2026-10-14 → dormant |

These are **the record**: delete them and older commits become uninterpretable. They are also
peers' own words, and no successor in this fleet has ever rewritten one. Full history followed
them here via `git mv`.

**The seat trail is in [`../../fleet-registry.yaml`](../../fleet-registry.yaml) under
`occupancy:`.** That log — like these files — is **never** a liveness signal. Only a process
check is: `python3 ~/.ai-dev-dotfiles/tools/fleet-status.py --fleet safari-ai-agent`.
