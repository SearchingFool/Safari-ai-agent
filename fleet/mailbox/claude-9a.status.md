# Status — claude-9a (fleet `safari-ai-agent`)

**File:** `fleet/mailbox/claude-9a.status.md`
**Description:** Status reports from `claude-9a`. Newest first.
**Author:** claude-9a (Claude Code, Opus 5, session `safari-ai-agent-9a`)
**Created:** 2026-10-14
**Last Updated:** 2026-10-14
**Last Updated By:** claude-9a

> **ORDERING: NEWEST FIRST.** The most recent report is the first `##` section below.
> Everything further down is older history. **The tail of this file is permanently the oldest
> content** — do not read the end to find current state.

---

## 2026-10-14 — Mac rig made reboot-survivable. `autoStart` enabled; Funnel persistence REJECTED as actively harmful.

**Operator asked for the Mac-side gateway configuration and authorized "fully reboot-survivable".**
Delivered, but **not** the way the request was literally framed — the literal version would have
broken the thing it was meant to fix. Recording the reasoning because the next agent will
otherwise re-propose it.

### What was actually wrong

The iPad path had no unattended recovery. Three layers, checked independently:

1. **Control server — already survived.** A `launchd` login agent is installed and loaded, with
   `RunAtLoad` and `KeepAlive` both true. It restarts at login *and* is revived if it crashes.
2. **Gateway — did NOT.** `autoStart` was `false`, so after a reboot the control server came back
   and the gateway sat stopped until a human pressed Start.
3. **Public exposure — did NOT.** Both Funnels are foreground `tailscale funnel` processes and
   `tailscale serve status` reports no persisted config.

### Why persisting the Funnels was the wrong fix — read `gateway/control.mjs` before re-proposing

Persisting either Funnel in Tailscale's own serve config would have **disabled the control
server's automation on both ports**, because the server raises both Funnels itself and guards
against double-binding:

- `startInternal()` spawns `funnel --https=443 <gateway port>` as its own child, and **refuses to
  start at all** if port 443 is already in Tailscale's persisted config ("Tailscale HTTPS port 443
  is already in use").
- `main()` spawns `funnel --https=8443 <control port>` the same way, and skips iPad controls
  entirely if 8443 is already persisted.

So `--bg` persistence would have produced a boot that fails *every* time with a confusing error,
and `autoStart` would have failed with it. **Persistence already exists in this design — it lives
in the login agent plus `autoStart`, not in Tailscale.** My own earlier framing of layer 3 implied
the opposite and was wrong; this is the correction.

### Change made

Exactly one: `autoStart` `false` → `true`, written through `POST /api/settings` on the loopback
control API so the running server owned the change rather than having its state file edited
underneath it. **Site permissions were deliberately left untouched** — both entries remain as the
operator set them. No origin added, no new endpoint exposed, no Tailscale config written.

Side effect, as designed and documented in the code: saving settings restarts the gateway, which
discards session policy and in-flight commands. No device session was live, so nothing was lost.

### Verified by test, not by assertion

The claim "survives a reboot" was **tested**, not reasoned about — this repo's own precedent
(D-039 passed its tests and was silent on hardware) makes an untested claim worthless. Killed the
login agent with `launchctl kickstart -k` to simulate a login. **Within 3 seconds, unattended:**
control server back (new pid, `runs = 2`), gateway health `200`, **both** Funnels respawned as
fresh children. Then end-to-end through the public path: gateway `/health` → `200`; `/mcp` → `401`
(correct — auth required); public controls → `401` (correct). Tailscale serve config still empty,
so the start guards remain satisfied.

### What this does NOT close

**No device gate is closed and ten-run reliability is still zero runs.** This removes a *rig*
precondition that was silently underpinning every green result on record — every one was obtained
inside a window where a human had already brought three things up by hand. It makes the rig
trustworthy enough that a device run measures the product. It is not itself evidence about the
product.

---

## 2026-10-14 — Joined; liveness verified; lead seat is CONTESTED and unresolved

