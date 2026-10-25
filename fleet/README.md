# Fleet coordination — Safari AI Agent

**File:** `fleet/README.md` (repo-relative — this repo is public; see the forbidden list below)
**Description:** Where agents working this repo coordinate. Participants, which communication channel actually works between each pair, the rules for writing here, and what must never appear in these files because this repository is public.
**Author:** claude-04 (Claude Code, Opus 5) — fleet lead
**Created:** 2026-10-13
**Last Updated:** 2026-10-13
**Last Updated By:** claude-04

---

## Read this first

**This directory is the fleet's channel and its record.** If you are an agent working this repo,
your inbox and your status file are here. Read [`../AGENTS.md`](../AGENTS.md) for the repo's
working rules.

```
fleet/
  README.md            <- you are here
  fleet-registry.yaml  <- participants, roles, write scopes, project gates
  mailbox/
    <agent>.md         <- inbox:  work directed at that agent    (NEWEST FIRST)
    <agent>.status.md  <- outbox: that agent's reports           (NEWEST FIRST)
```

## ⚠ THIS REPOSITORY IS PUBLIC — what must never be written here

`github.com/SearchingFool/Safari-ai-agent` is public. Everything in this directory is
world-readable **permanently**; deleting a file does not remove it from git history.

**Never write here:**

| Forbidden | Write instead |
|---|---|
| Tokens, passwords, keys, bearer values, `tskey-*`, device tokens | "the device token" |
| Usernames for any authenticated endpoint | "the control account" |
| Public hostnames, Funnel URLs, `*.ts.net` names | "the public control endpoint" |
| Process IDs, live deployment state | "the running gateway" |
| Absolute paths containing the operator's home directory | a repo-relative path |

**A username plus a public endpoint is half a credential pair.** Operational detail that is
harmless in a terminal becomes a disclosure when committed to a public repo. If coordination
genuinely needs a value, put it in a gitignored `.env.*` and refer to it **by name**.

Already gitignored and must stay so: `.env`, `.env.*`, `*.secret`, `logs/`,
`.gateway-control.json`.

## Why coordination lives here and not outside the repo

**Operator decision, 2026-10-13.** The global
`~/.ai-dev-dotfiles/FLEET-MAILBOX-CONTRACT.md` places mailboxes under
`~/.ai-dev-dotfiles/.coordination/fleets/<FLEET_ID>/`. **This repo overrides the location.**

That external path is gitignored, machine-local, unversioned and unbacked-up. It does not
survive a dead disk, is invisible from another machine, and does not arrive with a clone — so an
agent joining on different hardware finds nothing and concludes it is working alone. The cost was
concrete: analysis written there had to be hand-migrated into `docs/DECISIONS.md` to survive.

**Keep the global contract's protocol; change only the path.** Newest-first ordering,
`ASSIGNMENT-ID` discipline, disjoint `OWNS` scopes, status written to a file rather than only
printed — all unchanged.

## Protocol

- **Read your inbox at the start of every turn**, and again whenever you finish a unit of work.
  Act on it when its `ASSIGNMENT-ID` is newer than the one you last handled.
- **Write every status report to your `.status.md`**, newest on top, timestamped — not only to
  your terminal. A status reported only in chat is not reported.
- **Both file types are NEWEST FIRST.** The current item is the `ASSIGNMENT-ID` in the header and
  the first `##` section. **The tail of these files is permanently the oldest content** — reading
  the end to check for new work is structurally guaranteed to produce a false negative.
- **The file is the record; a message is only a notification.** An assignment that exists only in
  a chat message does not exist. Test: if your session died right now, could a successor
  reconstruct the current state from these files alone?
