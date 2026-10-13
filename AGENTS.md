# Agent instructions — Safari AI Agent

**File:** `AGENTS.md` (repo-relative — this repo is public; see the forbidden list below)
**Description:** The first file any agent working this repo should read. Declares where fleet coordination lives (in this repo, not outside it), the write-coordination policy, the quality gates, and the constraints that are not discoverable from the code.
**Author:** claude-04 (Claude Code, Opus 5) — fleet lead
**Created:** 2026-10-13
**Last Updated:** 2026-10-13
**Last Updated By:** claude-04

---

## 1. Fleet coordination lives IN THIS REPO

**Look in [`fleet/`](fleet/).** That is the single place to find who else is working here, what
they own, and what has been said. Start with [`fleet/README.md`](fleet/README.md).

```
fleet/
  README.md            <- read this first: participants, channels, rules
  fleet-registry.yaml  <- who is in the fleet, roles, write scopes, project gates
  mailbox/
    <agent>.md         <- that agent's inbox  (NEWEST FIRST)
    <agent>.status.md  <- that agent's status (NEWEST FIRST)
```

**If `fleet/` does not exist, create it** using the structure above and record yourself in
`fleet-registry.yaml` before substantive work. Do not invent a different location, and do not
fall back to a path outside this repository.

### Why in-repo, and not `~/.ai-dev-dotfiles/.coordination/`

Operator decision, 2026-10-13. The global
`~/.ai-dev-dotfiles/FLEET-MAILBOX-CONTRACT.md` specifies a mailbox under
`~/.ai-dev-dotfiles/.coordination/fleets/<FLEET_ID>/`. **This repository overrides that
location.** The external path is gitignored, machine-local, unversioned and unbacked-up — it does
not survive a dead disk, is invisible from another machine, and does not arrive with a clone. The
practical consequence was real: analysis written there had to be migrated by hand into
`docs/DECISIONS.md` to survive at all.

**Follow the global contract's protocol** — newest-first ordering, `ASSIGNMENT-ID` discipline,
disjoint `OWNS` write scopes, status written to a file rather than only printed — **but use
`fleet/` in this repo as the location.**

## 2. ⚠ THIS REPOSITORY IS PUBLIC

`github.com/SearchingFool/Safari-ai-agent` is **public**. Anything committed to `fleet/` is
world-readable, permanently, including after deletion — git history retains it.

**Never put in `fleet/` (or anywhere else in this repo):**

- Tokens, passwords, keys, bearer values, `tskey-*`, device tokens — **not even partially**
- Usernames for any authenticated endpoint
- Public hostnames, Funnel URLs, `*.ts.net` names, or any address that resolves to the operator
- Process IDs, local paths with the operator's home directory, or live deployment state

**Say "the control endpoint" and "the operator's device", not the address and not the account.**
A username plus a public endpoint is half a credential pair. If coordination genuinely requires
one of these, put it in `.env.*` (gitignored) and refer to it by name.

Already gitignored and must stay so: `.env`, `.env.*`, `*.secret`, `logs/`,
`.gateway-control.json`.

## 3. Write coordination — reserve before you write

Multiple agents work this repo **concurrently and in the same working tree**. Assume company
every session.

```bash
queuectl reserve --agent <fleet-id>-<agent> --repo <this repo> \
  --working-on "<task>" --files <abs path> ... --ttl-seconds 3600
# capture the token from the output — release takes --token, NOT --agent
queuectl release --token <token>
```

- Check `fleet/fleet-registry.yaml` for another agent's declared `OWNS` before touching a file.
- **Never edit a file another agent has declared.** Write to their mailbox and ask.
- Export `QUEUECTL_AGENT=<fleet-id>-<agent>` at session start. Without it the pre-write hook
  cannot distinguish your own reservations from a peer's and will report your own locks as
  contended.

## 4. Git — the index is shared

- **Path-form commits, always:** `git commit <path>... -m "..."`. Another agent may have files
  staged; a bare `git commit -m` silently absorbs them. This has nearly happened here.
- **Verify the staged set before every commit:** `git diff --cached --name-only`.
- **No `Co-Authored-By:` trailers** — operator preference.
- `git checkout` is **wrapper-blocked** in the primary checkout. Branch work needs a separate
  worktree — provision via `~/.ai-dev-dotfiles/tools/setup-worktree.sh` (this repo has
  `.worktree-config`). Never hand-roll `git worktree add`.
- **`git reset` is denied to agents.** Hand it to the operator.
- Commit incrementally; never leave completed work uncommitted.

## 5. Quality gates — run the full set, never a subset

```bash
npm run check          # full Node gate (build + tests + syntax)
npm run test:browser   # Playwright/Chromium suites; needs playwright + chromium
npm run diagnose       # human report over logs/gateway-diagnostics.jsonl
```

**Zero npm runtime and dev dependencies is deliberate.** Do not add one without a decision
record in `docs/DECISIONS.md`.

**Known gate gap:** `npm run check` enumerates its `node --check` targets **explicitly** rather
than globbing, so a newly added file is not syntax-checked and the suite stays green anyway.
**Add new entry points to that list in the same commit that creates them.**

## 6. Reserved to the operator — never self-authorize

- Widening the gateway origin allowlist, or exposing a new public endpoint
- Spending money or enrolling in paid programmes
- `git reset`; satisfying the Touch ID sheet that enabling an unsigned Safari extension raises
- Accepting a device-acceptance gate (D2-01) as closed

## 7. Canonical documents — prefer these over inference

| Document | What it owns |
|---|---|
| [`docs/TRACKER.md`](docs/TRACKER.md) | **Source of truth for delivery state.** Implementation evidence, not ideas |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decision log. **D-### numbers are assigned by the fleet lead** — propose, don't number |
| [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md) | What the product must do |
| [`docs/IPAD-DEVICE-RUN-SHEET.md`](docs/IPAD-DEVICE-RUN-SHEET.md) | Operator protocol for device sessions |
| [`README.md`](README.md) | **Risks 1–6. Read before any safety-adjacent change.** |

## 8. Two constraints that are not visible from the code

- **Split View is mandatory on iPadOS** (D-029) and is an **accepted operating limit**, not a
  bug. iPadOS suspends a backgrounded tab, the session ages out, page tools fast-fail in ~1 ms.
  No code change lifts it — **and the native extension does not either**; see
  `docs/SERVICE-WORKER-LIFETIME.md`.
- **A green suite is not acceptance.** D-039 passed its tests and was silent on real hardware;
  that failure produced D-040. Anything touching the approval path needs a device run.