**Joined this fleet today.** Read `AGENTS.md`, `fleet/README.md`, `fleet/fleet-registry.yaml`
and the heads of both peer status files **before writing anything**. Reserved
`fleet/fleet-registry.yaml`, `fleet/README.md` and this mailbox pair through `queuectl` first.

### The seat conflict — the one thing a successor must not misread

The operator granted me the lead seat on 2026-10-14, in direct answer to my joining question
(the fleet's own rule is that a joiner must not self-assign authority). The grant was framed on
the premise that `claude-04` was idle with a last status entry of 2026-10-13T16:05Z.

**That premise was incomplete. `claude-04` is live and working.** Within seconds of my message it
took a `queuectl` claim ("lead: repair failed message delivery to codex-01") and **replaced the
`claude-9a` registry entry I had just written** with `role: research —
background/foreground-constraint options (P7). Assigned by lead 2026-10-14`.

So the registry currently states **both** that `claude-9a` holds the seat (my `leadership:` edit)
**and** that `claude-04` assigned me work as lead (its `agents:` edit). I did **not** revert its
write, and I left its own `agents:` entry untouched — an incoming lead does not rewrite a live
peer's self-declared entry. I have told `claude-04` directly that I will stand down to the
research scope it wrote if it holds operator instruction newer than mine; I would rather be a
worker than have two agents both acting as lead.

**UNRESOLVED AS OF THIS ENTRY. Awaiting `claude-04`'s acknowledgment or the operator settling it.**

### Liveness verified, not assumed — and one correction

- **`claude-04`: ALIVE.** Claude Code session in this repo's checkout, ~17h elapsed. Same-harness,
  so direct messaging works both ways; verified by it acting on my message immediately.
- **`codex-01`: ALIVE.** A Codex CLI session is running with this repo as its working directory,
  ~17h45m elapsed, cwd confirmed. The start time matches its own status history, so it is the
  same session that wrote the 2026-10-13 20:06 entry — not a replacement. It has been quiet
  ~12h: **idle-and-unnudged, not dead.**
- **Correction, recorded because I acted on it.** I first reported to `claude-04` that codex-01
  was not running. That was wrong — my process pattern was anchored to the start of the command
  field and missed every absolute-path invocation. I corrected it to `claude-04` in the same
  turn, because the wrong fact would have told it to abandon its in-flight repair of the
  codex-01 channel and skip an operator relay that is in fact worth spending.
- **Caveat on liveness.** Cumulative CPU on the Codex session is effectively zero. The process
  exists and is parked; that is not evidence it will act. Only a new entry in
  `codex-01.status.md` proves it is reading its inbox.
- Other agent sessions on this machine are in unrelated repos and are not fleet participants.
- No Codex session holds an active file reservation in this repo. The only active claims here are
  `claude-04`'s (on `fleet/mailbox/codex-01.md`) and mine.

### Repo state at my join

HEAD `1d49a56` (2026-10-13 20:06). Working tree is **dirty**: `fleet/fleet-registry.yaml` and
`fleet/mailbox/codex-01.md`. The registry change is mine plus `claude-04`'s; the `codex-01.md`
change is `claude-04`'s in-flight channel repair. Ten task worktrees and six harness-native
worktrees exist. I have not run the gates this session and claim no verification.

### What I have NOT done

No work on the product. No edit outside this mailbox pair and the registry's `leadership:` block
plus my own entry. No gate run, no commit, no branch, no worktree. No D-### assigned — I will not
exercise lead authority while the seat is contested. Nothing accepted as closed.

### Open, needing the operator (carried forward from `claude-04`'s 16:05Z report; still open)

1. **Settle the lead seat** — `claude-04` is live, which the grant did not account for.
2. **Ten-run iPad reliability: still zero runs.** The one dimension the objective names is the
   one with no data. Needs the operator and the physical device; no agent can unblock it.
3. **Five approval-path fixes (D-035/036/038/039/040) remain test-pinned, never thumb-tested.**
   D-039 passed its tests and was silent on real hardware; that is the precedent.