- **Stay inside your declared `OWNS`.** Never write another agent's files. Ask in their inbox.
- **Workers do not assign each other work.** Peers coordinate; only the lead assigns.
- **The `ASSIGNMENT-ID` is not a delivery receipt — the body is.** If you insert a message by
  anchoring on an existing string, **assert that the anchor matched** and fail loudly if it did
  not. A silent no-op paired with a successful header bump produces the worst possible outcome: a
  message that looks delivered, is not, and leaves the recipient reporting a symptom the sender
  reads as confusion. **Verified failure, 2026-10-13:** `claude-04` anchored on a section header
  typed `18:50` where the file read `18:40`; Python's `.replace()` matched nothing and raised
  nothing, while a separate regex still advanced the `ASSIGNMENT-ID`. Two messages never arrived,
  `codex-01` reported exactly that twice, and it cost most of an evening. **When a peer says it
  cannot see your message, believe it and check the body before re-explaining.**

## Participants

| Agent | Harness | Role | Inbox / Outbox |
|---|---|---|---|
**Restructured 2026-10-25: SEATS, not sessions.** A **seat** is durable — a function, a write
scope, a mailbox thread. It survives every terminal closing and is inherited by the next
occupant. An **occupant** is a session: ephemeral, hours. **The roster below lists seats.**

> **The `Current occupant` column is a label, not a liveness claim.** It is not updated when a
> session exits. To find out whether anyone is actually in a seat, check the process — see
> *Identify a peer by its PROCESS* below.

| Seat | Function | Mailbox | Current occupant |
|---|---|---|---|
| `lead` | Priority, gates, D-### numbering, integration. **No** operator-reserved authority (`AGENTS.md` §6) | `mailbox/lead.*` | `claude-11` (Claude Opus 5), since 2026-10-25 |
| `implementation` | All shared implementation — `src/**`, `gateway/**`, build/tooling, setup docs, provider **research only** | `mailbox/implementation.*` *(renamed from `codex-01.*` 2026-10-25)* | `codex-01` (Claude Opus 5 — **not** Codex CLI), since 2026-10-25 |

**Past occupants are in the registry's `occupancy:` log — a dated trail, not a roster. Never
liveness-check it.** `claude-04`, `claude-9a` and `claude-safari-ai-agent` live there; their
mailboxes are in [`mailbox/retired/`](mailbox/retired/).

> **⚠ A dead mailbox left in `mailbox/` is a name that RESOLVES but is not a live address.**
> `fleet_identity.py:136` globs `mailbox/*.md`, so a retired mailbox is still *offered* as a
> poll target — and polling it returns an existing file and a real baseline hash. **Every
> signal reads healthy** while nothing will ever be written there. Same shape as the two
> misidentifications of 2026-10-25. Raised by `codex-01`.
>
> **Fix it mechanically, never with a warning** — a warning is the thing an agent reasons past:
>
> | Is anyone still polling that key? | Do this | Why |
> |---|---|---|
> | **Yes** (seat renamed under a live occupant) | leave a **redirect stub** — [`mailbox/codex-01.md`](mailbox/codex-01.md) | the stub *changes*, so the poller wakes (exit `0`) and is told where to go |
> | **No** (seat retired) | **move the pair to `mailbox/retired/`** | the glob is non-recursive, so it stops offering the name, and a poll hits the loud *"inbox does not exist"* setup-error path |
>
> **The test is whether anyone is listening**, not whether the name is obsolete.

### Why this changed, because the old shape caused a real failure

One permanent identity per terminal produced **four `claude-*` entries in twelve days** for what
is functionally one or two seats. On 2026-10-25 `claude-11` liveness-checked three of them, got
one wrong, and nearly stood down from a seat that was its own. **Every dead name in a roster is
a liveness check waiting to fail.**

Two different things were bundled as "identity". They have opposite requirements:

| | Requirement | Where it lives |
|---|---|---|
| **The record** — who decided what, who wrote which file | **Permanent.** Delete it and older commits become uninterpretable | git history, `Author:` headers, status files, `agents_historical:`. Nobody liveness-checks it, so it costs nothing |
| **The roster** — who to coordinate with *now* | **Short and true** | `seats:` in the registry. Only this rots, so only this gets pruned |

