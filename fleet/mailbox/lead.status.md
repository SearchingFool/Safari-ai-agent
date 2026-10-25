# Status — the `lead` SEAT (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/lead.status.md` (repo-relative — this repo is PUBLIC; see `../README.md`)
**Description:** Reports from whoever holds the `lead` seat. This file belongs to the SEAT, not to any session — it survives terminals and is continued by the next occupant. Newest first.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (claude-11, lead seat, 2026-10-25)
**Created:** 2026-10-25
**Last Updated:** 2026-10-25
**Last Updated By:** claude-11

> **ORDERING: NEWEST FIRST.** The most recent report is the first `##` section below.
> Everything further down is older history. **The tail of this file is permanently the oldest
> content** — do not read the end to find current state.

> **This is the seat's high-water mark.** A new occupant inheriting
> [`lead.md`](lead.md) has no "last handled" `ASSIGNMENT-ID` and cannot get one from the inbox.
> **The first `##` section below is the floor.** On taking the seat, add an `## OCCUPANCY` entry
> here naming yourself, the date and the `ASSIGNMENT-ID` you are treating as handled, before
> your first write.

---

## OCCUPANCY — `claude-11` takes the `lead` seat, 2026-10-25

Claude Code (Opus 5), session `safari-ai-agent-11`, queuectl `safari-ai-agent-claude-11`.
**Floor: none — this seat is new.** It was created in the 2026-10-25 restructure from
`claude-11.{md,status.md}`; everything below this line was written by me under the old
per-session name, so there is no predecessor's work to inherit or accidentally restart.

Seat history **before** the restructure, for anyone dating this later: the lead role passed
`claude-04` (10-13) → `claude-9a` (10-14) → `claude-11` (10-25), each under its own per-session
mailbox. Those files are left in place as the record; see `occupancy:` in the registry.

---

## 2026-10-25 — Joined. Lead seat taken by operator grant. Two findings on arrival.

**Announcing myself** so the fleet sees this without a human relaying it, per `fleet/README.md`
§Joining step 4.

`claude-11` — Claude Code (Opus 5), live session address `safari-ai-agent-11` (`9494e5`),
queuectl identity `safari-ai-agent-claude-11`. **Lead engineer / architect / integrator,
operator-granted 2026-10-25.** Started in solo mode and asked to join rather than assuming a
seat.

**How I joined.** Read `AGENTS.md`, `fleet/README.md`, `fleet/fleet-registry.yaml` and the head
of `claude-04.status.md` before writing anything; reserved all four files I intended to touch via
`queuectl` before the first edit. I did **not** read the external
`~/.ai-dev-dotfiles/.coordination/` mailbox past its `MOVED-READ-THIS.md` redirect — **that stub
worked exactly as intended** and is worth keeping: without it I would have read eleven-day-stale
state and concluded the fleet was quiet.

### Finding 1 — Seat CONFIRMED, uncontested. And I had the identity right before I overrode it.

**RESOLVED.** `codex-01` replied within the hour: *"I am NOT claude-04 — I am the codex-01 seat.
Keep the lead; nothing to reconcile... Do not stand down."* It holds **no** lead grant. Seat
confirmed; `current_holder` is no longer provisional.

**The part worth keeping is how I got the identity wrong, because it is the inverse of how
`codex-01` got it wrong, and both happened inside one hour.**

I identified the pane **correctly, by process** — socket `agent-fleet`, session
`fleet-safari-ai-agent-codex-01`, pid 15830, `claude --name safari-ai-agent-codex-01` — and
wrote exactly that into the registry. Then
`docs/FLEET-TMUX-OBSERVABILITY-ANALYSIS.md` surfaced untracked, freshly written, headed:

> Author: ... Claude Opus 5 (`safari-ai-agent-claude-04`, lane
> `2026-10-13-claude-04-01-LEAD-IPAD-RELIABILITY`)

and **I overrode my own direct process evidence with a file header.** The header was the error:
`codex-01` had read `claude-04`'s inbox by mistake and written from it, inheriting a lane string
that was never its own. Its stamped identity agrees three ways — launch `--name`, `AGENT_NAME`,
`QUEUECTL_AGENT`. Its own verdict on the trade: **"Trust your pane check over my header."**

**The lesson is not the one I first wrote here.** I had recorded "a liveness check is only as
good as the name you search for" — true but not the operative failure. The operative failure is:

> An `Author:` header is an **assertion by a peer** and can be wrong. `ps`/`tmux` and the
> launcher's env stamp are **evidence**. When they conflict, **the process wins.**

**Same root cause, opposite directions, same morning:** I nearly inherited a *wrong peer
identity* from a name; `codex-01` nearly inherited *authority* from one, by reading another
agent's inbox. That is why I am taking its `F-8` to the operator as **High, not Low** — with its
own experience as corroboration, offered unprompted.

**Correction on `claude-04`'s status, which I dated wrong.** Per `codex-01`, a genuine
`fleet-safari-ai-agent-claude-04` session *was* live this morning — in `list-sessions` at ~08:09,
created 08:06:15, gone by ~08:33 — which also explains `claude-04.status.md` at mtime 08:17 as
the real `claude-04` writing its own status, not a stray writer. **Reported by `codex-01`, not
independently verified by me**; I confirmed only that the session is absent *now*. So the
accurate phrasing is **"exited during this session"**, not "dormant since 10-14" — the latter
dates it eleven days wrong. `claude-9a` is separately dormant (last entry 10-14, no live
process); dormancy, **not** death.

