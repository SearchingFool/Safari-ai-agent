# Fleet coordination — Safari AI Agent

**File:** `fleet/README.md` (repo-relative — this repo is PUBLIC)
**Description:** Where agents working this repo coordinate: the seats, the rules for writing here, and the small number of hazards that have actually bitten. Rebuilt 2026-10-25 from a fleet that had accumulated four layers of correction; the prior fleet is preserved verbatim in `archive-2026-10-25/`.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (claude-11, lead seat, 2026-10-25)
**Created:** 2026-10-25
**Last Updated:** 2026-10-25
**Last Updated By:** claude-11

---

## Start here

```
fleet/
  README.md               <- you are here: the rules
  fleet-registry.yaml     <- seats, write scopes, project gates
  mailbox/
    <seat>.md             <- inbox:  work for that SEAT   (NEWEST FIRST)
    <seat>.status.md      <- outbox: that seat's reports   (NEWEST FIRST)
  archive-2026-10-25/     <- the prior fleet, verbatim. Record, not state.
```

**Joining? Run this before anything else:**

```bash
python3 ~/.ai-dev-dotfiles/tools/fleet-status.py --fleet safari-ai-agent
```

or invoke the `/fleet-join` skill, which walks the whole procedure. **Do not reason your way to
an answer that command prints.**

## ⚠ THIS REPOSITORY IS PUBLIC

`github.com/SearchingFool/Safari-ai-agent`. Everything here is world-readable **permanently** —
deleting a file does not remove it from git history.

| Never write here | Write instead |
|---|---|
| Tokens, passwords, keys, `tskey-*`, device tokens | "the device token" |
| Usernames for any authenticated endpoint | "the control account" |
| Public hostnames, Funnel URLs, `*.ts.net` names | "the public control endpoint" |
| Process IDs, live deployment state | "the running gateway" |
| Absolute paths containing the operator's home directory | a repo-relative path |

**A username plus a public endpoint is half a credential pair.** If coordination genuinely needs
a value, put it in a gitignored `.env.*` and refer to it **by name**.

## Seats, not sessions

A **seat** is durable: a function, a write scope, a mailbox thread. It survives every terminal
closing. An **occupant** is a session — ephemeral, hours.

| Seat | Function | Mailbox |
|---|---|---|
| `lead` | Priority, gates, D-### numbering, integration. **No** operator-reserved authority (`AGENTS.md` §6) | `mailbox/lead.*` |
| `implementation` | `src/**`, `gateway/**`, build/tooling, setup docs, provider **research only** | `mailbox/implementation.*` |

**Seats are named for their FUNCTION — never for their occupant.** Not a harness, not a model,
not a person, not a role grant that can move. *A changeable attribute inside a durable
identifier does not merely go stale — it propagates mistakes.*

**Occupancy has no runtime representation.** `fleet_identity.py:294-296` makes `QUEUECTL_AGENT`
and `AGENT_NAME` both `<fleet>-<agent>`, and `claude_w.py:636-638` derives the messaging
`--name` from it. One `--agent X` sets the poll key, the lock identity **and** the message
address, so an occupant cannot be named independently of its seat. The coupling is deliberate —
it buys one-string addressability. **A seat is the runtime identity; occupancy is documentation
laid over it.**

## The four hazards that have actually bitten

Each of these cost real time on 2026-10-25. They are short because they are the distillation,
not the account; the account is in `archive-2026-10-25/`.

**1. Identify a peer by its PROCESS, not by a name or a header.** An `Author:` header, a seat
name and a registry field are *assertions*. `ps`, `tmux` and the launcher's env stamp are
*evidence*. **When they conflict, the process wins.** Two agents got this wrong in opposite
directions within one hour — one overrode its own correct process check with a file header; the
other read a different seat's inbox and inherited its authority from the name.

**2. A roster cannot prove liveness.** Nothing updates a registry when a session exits, so a
missing `to:` means *"never closed it out"*, **not** *"still here"*. Only a process check
answers who is in a seat.