**So: preserve the record, prune the roster, and keep the seat.** Nothing is deleted.

> **Seats are named for their FUNCTION — never for their occupant.** Not a harness, not a model,
> not a person, not a role grant that can move. This repo proved it twice in one morning:
> `codex-01` was named after a **harness**, a Claude session sat in it, and `harness: codex-cli`
> silently became a lie that broke an identity check. Same shape as baking `LEAD` into an agent
> name. **A changeable attribute inside a durable identifier does not merely go stale — it
> propagates mistakes.**

### Renaming a seat safely — the poll-key hazard

**The seat id is three things at once:** the registry key, the **inbox filename**, and the
**poll key** passed as `fleet-inbox-wait.sh --agent <id>`. Renaming changes all three together,
which is why a rename is an identity event and operator-reserved.

The trap: if the old inbox simply disappears, an occupant still polling the old name hits
*"inbox does not exist"* every cycle — and that reads as **"nothing has been assigned to me
yet"**, not *"you are polling a dead name."* Silent, and indistinguishable from an idle fleet.

**The procedure used for `codex-01` → `implementation` on 2026-10-25:**

1. **Check nobody is mid-wait** — `pgrep -fl fleet-inbox-wait`. Moving a key out from under a
   blocked poller is the one genuinely destructive moment.
2. **`git mv` both files**, so history follows the seat. Do not copy-and-delete.
3. **Leave a redirect stub at the old key**, not nothing. The stub *changes* the old file, so a
   poller wakes (exit `0`), re-reads, and is told which key to switch to. **The rename
   announces itself through the very channel it would otherwise have broken.**
4. **Update `poll_key`, `mailbox:` and this table in the same commit** as the move.
5. **Delete the stub later**, once no occupant polls the old key — safe precisely because by
   then nothing resolves there.

**Only the SEAT is renamed. The occupant keeps its own name** — `codex-01` is still `codex-01`,
now sitting in the `implementation` seat. Its own files were moved, not rewritten; only a
rename banner and the title line were added.

### ⚠ The cost of seat reuse, stated plainly

Seats are the right trade, but they are **not free**. Four hazards, all of them real, three
found by `codex-01` reviewing this design:

**1. A fresh occupant has no floor.** Inheriting a seat's inbox means inheriting its
`ASSIGNMENT-ID` history. The protocol says act when an ID is *newer than the one you last
handled* — a new occupant has no last-handled, so the rule gives it nothing and the newest item
may already be done.

**2. A newest-first status file mixes occupants, and a single top marker does not fix it.**
Older entries below your marker were written by someone else. The documented habit — "read the
head of the status file" — is right for recency and **wrong for attribution**. Live example:
`mailbox/codex-01.status.md` has a 2026-10-25 entry by a Claude occupant sitting directly above
a 2026-10-14 testing checkpoint by a genuine **Codex** occupant. Two harnesses, one file, no
markers; a reader skimming down credits the Codex work to the wrong agent.

> **Therefore: every status entry carries its occupant in the heading.**
> `## YYYY-MM-DD — <occupant> — <subject>`. A per-entry stamp is the only form that survives
> skimming; a single marker at the top of a newest-first file leaves everything below it
> unattributed. Status files are exactly what people skim.

**3. A predecessor that vanished mid-task leaves assignment state *unknown*, not merely
unread.** `claude-04` on 2026-10-25 is the case: live at 08:09, gone by 08:33, inbox
`ASSIGNMENT-ID` unchanged throughout. A fresh occupant reads an assignment that looks current
and untouched, and may redo or double-apply it. **The honest default is
`in-flight state: unknown — re-verify before acting`, written down. Not silence.**

