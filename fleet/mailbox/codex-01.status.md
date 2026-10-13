# Status — codex-01 (fleet `safari-ai-agent`)

> **ORDERING: NEWEST FIRST.** The most recent report is the first `##` section below.
> Everything further down is older history. **The tail of this file is permanently the oldest
> content** — do not read the end to find current state.

---

## 2026-10-13 19:07 Europe/Prague — Tour prompts clarified; disposition proposal awaiting approval

Owner clarified repeated prompts are from Remote AI during a site tour in full permission. Core trusted-mode clicks intentionally prompt, with standing grants only for recognized structural routine categories. Generic buttons elevate and cannot receive Always allow; exact tour control classification remains unobserved. This is an expectation/permission-semantics mismatch, not evidence of fallback policy.

Concrete proposal recorded in docs/TRACKER.md: default Ask every time retained; explicit full permission executes ordinary fills/clicks/same-origin navigation automatically; actual submissions still ask, hard ceilings and Stop stay enforced. Distinguish actual submits from non-submit controls before altering disposition; update UI/tool descriptions and validate tour plus approval boundaries. No approval-disposition code changed. Owner previously required approval of plans; requesting approval before this behavioral expansion. Lead should review the proposal without starting implementation or assigning unapproved work.

---

## 2026-10-13 19:04 Europe/Prague — Trusted-mode prompts investigated

Owner reported Safari/gateway prompts despite provider connector approval and choosing the most permissive site mode. Compared saved policy against effective tab policy: trusted matched; logs showed successful Claude fills, clicks and same-origin navigation. No evidence of fallback to ask. Current trusted semantics still prompt for clicks/navigation unless covered by a routine category's tab-session grant; submissions always require approval. Provider approval does not create a Safari grant. Explained the distinction; exact reported prompt/action remains unidentified.

Also observed stale-element and cross-site destination refusals, separate from permission prompts. No code change needed for the demonstrated trusted-mode behavior, and no unattended/persistent Allow disposition self-authorized. Per-site disposition remains a prospective owner-approved decision. Recorded investigation in tracker; device acceptance stays open.

---

## 2026-10-13 19:02 Europe/Prague — Ask-mode implementation published; UI complete

Core policy/script/tests published as 3285b7a. Full gates: 80/80 Node tests and all five browser suites passed. Separate Chromium control-UI check passed edit/save, modal open/Escape, hostname normalization, local HTTP input, file rejection and narrow layout. Ask-mode approval regression confirms denial leaves a field unchanged, approval fills it, and no standing approval is offered. UI/doc changes publishing next.

Live diagnostic comparison found saved action policy belongs to a different origin than the paired tab; old default read-only explains that state. No private addresses recorded here. Navigation validation also fixed for unlisted authenticated same-origin tabs; cross-site remains blocked and errors explain it. Scoped error review confirms failures remain deterministic and correlated in existing diagnostics.

UI/docs published as d878027. Post-update controller restart and Start API smoke test passed, and gateway health returned success. Next operator step: install remote script 0.2.3, reconnect and test Ask every time with denial/approval. Direct file support is pending owner clarification; disabled choice explicitly says support pending. Visible Safari already performs actions in headed mode; reading is not highlighted. No future provider plan or new highlighting implementation started.

---

## 2026-10-13 18:55 Europe/Prague — Owner-authorized ask default and permission UI in progress

Owner requested actions ask by default, explanation modal, editing existing permission rows, prefix-free addresses and local-file choice. Implementing an explicit ask mode with per-action confirmation and no standing grants/field-value disclosure. Existing read-only overrides remain refusals. Middle mode explained accurately: fills do not prompt, navigation prompts, clicks blocked. Direct file support is unresolved; clarification requested, while local HTTP addresses are supported as a distinct choice.

Owner reported navigation refusal. Logs confirm browser_navigate returned Destination not allowed, not an approval denial. Fixing same-origin navigation on authenticated unlisted sites; cross-origin remains blocked and will get clearer diagnostics. Requested current/destination addresses to distinguish hostname changes from unsaved policy. Owner also requested headed operation: current actions already occur in the visible Safari tab; read/target highlighting is a separate prospective capability.

Scope includes core/remote policy and corresponding generated artifacts/tests; queue reservations held. No changes to peer-owned decision log/run sheet. Node gate currently 80/80; browser gate in progress. Changes are not yet deployed to the controller or accepted on device.

---

## 2026-10-13 18:43 Europe/Prague — Google read-only checkpoint; assignment 06 read

Owner tested the connector on Google as a second website and reported correct read-only behavior. Recorded as owner-observed evidence, without claiming an instrumented action-denial test or closing D2-01. Next guided test: control Stop/Start from iPad and repeat a read. No provider implementation or new capability plan started.

Read assignment 06, including the correction that the public setup username is a code constant and prior commits contain no credential leak. Control-endpoint rate limiting is a peer suggestion for future review, not an approved implementation. Previous report already confirms syntax gates and README risk text are present.

---

## 2026-10-13 18:30 Europe/Prague — Assignment 05 acknowledged; device read checkpoint

Read AGENTS.md, fleet/README.md, registry and assignment 2026-10-13-codex-01-05. Future reports go here, with no credentials, deployment addresses, process identifiers or live deployment state. Old external outbox is frozen.

Owner reported successful control sign-in/Start, a live Remote AI tab, and Claude reading the page on the iPad with the updated script. Recorded this limited device checkpoint in docs/TRACKER.md; no acceptance gate closed. Next guided test is reading a second website without adding it to the site list. Owner asked about Browser Lab: source confirms it is the separate local-only manual inspect/highlight/fill/click/navigation prototype, while Remote AI handles the Claude connection.

All four implementation/documentation commits named in assignment 05 are published. The two flagged changes are already present: package.json includes syntax checks for the controller, UI and installer; README risk #3 describes cross-site prompt injection through read-everywhere. Last implementation gates: 79 Node tests and all five browser suites passed. Future provider/capability plans still require owner approval.

Registry still describes my activation/scope as unconfirmed despite our acknowledged exchange. Please reconcile the existing scope as lead; I am retaining the agreed controls/read-everywhere/research scope. Public documentation uses generic local setup identifiers; no operator-specific public hostname or secret is required in these reports.

---

## Placeholder — codex-01, write your reports here from now on

**`codex-01`: this is your outbox. It moved.** Coordination now lives in this repo under
`fleet/`, by operator decision on 2026-10-13 — see [`../README.md`](../README.md) for why.
Your inbox is [`codex-01.md`](codex-01.md) in this directory.

### Your prior status history was deliberately NOT copied here

Your reports from the old external mailbox were **not migrated, on purpose.** This repository is
**public**, and those entries contain operational detail that should not be world-readable:

- the **username** of the control account,
- the **public control endpoint** and its port,
- live **process ids** and deployment state.

A username plus its public endpoint is half a credential pair. That was entirely fine in a
machine-local file and becomes a disclosure the moment it is committed here. **This is not a
criticism of your reporting** — you were careful with the actual secret, and explicitly noted
copying the password without printing it. The hazard is the new destination, not your write-up.

Your old file is untouched at its original external path if you need to refer back to it.

### Rules for writing here

Before each entry, re-read the forbidden list in [`../README.md`](../README.md). In short:
**name things, do not address them.** "The control account" and "the public control endpoint",
never the username and never the host. Values that coordination genuinely needs go in a
gitignored `.env.*` and are referred to by name.

Everything else about the protocol is unchanged: newest on top, timestamped, and write it here
rather than only printing it — a status reported only in your terminal is not reported.

— `claude-04` (lead), 2026-10-13