**3. Renaming a seat changes its poll key.** The seat id is also the inbox filename and the
`--agent` value. If the old inbox vanishes, an occupant on the old key hits *"inbox does not
exist"* every cycle — which reads as *"nothing assigned yet"*. **Stub when someone is still on
the key** (a stub *changes*, so the poller wakes and is redirected); **retire to
`mailbox/retired/` when nobody is** (the glob is non-recursive, so the name stops being
offered and a poll fails loudly). *The test is whether anyone is listening.*

**4. Verify in code; a design doc may describe a path that was declined.** The wake-up section
of this file was written wrong **three times by two agents**, every time by reasoning from
documentation. See below.

## Waking up — pull only, and only while you hold a turn

**The built mechanism is the idle protocol:**

```bash
fleet-inbox-wait.sh --fleet safari-ai-agent --agent <seat> --idle   # 0=changed 3=timeout, re-run
```

Its own header states the limit: *"IS NOT … a way to be woken after your turn ends. If your
harness ends the turn, this is not running and you are idle again."*

**The push supervisor was DECLINED, not deferred** — operator decision 2026-10-12,
`launch-layer-only` (primary source: tinychoir registry
`coordination.terminal_delivery.scope_decision`). A 2026-09-27 probe found blind `send-keys`
unsafe: Enter consumed as a dialog answer and Claude Code exited. **tmux is hosting, not
transport.** `FLEET-TMUX-LAUNCH.md` carries a correction banner saying so.

| Target | Reachable? |
|---|---|
| An agent looping on the idle protocol | **Yes**, no relay |
| An agent that has **ended its turn** | **No built mechanism.** Manual operator relay |
| A same-harness peer | Directly, via the harness session registry |

**Whether peer messages need operator approval depends on the launch**: a session launched
non-autonomous holds them. Since 2026-10-25 the choice is recorded on `session_started` under
`data.launch` (`permission_mode`, `autonomous`, `autonomous_source`) — previously it was written
nowhere, which made it unprovable after the fact.

## Protocol

- **Read your inbox at the start of every turn** and whenever you go idle. Act when its
  `ASSIGNMENT-ID` is newer than the one you last handled.
- **Status goes in the file**, newest on top. *A status reported only in chat is not reported.*
- **Both file types are NEWEST FIRST.** The tail is permanently the oldest content — reading the
  end to find new work is structurally guaranteed to produce a false negative.
- **Prefer the mailbox over a message.** The file is the record; a message is only a
  notification — and a message can be held for approval, or expire undelivered.
- **Assert your anchor matched.** If you insert by anchoring on a string, verify the body
  landed. A silent no-op plus a bumped `ASSIGNMENT-ID` produces a message that *looks*
  delivered, is not, and leaves the recipient reporting a symptom you read as confusion.
- **Stay inside your seat's `OWNS`.** Never write another seat's files; ask in their inbox.
  **Workers do not assign each other work** — only the lead assigns.
- **Reserve before writing** (`AGENTS.md` §3), and export `QUEUECTL_AGENT`.

## Taking a seat

1. Run `fleet-status.py`. Read every `FINDINGS` line.
2. **Ask the operator what your seat is.** Never self-assign a role or widen your own scope.
3. **If the seat shows `LIVE`, reconcile — do not impose.** Hold your claim provisional, commit
   nothing, and ask. *An hour spent asking beats two agents in one seat.*
4. **Adopt a floor.** The inbox cannot give you one: an `ASSIGNMENT-ID` is unchanged by work in
   progress, so a half-done assignment looks untouched. The high-water mark is the **head of the
   seat's `.status.md`**.
5. **Record occupancy before your first write** — who you are, the date, your floor, and the
   in-flight state of anything open. Write **`unknown — re-verify before acting`** when you
   cannot tell. Silence reads as "nothing was in flight", which is a claim nobody checked.
6. **Every status entry carries its occupant:** `## YYYY-MM-DD — <occupant> — <subject>`. These
   files outlive their authors and a newest-first file gives no visual boundary between them.
