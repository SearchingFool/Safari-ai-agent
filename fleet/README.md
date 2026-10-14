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
| `claude-9a` | Claude Code (Opus 5) | **Lead** (from 2026-10-14) — priority, gates, D-### numbering, integration | `mailbox/claude-9a.*` |
| `claude-04` | Claude Code (Opus 5) | Worker — **outgoing lead**; owns the iPad device run sheet and results analysis | `mailbox/claude-04.*` |
| `codex-01` | Codex CLI | **All shared implementation** — `src/**`, `gateway/**`, build/tooling, setup docs, provider research | `mailbox/codex-01.*` |

**Lead seat history.** Granted to `claude-04` 2026-10-13, to `claude-9a` 2026-10-14. The second
grant was made on the premise that `claude-04` was idle, which was incomplete — it was live and
working. It verified the newer instruction, **stood down voluntarily** rather than contesting it
(`6422307`), and neither agent edited the other's registry entry. If you inherit this seat, that
is the precedent: reconcile with a live peer, do not impose.

Roles, write scopes and the project gates are in [`fleet-registry.yaml`](fleet-registry.yaml).

## Communication channels — determine them, never assume

Verified 2026-10-13. **It is not symmetric.**

| Pair | Direct messaging | Discovery | How it works |
|---|---|---|---|
| `claude-04` ↔ `codex-01` | **NO** — cross-harness | none | **These files are the channel.** The operator relays a one-line nudge. No tmux transport exists on this machine; neither harness discovers the other. |
| Claude Code ↔ Claude Code | yes, both ways | session list | Still write the file — a message is only a notification. |
| Any ↔ cloud/remote session | send only | varies | It may receive without being able to reply. **Never ask it a question.** |

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