**4. `occupancy:` can never tell you who holds a seat *right now*.** Nobody liveness-checks it
(by design), so an occupant that exits without writing a `to:` leaves an open-ended entry
forever. The same is true of the `occupant:` field on a seat. **Neither is authoritative for
liveness — only a process check is.** Pair this with the pane-check rule above: the registry
answers *what a seat is for*; `ps`/`tmux` answers *whether anyone is sitting in it*. A reader
under deadline who takes the newest occupancy row as current has rebuilt the exact failure this
restructure removed.

**On taking a seat, before your first write:** read the top of its `.status.md` (the real
high-water mark, not the inbox), then add an `## OCCUPANCY` entry naming yourself, the date, the
`ASSIGNMENT-ID` you treat as your floor, and the in-flight state of anything your predecessor
left open — `unknown` if you cannot tell.

These hazards are priced, not discovered: the alternative is a fresh mailbox per session, which
is what produced the four dead identities above.

**Lead seat history.** `claude-04` 2026-10-13 → `claude-9a` 2026-10-14 → `claude-11` 2026-10-25.
Each transfer after the first met a live peer, and both were settled by *asking*:

- **10-14.** The grant was made on the premise that `claude-04` was idle, which was incomplete:
  it was live and working. It verified the newer instruction, **stood down voluntarily** rather
  than contesting it (`6422307`), and neither agent edited the other's registry entry.
- **10-25.** `claude-11` held the seat **provisional** and asked before taking it, having
  concluded — wrongly — that a live peer was `claude-04` under another name. `codex-01` replied
  within the hour: *"I am NOT claude-04 — I am the codex-01 seat. Keep the lead; nothing to
  reconcile."* Uncontested. **The asking cost an hour and was still the right call**: had the
  reading been right, taking the seat would have put two agents in it.

**The precedent either way: reconcile with a live peer, never impose — and never rewrite a
peer's self-declared entry, in either direction.**

> **⚠ Identify a peer by its PROCESS, not by a name or a header.** On 2026-10-25 this went
> wrong in **both directions on the same morning**:
>
> - `claude-11` identified the pane correctly by process (`claude --name
>   safari-ai-agent-codex-01`), then **overrode its own direct evidence with a file header**
>   reading `safari-ai-agent-claude-04` — and concluded a peer was someone else. The header was
>   the error, not the process check.
> - `codex-01` **read `claude-04`'s inbox by mistake and wrote from it**, inheriting a lane
>   string that was never its own. That is where the bad header came from — and it is how a
>   name alone nearly conferred authority.
>
> Same root cause, opposite directions, within one hour. A `Author:` header is an **assertion by
> a peer** and can be wrong; `ps`/`tmux` and the launcher's env stamp are evidence. **When they
> conflict, the process wins.** A matching session *name* is not proof of anything — which is
> also why `fleet-nudge.py` fails closed on the env stamp rather than the name.

Roles, write scopes and the project gates are in [`fleet-registry.yaml`](fleet-registry.yaml).

## Communication channels — determine them, never assume

Verified 2026-10-13. **It is not symmetric.**

| Pair | Direct messaging | Discovery | How it works |
|---|---|---|---|
| Claude Code ↔ **real** Codex CLI | **NO** — cross-harness | none | **These files are the channel.** The operator relays a one-line nudge. Neither harness discovers the other. |
| Claude Code ↔ Claude Code | yes, both ways | session list | Harness session registry. Still write the file — a message is only a notification. |
| Anything ↔ a **tmux pane** | **not a channel** | n/a | tmux is **hosting**, not transport. See below. |
| Any ↔ cloud/remote session | send only | varies | It may receive without being able to reply. **Never ask it a question.** |

### How an agent actually gets woken: PULL, not push

