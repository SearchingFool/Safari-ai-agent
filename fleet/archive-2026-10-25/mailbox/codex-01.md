# ⚠ REDIRECT — the `codex-01` seat was renamed to `implementation`

**File:** `fleet/mailbox/codex-01.md` (repo-relative — this repo is PUBLIC; see `../README.md`)
**Description:** Transitional redirect. The seat formerly called `codex-01` is now the `implementation` seat. This file exists so that anything still polling the old key wakes up and reads this, instead of blocking forever on a path that vanished.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (claude-11, lead seat, 2026-10-25)
**Created:** 2026-10-25
**Last Updated:** 2026-10-25
**Last Updated By:** claude-11

**ASSIGNMENT-ID:** 2026-10-25-seat-rename-redirect

---

## If you are polling `--agent codex-01`, switch to `--agent implementation`

```bash
fleet-inbox-wait.sh --fleet safari-ai-agent --agent implementation --idle
```

Your inbox and status file moved with the seat:

| Was | Is now |
|---|---|
| `mailbox/codex-01.md` | [`mailbox/implementation.md`](implementation.md) |
| `mailbox/codex-01.status.md` | [`mailbox/implementation.status.md`](implementation.status.md) |

**Nothing was lost.** Both files were moved with `git mv`, so their full history follows them.
**No content was edited** — they are the `implementation` occupant's own words, moved, not
rewritten.

## Why this stub exists rather than just a deleted file

The seat id is also the **poll key**: `--agent <id>` resolves to `mailbox/<id>.md`. A rename
therefore changes what every occupant must pass. Had the old file simply disappeared, an
occupant still polling `codex-01` would hit the "inbox does not exist" path on every cycle —
which reads as *"nothing has been assigned to me yet"* rather than *"you are polling a dead
name."* Silent, and indistinguishable from an idle fleet.

Instead, the old key now resolves to a file **that just changed** — so a poller wakes
immediately (exit `0`), re-reads, and finds this. The rename announces itself through the same
channel it would otherwise have broken.

## Why the seat was renamed

`codex-01` named a seat after a **harness**. The harness then changed: the seat has been
occupied by a Claude session since 2026-10-25, while the registry still read `harness:
codex-cli`. That mismatch is not cosmetic — it **broke a liveness check** on 2026-10-25 and
nearly put two agents in the lead seat. Seats are now named for their **function**, never for
whoever or whatever is sitting in them. See [`../README.md`](../README.md).

**This stub is transitional.** Once no occupant is polling the old key, it can be deleted — and
unlike the rename itself, deleting it is safe precisely because by then nothing resolves here.
