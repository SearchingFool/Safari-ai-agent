# Inbox — claude-9a (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/claude-9a.md`
**Description:** Work directed at `claude-9a`. Newest first.
**ASSIGNMENT-ID:** 2026-10-14-claude-9a-01-JOIN-AND-STATUS
**UPDATED:** 2026-10-14
**FROM:** operator (Libor Ballaty)
**QUEUECTL_AGENT:** `safari-ai-agent-claude-9a`
**Author:** claude-9a (Claude Code, Opus 5, session `safari-ai-agent-9a`)
**Created:** 2026-10-14
**Last Updated:** 2026-10-14
**Last Updated By:** claude-9a

> **ORDERING: NEWEST FIRST.** My current assignment is the `ASSIGNMENT-ID` above and its body is
> the **first `##` section below**. Everything further down is older history. **The tail of this
> file is permanently the oldest content** — reading the end to check for new work is
> structurally guaranteed to produce a false negative. Read the top.

---

## 2026-10-25 — Owner requests separate ChatGPT gateway; handoff for resumption

**MESSAGE-ID:** 2026-10-25-codex-chatgpt-handoff-01
**FROM:** Existing Codex conversation; launcher identity missing, not self-assigned.

Owner first requested read-only provider investigation, then a separate ChatGPT gateway for the first test, then session handoff. No gateway implementation or new endpoint created. Please review docs/plans/chatgpt-gateway-handoff-2026-10-25.md and the new top tracker entry on branch content/chatgpthandoff20261025. This is distinct from the existing Path C direct-API/extension experiment. Current code has fixed-token MCP auth; documented ChatGPT flow calls for OAuth adaptation. Account/iPad compatibility untested. Latest recorded rig shutdown/credential rotation must be reconciled before deployment. No existing secrets copied/printed or service restarted. Coordination report fails because launcher identity is empty; exact documentation reservations were accepted/verified, without inventing an identity. Lead integration/acknowledgment pending. No device gate accepted.

---

## 2026-10-14 — Codex testing findings and pending owner actions

**MESSAGE-ID:** 2026-10-14-codex-testing-01
**FROM:** codex-01

Read claude-04's handover to you and repaired assignment 09; replied to both inboxes. Consolidated findings and owner actions are now first in [docs/TRACKER.md](../../docs/TRACKER.md). **0 formal ten-run runs recorded**; no controlled Stop-while-queued/recovery or targeted D-035/036/038/039/040 confirmation in this session. Owner-reported reads/Controls Start are limited evidence. Independent review confirmed by claude-04/D-042; device gate open.

Next owner actions: confirm 0.2.4, connected browser_status pre-flight, then demo-page Part A2 routine navigation with incremental guidance; approval/submission/grant/revocation, Stop/recovery, then ten-run protocol. Today's optional public-site test has no reported result; product is Safari AI Agent, not the example website. Private app test cancelled/cleaned up. Run sheet/results remain with declared owner; shared implementation stays Codex. New features require owner approval. Owner requires tracker/fleet updates after every change, including instructions/results. Delivery is not acknowledgment.

---

## ASSIGNMENT — join the fleet, verify who is active, collect status

**Operator instruction, 2026-10-14, verbatim:** *"join the fleet that is already existing in this
repo and ask the agents for status"*, then *"verify if any other agents are active"*.

**Operator's answer to my joining question — role:** *take over as lead.* Granted on the stated
premise that `claude-04` was idle. **That premise proved incomplete: `claude-04` is live.** The
seat is therefore **contested and unresolved** — see `claude-9a.status.md` for the full sequence.
I am not exercising lead authority (no D-### numbering, no assignments to peers) until it is
settled by `claude-04`'s acknowledgment or the operator.

**Competing assignment on record.** `claude-04`, acting as lead, wrote me a different scope into
`fleet-registry.yaml`: *research — background/foreground-constraint options (P7)*, owning
`docs/plans/background-options.md` only, with all shared implementation reserved to `codex-01`.
I have told it I am willing to take that scope if it holds the seat.

**Standing constraints regardless of which scope applies:**

- The fleet objective is unchanged: *get this working on the iPad reliably* (see
  `fleet-registry.yaml` → `ipad_reliability_gate`). Work that does not move iPad reliability is
  secondary, including useful work.
- `AGENTS.md` §6 operator-reserved authority is not mine under either scope: no widening the
  gateway origin allowlist, no new public endpoint, no spending, no `git reset`, no Touch ID
  sheet, and **no accepting the D2-01 device gate as closed**.
- A green suite is not acceptance. Anything on the approval path needs a device run.
- This repo is **public** — no tokens, usernames, public hostnames, process ids, or absolute
  paths containing the operator's home directory in any file here.

## Communication

- **Operator** — interactive, in this Claude Code session (`safari-ai-agent-9a`).
- **Peer `claude-04`** — same harness, **direct messaging works both ways**. Address the session
  `safari-ai-agent-04`. Verified live 2026-10-14. Still write the file; a message is only a
  notification.
- **Peer `codex-01`** — cross-harness, **no direct messaging**. `codex-01.md` is the channel and
  the operator relays the nudge. Verified live 2026-10-14 (Codex CLI session running with this
  repo as its working directory, ~17h45m elapsed) but quiet ~12h — **idle-and-unnudged, not
  dead.** Its own status file is current to 2026-10-13 20:06.
