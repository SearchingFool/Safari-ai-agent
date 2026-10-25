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
| `claude-11` | Claude Code (Opus 5) | Lead **PROVISIONAL** (operator grant 2026-10-25; reconciliation with `claude-04` outstanding) | `mailbox/claude-11.*` |
| `claude-04` | Claude Code (Opus 5) | **LIVE** 2026-10-25. Worker; owns the iPad device run sheet and results analysis. Running under the `codex-01` seat's profile — see below | `mailbox/claude-04.*` |
| `claude-9a` | Claude Code (Opus 5) | Lead 2026-10-14 → ?; **dormant**, last entry 2026-10-14 | `mailbox/claude-9a.*` |
| `codex-01` | *seat name only* | Seat owns **all shared implementation** — `src/**`, `gateway/**`, build/tooling, setup docs, provider research. **Currently occupied by a Claude session, not Codex** | `mailbox/codex-01.*` |

**Dormant is not dead**, and as of 2026-10-25 it is not even reliable — see the warning below.
No successor has rewritten any peer's entry. If a dormant agent returns, **reconcile with it**.

**Lead seat history.** `claude-04` 2026-10-13 → `claude-9a` 2026-10-14 → `claude-11` 2026-10-25
(provisional). Both transfers after the first hit a live peer, and knowing that matters:

- **10-14 — live peer, discovered in time.** The grant was made on the premise that `claude-04`
  was idle, which was incomplete: it was live and working. It verified the newer instruction,
  **stood down voluntarily** rather than contesting it (`6422307`), and neither agent edited the
  other's registry entry.
- **10-25 — live peer, nearly MISSED.** `claude-11` checked the session list before writing,
  found no `safari-ai-agent-04`, and recorded "no live peer to reconcile with". Wrong:
  `claude-04` was live and had written a 508-line doc two minutes earlier. It was invisible
  because it runs as `claude --name safari-ai-agent-codex-01` — **the session list was searched
  for the wrong name.** Caught only because that untracked file surfaced in `git status`.
  Nothing had been committed; the registry was corrected and the reconciliation requested.

**The precedent either way: reconcile with a live peer, never impose — and never rewrite a
peer's self-declared entry, in either direction.**

> **⚠ A liveness check is only as good as the name you search for.** Absence from the session
> list proves absence *only* if the name matches the occupant. Before recording any peer as
> dormant, corroborate with file mtimes and `Author:` headers. A seat whose name does not match
> who is sitting in it does not just mislead a reader — it **silently defeats the check that
> reconcile-don't-impose depends on.**

Roles, write scopes and the project gates are in [`fleet-registry.yaml`](fleet-registry.yaml).

## Communication channels — determine them, never assume

Verified 2026-10-13. **It is not symmetric.**

| Pair | Direct messaging | Discovery | How it works |
|---|---|---|---|
| Claude Code ↔ **real** Codex CLI | **NO** — cross-harness | none | **These files are the channel.** The operator relays a one-line nudge. Neither harness discovers the other. |
| Claude Code ↔ Claude Code | yes, both ways | session list | Harness session registry. Still write the file — a message is only a notification. |
| Anything ↔ a **tmux pane** | **not a channel** | n/a | tmux is **hosting**, not transport. See below. |
| Any ↔ cloud/remote session | send only | varies | It may receive without being able to reply. **Never ask it a question.** |

### tmux — hosting always; cross-harness doorbell *by design, not in practice*

**Canonical analysis: [`../docs/FLEET-TMUX-OBSERVABILITY-ANALYSIS.md`](../docs/FLEET-TMUX-OBSERVABILITY-ANALYSIS.md)**
(claude-04, 2026-10-25, findings `F-1`…`F-8`). Read that, not this summary, before changing
anything in the nudge chain.

Two separate things get conflated, so state them apart:

- **Hosting.** tmux keeps an agent in a named terminal a human can attach to. Always true.
  `~/.ai-dev-dotfiles/docs/FLEET-TMUX-LAUNCH.md`: it "does not decide when to send messages,
  recognize permission prompts or acknowledge assignments."
- **The nudge.** A file changing wakes nobody. `fleet-nudge.py --watch` polls an inbox's mtime
  and `ASSIGNMENT-ID` and then **types a trigger sentence into the target pane via `send-keys`**,
  reading the screen back to confirm it landed before pressing Enter. Typing characters into a
  terminal is harness-agnostic — **that is exactly why tmux is the intended cross-harness
  transport.** It fails closed: a matching session *name* is not proof, only the launcher's env
  stamp is.

**But it is not running.** `F-1` — the supervisor has no launchd job and no live process.
`F-2` (**critical**) — `get_inbox_path()` resolves to the **frozen global** mailbox, not
in-repo `fleet/`, so if started it would print "Watching inbox:" and wait forever. *A supervisor
pointed at a dead file is worse than none: it converts a known gap into a false assurance.*

**So today every cross-harness nudge is still a human relay.** The mechanism exists; the
deployment does not.

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
