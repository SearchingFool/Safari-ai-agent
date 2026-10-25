# Status — claude-11 (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/claude-11.status.md` (repo-relative — this repo is PUBLIC; see `../README.md`)
**Description:** Reports from `claude-11`. Newest first.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (claude-11, fleet join 2026-10-25)
**Created:** 2026-10-25
**Last Updated:** 2026-10-25
**Last Updated By:** claude-11

> **ORDERING: NEWEST FIRST.** The most recent report is the first `##` section below.
> Everything further down is older history. **The tail of this file is permanently the oldest
> content** — do not read the end to find current state.

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

### Finding 1 — I got the liveness check wrong. `claude-04` is live. Seat UNRESOLVED.

**Leaving the error visible because the mechanism is worth more than the tidy version.**

What I did: checked for live peers *before* writing anything, in the right order. Saw no
`safari-ai-agent-04` in the harness session list, read `claude-9a` (last entry 10-14) and
`claude-04` (last entry today 08:17) as dormant, and recorded **"no live peer to reconcile
with"** — the clean 2026-10-11 pattern rather than the awkward 10-14 one.

What was actually true: minutes later, `docs/FLEET-TMUX-OBSERVABILITY-ANALYSIS.md` showed up
untracked, **written two minutes earlier**, headed:

> Author: ... Claude Opus 5 (`safari-ai-agent-claude-04`, lane
> `2026-10-13-claude-04-01-LEAD-IPAD-RELIABILITY`)

**`claude-04` is live and working.** I searched the session list for the wrong name: it is
running in tmux socket `agent-fleet`, session `fleet-safari-ai-agent-codex-01`, as
`claude --name safari-ai-agent-codex-01` — under the **`codex-01` seat's launch profile**. The
seat I had just finished documenting as a misnomer (Finding 3) is the very thing that broke my
liveness check. A name that does not match its occupant does not merely confuse a reader; it
**silently defeats the check that the whole reconcile-don't-impose precedent depends on.**

**The lesson, stated so the next agent doesn't repeat it:** absence from a session list is
evidence of absence *only if you know the name to look for*. Corroborate with file mtimes and
`Author:` headers before recording a peer as dormant. I would have committed a false
"no live peer" into the registry had that file not surfaced by luck.

**So this IS the 10-14 pattern.** The precedent — set by `claude-04` itself when it stood down
for `claude-9a` — is **reconcile, never impose**. I have:

- messaged `claude-04` directly (same harness, so that channel exists), asked whether it holds a
  grant it considers current, and stated plainly that **I will stand down if it does**;
- **committed nothing**, and staged nothing;
- not touched `docs/FLEET-TMUX-OBSERVABILITY-ANALYSIS.md` — that is its in-flight work, and it
  covers the tmux/channel question more thoroughly than Finding 2 below;
- not edited any peer's self-declared `agents:` entry, in any direction.

**`current_holder` in the registry is PROVISIONAL until that reply arrives.**

`claude-9a` remains dormant *on the evidence available* — last entry 2026-10-14, no live
process — and that is dormancy, **not** death. Given I just got this wrong once, it is worth
saying the claim is only as good as the name I searched.

**Also unresolved: the name.** The operator proposed `claude-04-01-LEAD-IPAD-RELIABILITY`, which
is a **substring of `claude-04`'s own lane string**. The operator may have meant me to continue
*that lane* rather than be a new agent. I'm not resolving that by assuming either.

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
