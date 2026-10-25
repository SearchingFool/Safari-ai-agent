# Status — codex-01 (fleet `safari-ai-agent`)

> **ORDERING: NEWEST FIRST.** The most recent report is the first `##` section below.
> Everything further down is older history. **The tail of this file is permanently the oldest
> content** — do not read the end to find current state.

---

## 2026-10-25 — ✅ Self-polling FIXED (verified), and a warning for the `fleet-status` tool

**Fixed.** `claude-11` symlinked the central mailbox to `fleet/mailbox/`. **Verified here rather
than relayed:** target resolves, `codex-01.md` reachable through the central path at its live
in-repo size, `.coordination/` gitignored at `.gitignore:112`, frozen dir intact outside the
repo. The entry below this one diagnosed it; it is now resolved and kept as history.

**Disclosure boundary re-checked** (public repo): the frozen external `codex-01.status.md`
still carries a control-account username, a public endpoint and live process ids and stays
**outside** the repo. The in-repo file of that name is a different, sanitised file — scanned
today, zero host-shaped tokens, zero keys, zero process ids. Do not migrate the frozen one in.

**⚠ WARNING FOR WHOEVER BUILDS `fleet-status` / `/fleet-join`.** The obvious encoding of this
defect is wrong and must not ship:

> ~~"central mailbox is a real directory rather than a symlink ⇒ self-polling dead"~~

Surveyed 2026-10-25: `tinychoir` is a symlink; `agent-cape`, `aidevops`, `arioncomply`,
`marketing-and-sales`, `openinframanager`, `testrepo` are **real directories and may be
entirely healthy** — a real directory is the *normal* D3 arrangement when no repo copy exists.
That rule produces **six false positives on first run**, and a check that cries wolf gets
switched off, which is worth less than no check.

The defect is a **conflict of three conditions**, not a filesystem type: central is a real dir,
**and** the repo also holds a live mailbox, **and** the central files are stale or carry a
`MOVED`-style stub. **Canonical version: `docs/FLEET-CROSS-HARNESS-COMMUNICATION.md` §7.4**
(committed `25e49df`).

**Highest-value additional checks**, both of which catch failures that survive careful
reasoning because reasoning is what a lying name defeats: (1) **seat harness vs live pane
process** — catches F-8; (2) **env stamp vs session name vs the inbox actually being read** —
catches this seat reading another seat's inbox while stamped `codex-01`.

**Citation guidance:** the pull model is canonical at
`docs/FLEET-CROSS-HARNESS-COMMUNICATION.md` **§3** plus the correction banner above §1. **Do
not cite §5/§6** — those describe the *rejected* push model. That section has now been written
wrong twice by two agents, both times from reasoning rather than reading the code, because
`FLEET-TMUX-LAUNCH.md` confidently describes a design that was declined after it was written.

Sent to `claude-11` at ~12:5x; **delivery held pending that user's approval.** This file and
`25e49df` are the record.

---

## 2026-10-25 — ⛔ ROOT CAUSE: self-polling is broken fleet-wide, caused by the 10-13 mailbox move

**Correcting my own earlier entry below.** I reported that cross-harness agents have no
automatic wake-up and need an operator relay, citing `FLEET-TMUX-LAUNCH.md`. **That was wrong,
and the error was trusting documentation over code.** The operator challenged it on the grounds
that it had been working; the code agrees with the operator.

**The real mechanism is `~/.ai-dev-dotfiles/tools/fleet-inbox-wait.sh`** — each agent blocks on
**its own** inbox rather than being pushed to. Harness-agnostic by construction, because nothing
is pushed and nothing needs to know what harness is on the other end. Its header: *"COST:
wall-clock, not tokens. The sleeping happens in the shell, not the model."* The push model
(`fleet-nudge.py`, adapter probes, `nudgeable:false`) is the **road not taken** — operator
decision 2026-10-12, "launch-layer-only; nudges manual".

**Why nothing in this fleet wakes up.** `fleet-inbox-wait.sh --fleet <id> --agent <name>`
resolves to the **central** path `<dotfiles>/.coordination/fleets/safari-ai-agent/mailbox/`,
which is a real directory holding the files **frozen on 2026-10-13**. The live mailbox is
`fleet/mailbox/`. An agent polling by fleet/agent blocks, times out, loops — forever, with no
error. It looks exactly like "no assignment yet."

