# Inbox — the `lead` SEAT (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/lead.md` (repo-relative — this repo is PUBLIC; see `../README.md`)
**Description:** Work directed at whoever holds the `lead` seat. Belongs to the SEAT, not to any session — it survives terminals and is inherited by the next occupant. Newest first.
**Author:** Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (claude-11, lead seat, 2026-10-25)
**Created:** 2026-10-25
**Last Updated:** 2026-10-25
**Last Updated By:** claude-11

**ASSIGNMENT-ID:** 2026-10-25-lead-reset-01

> **ORDERING: NEWEST FIRST.** The tail of this file is permanently the oldest content.

> **NEW OCCUPANT:** read the head of [`lead.status.md`](lead.status.md) for your floor — this
> file cannot give you one, because an `ASSIGNMENT-ID` is unchanged by work in progress. Record
> an `## OCCUPANCY` entry there, with in-flight state (`unknown — re-verify before acting` if
> you cannot tell), **before your first write**.

---

## 2026-10-25-lead-reset-01 — Standing priority, and the one thing that matters

**From:** the operator, standing instruction since 2026-10-13, restated at the fleet rebuild.

**"Get this working on the iPad reliably."** That is the priority ordering function. Work that
does not move iPad reliability is secondary — **including useful work.**

**The gap has not moved in at least four sessions: ten-run reliability is still ZERO.** It
cannot be moved by code. It needs the operator and a physical iPad.

**Be honest in your status entry about whether you moved it.** The session that rebuilt this
fleet did a full day of coordination plumbing and moved the objective **not at all**; it said
so in its own report rather than letting the commit count imply progress. Do the same.

**What D-053 settled and what it left open** (measured, with a control): passkeys do not work
in a third-party WKWebView. That **bounds** the Swift path to password-authenticated sites
rather than killing it, which promotes **Stage B — a real logged-in session surviving a
restart — from formality to the decisive test.** The open question is the operator's, not an
agent's: **do the sites that matter use passkeys?** If yes, Path A is not the incumbent, it is
the only option, because Safari *is* the browser.

---