**What I did while it was unresolved**, which I'd do again: held the seat provisional, asked
rather than took, committed nothing until the reply, and touched no peer file. The reading
turned out wrong — but had it been right, taking the seat would have put two agents in it.

**On the name.** `claude-04-01-LEAD-IPAD-RELIABILITY` reached the operator's prompt **through
the header `codex-01` wrote in error.** `codex-01` drew the sharper conclusion and I'm adopting
it: a role baked into an identifier doesn't merely go stale — **it propagates mistakes.**

### Finding 2 — the `codex-01` seat is NOT Codex. The 10-13 channel finding stands.

`codex-01` appeared discoverable and messageable from this session, which looked like it
contradicted the 2026-10-13 finding that the Claude↔Codex pair is cross-harness with no direct
messaging. **It does not contradict it.** I checked the pane instead of trusting the name:

```
socket agent-fleet / session fleet-safari-ai-agent-codex-01 / pane process:
  claude --model opus --name safari-ai-agent-codex-01
```

**That seat is Claude Code (Opus 5), not Codex CLI.** It is reachable because it is the *same*
harness. The 10-13 finding needs no amendment: a genuine Claude↔Codex pair still has no direct
channel and still needs an operator relay.

**tmux is not a communication channel, and it is worth being exact about this** because the
question keeps arising. Per `~/.ai-dev-dotfiles/docs/FLEET-TMUX-LAUNCH.md`, tmux "keeps an agent
in a named terminal that a human can attach to and a supervisor can address. It does not decide
when to send messages, recognize permission prompts or acknowledge assignments." Addressing a
pane means synthesising keystrokes into a TUI; that doc gates it behind a tested adapter probe
(`nudgeable: false` until proven) and **forbids it outright for approval prompts**. No such
adapter is in use in this fleet. Claude↔Claude messaging rides the harness session registry and
is independent of tmux entirely.

| Pair | Direct messaging | Mechanism |
|---|---|---|
| Claude Code ↔ Claude Code | yes, both ways | harness session registry; works with or without tmux |
| Claude Code ↔ **real** Codex CLI | **no** | the mailbox file is the channel; operator relays |
| Anything ↔ a tmux pane | **not a channel** | hosting only; keystroke injection gated and unbuilt |

**Correction to Finding 2, from reading `claude-04`'s doc:** I wrote that tmux "is not a
channel". **Too strong.** tmux *is* the **intended cross-harness transport** — `fleet-nudge.py`
types a trigger sentence into the target pane with `send-keys` and reads the screen back before
pressing Enter, which works across harnesses precisely because typing characters into a terminal
does not care what is reading them. The accurate statement: the mechanism **exists**, is **not
deployed** (`F-1`: no launchd job, no live process), and would be **misconfigured if it were**
(`F-2`: watches the frozen global mailbox). So "every cross-harness nudge is still a human
relay" was the right conclusion from a wrong reason. **Canonical:
`docs/FLEET-TMUX-OBSERVABILITY-ANALYSIS.md`.**

### Finding 3 — SUPERSEDED by `claude-04`'s F-2 and F-8; recorded only as duplication

Found while resolving Finding 2. Both are in that seat's **launch profile**, which is
operator-owned — so neither is fixed here, and I did **not** edit `codex-01`'s registry entry
(the 10-13 note on it says that agent should correct its own).

1. **Misnomer.** The seat is named `codex-01` and the registry records `harness: codex-cli`,
   while the live process is Claude Opus 5. This misleads in *both* directions — a reader either
   assumes a human relay is needed when it is not, or expects Codex-specific behaviour from a
   Claude session. The global naming standard is directly on point: an identifier must be
   self-identifying and must not borrow a neighbouring thing's attribute. A rename is an
   identity event and needs the operator.
2. **Stale mailbox in the launch args.** That session was started with
   `--add-dir <global>/.coordination/fleets/safari-ai-agent/mailbox` and a matching `Edit(...)`
   permission — the **external location frozen on 2026-10-13** and superseded by `fleet/`. It
   also carries `Edit(<repo>/fleet/**)`, so it *can* reach the live mailbox, but its profile
   still advertises the dead one. Status written there is written where nobody reads. This is
   the exact failure the `MOVED-READ-THIS.md` stub exists to catch, reappearing one layer up in
   the launcher.

### Priority — inherited, not invented

`leadership.objective_2026_10_13` stands: **"get this working on the iPad reliably."** The gap
named by the last three sessions is unchanged — **ten-run reliability is still zero**, and it is
blocked on the operator plus a physical iPad, not on code. D-053 (today) bounded the Swift path
to password-authenticated sites and promoted **Stage B — a real logged-in session surviving a
restart — from formality to the decisive test**. The open question it left is the operator's,
not an agent's: *do the sites that matter use passkeys?*

I have assigned myself no implementation work yet and claimed no new `OWNS` beyond my own
mailbox pair, the leadership block and my own registry entry.

**Writes this session:** `fleet/fleet-registry.yaml`, `fleet/README.md`,
`fleet/mailbox/claude-11.md`, `fleet/mailbox/claude-11.status.md` — all four reserved before
the first edit, released after. No peer file touched.

---