**This contradicts the implemented design.** `fleet_identity.py:54-58` records decision **D3**
and its reasoning verbatim: *"One absolute path reachable identically from every repo and every
worktree — which is why mailboxes stay here rather than inside a repo (an in-repo gitignored
mailbox reaches 1 of 25 worktrees; a committed one enters history, and is world readable in a
public repo)."* The code's model is central mailbox plus a per-worktree `.mailbox` symlink
accessor (`ensure_repo_mailbox_symlink`, `fleet_identity.py:496`).

Both costs D3 predicts have landed: the public-repo exposure, which is why `fleet/README.md`
needs its forbidden-content table; and the silent loss of self-polling. **Evidence the pattern
works:** the `tinychoir` fleet's central mailbox is a symlink to its in-repo location and
resolves correctly. Ours is a real directory, because the 2026-10-13 move left files in the way.

**Three candidate fixes with trade-offs are in `docs/FLEET-CROSS-HARNESS-COMMUNICATION.md`
§7.3** (symlink the central path / agents poll with `--file` / move back to central per D3).
**All three amend an operator decision, so none is an agent's to take.** The one unacceptable
option is leaving `--fleet/--agent` resolving to frozen files, because it fails silently.

**Warning for the seat restructure in flight:** the seat id is also the inbox filename and the
`--agent` poll key. Renaming `codex-01.md` → `<seat>.md` silently changes what every agent must
pass to `fleet-inbox-wait.sh`; an occupant still polling the old name blocks forever with no
error. Settle the mailbox **location** before the seat **names**, or it is two migrations.

Sent to `claude-11` at ~09:0x; **delivery was held pending that user's approval**. This file is
the record precisely because the message may not arrive.

---

## 2026-10-25 — ⚠ Identity correction from this seat, and a tmux/observability analysis

**This seat is running Claude Code (Opus 5), not Codex CLI.** Confirmed from inside the pane:
launch `--name`, `AGENT_NAME` and `QUEUECTL_AGENT` all read `safari-ai-agent-codex-01`, and the
pane process is `claude --model opus`. `claude-11` confirmed the same independently and recorded
it in `fleet-registry.yaml` (`channel_finding_2026_10_25`). **Verify a seat's harness by
inspecting its pane, never by reading its name.**

**Scope error by this seat, self-reported.** Earlier in this session I read `claude-04.md` as my
inbox, assumed the lead seat, and raised a queuectl reservation under `safari-ai-agent-claude-04`.
Wrong on all three counts. The reservation was released and re-taken as `codex-01`. **I hold no
lead grant.** The lead is `claude-11`, operator-granted 2026-10-25; I am not contesting it. The
only cause was trusting a seat name over the stamped identity — the same root cause as the
registry finding above, in the opposite direction.

**Deliverable:** `docs/FLEET-TMUX-OBSERVABILITY-ANALYSIS.md` — written, **uncommitted**, reserved
by this seat. Covers how fleet sessions are hosted in tmux, how nudge delivery works, what the
operator can observe, and eight findings. Diagrams plus a plain-English primer. No peer file and
no registry entry was touched.

**Two findings for the lead and the operator:**

- **F-2 (critical).** `fleet-nudge.py`'s `get_inbox_path()` resolves to the **external mailbox
  frozen on 2026-10-13**, not `fleet/`. Any supervisor started for this fleet would watch a file
  nobody writes — starting cleanly, printing "Watching inbox:", and never firing. Same stale root
  as the `--add-dir` defect `claude-11` found in this seat's launch profile, reached by a
  different route.
- **F-8 (operator-reserved).** The seat misnomer above. A rename is an identity event touching
  git history, mailbox filenames and file headers; no agent should self-resolve it.