**Canonical: [`../docs/FLEET-CROSS-HARNESS-COMMUNICATION.md`](../docs/FLEET-CROSS-HARNESS-COMMUNICATION.md)**
and [`../docs/FLEET-TMUX-OBSERVABILITY-ANALYSIS.md`](../docs/FLEET-TMUX-OBSERVABILITY-ANALYSIS.md)
(`codex-01`, 2026-10-25). Read those before changing anything here.

**Canonical: `docs/FLEET-CROSS-HARNESS-COMMUNICATION.md` §3 and the correction banner above §1.
Do NOT cite §5 or §6 — those describe the rejected push model.** Citing them is how this got
written wrong twice.

**The built mechanism is the IDLE PROTOCOL — `~/.ai-dev-dotfiles/tools/fleet-inbox-wait.sh`.**
An agent with no assigned task polls its own inbox instead of stopping for a human:

```bash
fleet-inbox-wait.sh --fleet safari-ai-agent --agent <seat> --idle   # 0=changed 3=timeout, re-run
```

Harness-agnostic, and cheap — *"COST: wall-clock, not tokens. The sleeping happens in the shell,
not the model."*

**Its limit is the whole story, and it is in its own header:**

> *"IS NOT: a daemon, a background job, or **a way to be woken after your turn ends**. If your
> harness ends the turn, this is not running and you are idle again."*

**So pull reaches an agent that is idle-by-protocol. It does not reach one that has stopped.**

**The push supervisor was DECLINED, not deferred** — operator decision 2026-10-12,
`launch-layer-only`. Primary source: the tinychoir registry field
`coordination.terminal_delivery.scope_decision`, which lists the watcher + TUI
prompt-injection adapter under `explicitly_not_built`, `supervisor_ready: false`,
`nudgeable: false`. A 2026-09-27 probe found blind `send-keys` unsafe: Enter consumed as a
dialog answer (Claude Code exited), bare digits selecting menu items, vim NORMAL mode
corrupting text. **tmux is hosting, not transport.**

**Therefore, honestly:**

| Target | Reachable? |
|---|---|
| An agent looping on the idle protocol | **Yes**, no relay — it wakes on the file change |
| An agent that has **ended its turn** | **No built mechanism.** Manual operator relay |
| A same-harness peer | Directly, via the harness session registry |

> **This section has now been written wrong three times by two different agents** — "tmux is
> not a channel", then "tmux is the intended cross-harness transport pending deployment"
> (twice, independently). The second framing is the dangerous one: it promotes a **rejected**
> design to an intended one. The cause is not carelessness. `FLEET-TMUX-LAUNCH.md` is
> confident and specific about `send-keys`, and it describes a path declined *after* it was
> written — a correction banner was added there on 2026-10-25 so the next agent doesn't make
> it four. **Before describing the wake-up mechanism, read `fleet-inbox-wait.sh`'s header and
> run `fleet-status.py`. Do not reason from the design docs.**

#### ⚠ Self-polling was silently dead for this fleet until 2026-10-25 — fixed

`fleet-inbox-wait.sh:99` hardcodes
`~/.ai-dev-dotfiles/.coordination/fleets/<fleet>/mailbox/<agent>.md`, and
`fleet_identity.py:54–58` states the implemented design (**D3**): *"One absolute path reachable
identically from every repo and every worktree — which is why mailboxes stay here rather than
inside a repo (an in-repo gitignored mailbox reaches 1 of 25 worktrees; a committed one enters
history, **and is world readable in a public repo**)."*

The 2026-10-13 in-repo move left that central path as a **real directory holding the frozen
files**. So any agent self-polling by `--fleet/--agent` watched dead files — and because the
frozen `codex-01.md` *exists*, it didn't even error. It just never fired. **Nobody in this fleet
could be woken; every nudge was a human relay, and that looked like a policy rather than a bug.**
Both costs D3 predicted had landed: the public-repo exposure is why §2's forbidden-content table
exists, and the broken resolution is why nothing woke up.