**Correction to my own analysis, credited to `claude-11`.** I had written that tmux `send-keys`
*is* the cross-harness channel and that deploying the supervisor was simply a missing step. That
overstated what is sanctioned. Verified against `FLEET-TMUX-LAUNCH.md`: `:7` (tmux hosts a
terminal a supervisor *may* address, but delivery and acknowledgment are separately tested
responsibilities), `:61` (`nudgeable: false` until an adapter probe succeeds), `:71` (probe
matrix, including input-editing-mode and operator attach/detach), `:68` (never auto-answer
approval prompts), `:75` (the existing smoke test does not qualify TUI messaging). **An adapter
qualification probe is therefore a mandatory gate before any supervisor deployment.** The
copy-mode defect in the analysis (F-3) is one of the `:71` cases failing in advance — evidence
the probe is needed, not a way around it.

**Timeline fact for whoever updates the registry:** a `fleet-safari-ai-agent-claude-04` session
was **live this morning** — present at ~08:09, gone by ~08:33. It wrote its own
`claude-04.status.md` at 08:17. "Dormant since 10-14" would date it wrongly; "exited during the
2026-10-25 session" is accurate.

**Reply to this seat in this file or `codex-01.md`.** A direct message sent to `claude-11` at
~08:40 was **held pending that user's approval** and may never have been delivered — which is
exactly why this record is here rather than only in a message.

---

## 2026-10-14 — Testing checkpoint

Assignment 09 bodies received: acknowledge D-042 review and confirmed division/sequencing. Read Claude-04 handover to Claude-9a. Consolidated device findings and ordered owner actions added at top of docs/TRACKER.md; notified both inboxes. Zero formal ten-run runs recorded; Stop-while-queued, controlled recovery and targeted D-035/036/038/039/040 confirmation unestablished in this session. Next owner actions: 0.2.4 confirmation, connected browser_status pre-flight, then demo-page Part A2 with incremental guidance. Today's optional public-site navigation test has no result. Product is Safari AI Agent, not example website. Preserve lead-owned run sheet/results. No gate closed or new feature started. Owner requires tracker/fleet updates after every change, including issued tests and reported results; this corrects the omitted test-instruction checkpoint.


---

## 2026-10-13 — Private app test cancelled by owner

Owner requested removal because the application's additional connections make this test unsuitable. Removed only the private test Serve mapping and released the corresponding registry reservation. Verified test mapping absent and existing gateway/control mappings retained. Application unchanged; no post-login acceptance claimed. No further setup for this application planned. Inbox checked; earlier device reachability evidence retained as history.

---

## 2026-10-13 — Owner confirms private login page opens

Owner reports the private test login page opens on iPad; has not gone beyond login. Initial reachability confirmed by owner, post-login navigation and connector inspection pending. Researched descriptive addressing: named Tailscale Services require tagged host identity and administrative setup; path prefixes may affect existing app paths. No mapping/name changes made. Inbox and peer status checked; no new dated assignment body or ownership acknowledgment found.

---

## 2026-10-13 — Private proxy verification and registry reconciliation

Owner authorized a private Mac website test without changing the application and required available-port checks and device registry registration first. Checked canonical registry, active listeners and Serve configuration before allocation. Registry reservations, including previously missing gateway/control ports, published in ai-dev-dotfiles c55678f. Mac-side HTTPS login-page and JavaScript asset checks passed; test endpoint had no Funnel entry and existing gateway health passed. No application changes. iPad page reachability and connector inspection still require owner testing; no hardware gate closed. Operator addresses and deployment configuration remain outside this public record.

Read inbox header assignment 08 and peer status at this checkpoint. First dated inbox body still starts with the earlier migration message; no new assignment body found. Enhancement ownership acknowledgment remains pending. Existing approved work retained; future packages not started.

---

## 2026-10-13 — Private Mac websites clarification

Owner asked how to use Mac-local websites with no public exposure, reachable through Tailscale. Verified official Serve docs: private tailnet reverse proxy, HTTPS and existing tailnet access controls; Serve/Funnel cannot share a port. Proposed separate private port, leaving gateway/control forwarding intact. Existing paired Safari DOM bridge works with private HTTP(S) pages; cloud provider only reaches the public MCP gateway. Private pages require iPad Tailscale connectivity. Added existing-web-service path to P5 and tracker; no mapping created without a selected local target URL/port. No direct-file capability assumed.

---

## 2026-10-13 19:42 Europe/Prague — Enhancement plans drafted; lead inbox notified; install-fetch fix

Owner explicitly requested making the peer aware and dividing enhancement work with clear plans before implementation. Draft package catalog at docs/plans/ENHANCEMENTS-2026-10-13.md and formal discovery steps at docs/plans/enhancement-discovery-2026-10-13.yaml cover acceptance, markup/CSS/JS, find/scroll/site-search, visible feedback, screenshots, local files, ChatGPT/Gemini and background options. Proposed split: Codex connector modules/shared integration; Claude disjoint feasibility reports/device evidence/review. Message written in claude-04.md with plan links and a request to acknowledge/confirm. No acknowledgment yet; new implementations remain unapproved.

While planning, owner reported installer Failed to fetch. iPad mirror confirmed Safari displays 0.2.4 source; diagnostics show successful page loads followed by unauthenticated 401 requests. Public GitHub download matched the local build byte for byte. Control installUrl now uses the existing public source artifact; protected local route/auth remain. Owner given the GitHub link, no login needed. Full gates passed: 81/81 Node and all five browser suites. Plan YAML validated for required step fields and dependency references. Installer fix published as 052cdaf; plans/mailbox notification as 4c33f76. Post-reload Start/status/health smoke checks passed and status returns the published install link. Owner successful installation and peer acknowledgment remain pending. No account change, endpoint expansion or provider feature begun.

---

## 2026-10-13 19:40 Europe/Prague — Categories and saved button approvals verified

Owner-approved category change complete: managed/CLI full permission automatically executes recognised same-site navigation/page interactions; submissions/data changes/unclear controls still ask. Default Ask preserved. Generic button text alone does not authorize a tour control. Corrected form classification, including externally associated and invalid/missing button types, without changing hard ceilings. Saved Always allow now identifies one button on an exact page and survives sessions; current policy/classification still gate it, different/changed/ambiguous buttons cannot inherit consent, and revocation persists. Automatic/approved clicks recheck live identity/category before dispatch.

Full gates: 81/81 Node and all five browser suites pass. Fresh-bridge persistence, separate/changed buttons, three automatic tour steps, unclear/submit prompts and invalid button types covered. Narrow control UI/modal checked in Chromium; public example's navigation links classified without live clicks. Published core as e63cc50 and UI/docs as 2a78ceb. Post-update controller restart/Start API and gateway health smoke checks passed. Next is script 0.2.4 device walkthrough. No hardware gate self-accepted.

Read mailbox header assignment 07; at this checkpoint its first dated body still says 18:40 mailbox migration, with no new 19:30 instruction found. Retaining approved scope. Please own decision numbering/review for category disposition and persistent target consent; no unapproved provider or screenshot work begun. F5-01 screenshot/F6-01 source inspection requests recorded as separate feasibility items; existing inspect is bounded text/controls. Userscripts lists no screenshot API. No claims made that a native iPad screenshot tool works yet.

---

## 2026-10-13 19:22 Europe/Prague — Owner approved categories; persistent button approval requested

Owner approved the navigation/page-interaction/fill vs submission/data-change/unclear action matrix. Implementing automatic routine actions only for full permission; default Ask remains per-action. User supplied a public site as the navigation example; no deployment addresses recorded here. Same-site links and commanded navigation are the immediate repeated-prompt fix; known tour structures also recognised, without treating every Next button as safe.

Owner additionally requested Always allow persist for the particular button. Implementing isolated GM storage keyed by origin, exact page and stable control signature; ambiguous targets cannot persist. Current policy/classification still govern use; other buttons/categories must not inherit approval. Revoke remains available, and Stop still cancels/disconnects while retaining saved approvals. Testing reload/reconnect persistence, changed identities, denial and submission boundaries.

User asked about screenshots and full HTML/CSS/JS. Current inspect is bounded page text plus controls, not a full DOM/source or screenshot. Userscripts documents no screenshot API; automatic image capture needs separate platform/account feasibility. Recording capabilities for later review; no screenshot/source-export implementation begun. Core/control policy and corresponding tests/docs are reserved; peer-owned decision log/run sheet untouched.

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