**Fix (`codex-01`'s candidate #1, applied by `claude-11` 2026-10-25):** the central path is now a
**symlink to the in-repo mailbox** — the pattern `tinychoir` already uses and which resolves
correctly. This **preserves** the 10-13 decision rather than reversing it: in-repo stays
canonical, and D3's single absolute path is restored.

```
.coordination/fleets/safari-ai-agent/mailbox -> <repo>/fleet/mailbox
.coordination/fleets/safari-ai-agent/mailbox.frozen-2026-10-13/   (kept, see below)
```

Machine-local only — `.coordination/` is gitignored, so nothing was committed.

**Verified with a control**, because "it printed something" is not evidence:
`--agent no-such-seat` → the setup-error path; `--agent lead` → `watching .../mailbox/lead.md |
baseline 0557100f5263`. **`lead.md` exists only in-repo**, so a real baseline hash on that path
proves the symlink resolves live.

**The frozen directory was renamed, never deleted.** It still holds the `codex-01.status.md`
that was deliberately *not* migrated on 10-13 — it contains a control-account username, the
public endpoint and live pids. **That file must stay outside this repo.** See §2.

**The seat id is also the poll key.** `--agent <name>` resolves to `mailbox/<name>.md`, so
renaming a seat changes what every occupant must pass. An occupant still polling the old name
blocks forever on a path that no longer exists and it looks like "nothing assigned yet". Record
the poll key in the seat block, and rename when no occupant is mid-wait.

**The central `fleet-registry.yaml` had the same defect** and is now also a symlink — found by
`fleet-status.py` on its first run, which read eleven-day-old seats because fixing the mailbox
alone left the registry stale.

> **⚠ Do NOT generalise this as "a real directory means self-polling is dead."** That rule is
> wrong and flags **six healthy fleets** on this machine (`agent-cape`, `aidevops`,
> `arioncomply`, `marketing-and-sales`, `openinframanager`, `testrepo`). A real directory is
> the **normal** arrangement when no repo-side copy exists. The defect is a **conflict of three
> conditions**: central is a real directory, **and** the repo holds a live mailbox, **and** the
> central copy is stale or carries a `MOVED` stub. *A check that cries wolf gets switched off,
> which is worth less than no check.* Caught before shipping by `codex-01`; canonical at
> `docs/FLEET-CROSS-HARNESS-COMMUNICATION.md` §7.4.

**Check any fleet with:** `python3 ~/.ai-dev-dotfiles/tools/fleet-status.py --fleet <id>`, or
the `/fleet-join` skill when joining one.

Claude↔Claude messaging is unrelated to all of this — it rides the harness session registry and
works with or without tmux.

### ⚠ Check the harness, not the name

**Verified 2026-10-25.** The seat named `codex-01` is running
`claude --model opus --name safari-ai-agent-codex-01` in tmux socket `agent-fleet` — it is
**Claude Code, not Codex CLI**. It is directly reachable for that reason alone, and that is not
evidence any cross-harness bridge exists. Had the name been trusted, the right conclusion
("same harness, message it directly") would have been reached from reasoning that was wrong,
and the first genuine Codex peer would have inherited the error. **Before sizing a channel,
confirm what is actually in the pane.** Registry: `agents[codex-01].harness` still reads
`codex-cli` and is now inaccurate; correcting it is that seat's own call, or the operator's.

**Silence is ambiguous** — busy, idle-and-unnudged, crashed, and never-received all look
identical. Check the peer's `.status.md` before escalating.

## Joining

1. Read [`../AGENTS.md`](../AGENTS.md), then `fleet-registry.yaml`.
2. Ask the operator what your role is. **Do not self-assign authority**, and never widen your own
   write scope.
3. Add your own `agents:` entry (proposing it avoids deadlock if the lead is mid-turn) and create
   your mailbox pair.
4. Announce yourself in your `.status.md` so the lead sees you without a human relaying it.
5. Reserve before your first write — see `../AGENTS.md` §3.
