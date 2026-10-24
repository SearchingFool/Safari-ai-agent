---
name: safari-agent-gateway
description: Install, start, stop, update, troubleshoot and rotate credentials for the Safari AI Agent gateway. Use when the user asks how to install or set it up, how to start/restart/stop the gateway, whether it is running, how to update or upgrade it after a new version, how to change the passwords, or reports "couldn't reach Safari AI Agent", a 401, a connection failure from the iPad, or that the agent stopped responding.
---

# Safari AI Agent — install, run, update, fix

The whole lifecycle. **Assume the user is new to this** — name the device each step happens on,
and never assume they know what a tailnet, a userscript or MCP is.

## 0. Orient first — do not assume the working directory

```sh
git rev-parse --show-toplevel 2>/dev/null || ls -d ~/Documents/Safari-ai-agent 2>/dev/null
```

`~/Documents/Safari-ai-agent` is where the setup guide tells a new user to clone it. **If neither
resolves, ask** — a wrong directory gives "file not found", which reads like a broken gateway and
is not.

**On an iPad there is no repo and no shell.** None of these commands can run there. From an iPad
you can only explain, or point at the controls URL. **Say so** rather than appearing to run a
check you did not run.

## 1. Which device does what

| Runs on | What |
|---|---|
| **Mac** | the gateway, the control panel, Tailscale. Must be **awake and logged in** |
| **iPad** | Safari + the Userscripts bridge, and the Claude app |
| **Off-device** | Anthropic (the model) and the websites being driven |

Full detail: `docs/ARCHITECTURE-DATAFLOW.md`. **Nothing starts the control panel remotely** —
that always needs the Mac.

## 2. Is it up, and what do I press?

```sh
bash tools/gateway-status.sh      # or: npm run gateway:status
```

Checks all four layers and prints the next action. **Run this before reasoning from the symptom.**

| It says | Do |
|---|---|
| Everything is up | Give them the controls URL it printed |
| Panel running, gateway not | Press **Start** in the controls — works from the iPad. Offer to do it |
| Panel NOT running | They must be **at the Mac**: double-click `Safari Gateway.command`, or `npm run control` |
| Gateway not started by the panel | A Terminal launcher owns it. **Ctrl+C there**, then Start in the panel. The panel refusing to manage a process it did not start is correct |
| Not reachable publicly | Tailscale is not serving. Check the Tailscale app on the Mac |
| Login agent disabled | Explain it: nothing returns after a reboot. **Do not enable it** (§7) |

## 3. Installing from scratch

**Send them to `docs/SETUP-GUIDE.md`** — it is written step by step for non-technical users. Do
not improvise an install; walk them through that document.

They will need: a **Mac** (awake, online), an **iPad**, **Tailscale** on both signed into the same
account, a **Claude account** supporting custom connectors, **Node 20+** on the Mac, ~30 minutes.

The shape, so you can orient them:

1. **Mac** — clone, `npm run check`, start the gateway
2. **Claude** — add a custom connector with the MCP token
3. **iPad** — install Userscripts, install the bridge script, paste the device token, Connect
4. **Split View is mandatory** on iPadOS (D-029) — not a tip

Once running, the gateway serves its own instructions at **`https://<host>/help`** — no password,
no credentials in it. Point the user there; it is easier than reading the repo on a tablet.

## 4. Updating after a new version

**Nothing updates itself**, and the parts are separate. Doing one and not the others is the usual
cause of "it stopped working". Full detail in `docs/SETUP-GUIDE.md` Part 5.

```sh
git pull && npm run check          # must end with 0 failures
```

**Then restart the gateway** — Stop/Start in the panel, or Ctrl+C and relaunch. **A running
gateway keeps using the code it started with**; this is the most common reason an update appears
to do nothing.

**Then check the iPad script version:**

```sh
grep -m1 "@version" scripts/safari-ai-agent-remote.user.js
```

If it differs from the version in the iPad's Remote AI panel, reinstall from the install URL and
reload the page. **The device token is kept** — it is not re-entered for a script update.

> **An old script is not harmless.** It fails closed on permission modes it does not understand,
> so the agent refuses actions for no visible reason. Check this first after any Mac update.

## 5. Starting and stopping — allowed, on request

- **Start the control panel**: `npm run control` (background it so it survives)
- **Start/stop the gateway**: through the panel, or tell them to press Start
- Always **re-run the doctor afterwards** and report the real result rather than assuming

## 6. When it is up but something still will not connect

**Read the log before theorising.** It distinguishes causes no UI message can:

```sh
npm run diagnose -- --since 15m
```

| Log says | Meaning and fix |
|---|---|
| `MCP_TOKEN_MISMATCH` | Claude's connector holds an old token. **Delete the connector and recreate it** — a saved auth value often cannot be edited, and a failed edit looks identical to success |
| `DEVICE_TOKEN_MISMATCH` | A tab is using a stale device token. Almost always **another tab left open across a password change**. Close every bridge tab but one |
| `MCP_NO_CREDENTIAL` | No Authorization header — usually OAuth discovery probes. Harmless |
| `MCP_PROTOCOL_VERSION_MISMATCH` | Expected (D-015). Claude retries successfully. Not a fault |
| 403 `Origin not allowlisted` | Site not in the allowlist. Adding it is operator-reserved (§7) |

**Claude's "Couldn't reach Safari AI Agent" is usually NOT a connection problem** — a rejected
token gives the same message as an unreachable server. Check the log before touching the URL.

## 7. Operator-reserved — propose, never do

- **Enabling the login agent or `autoStart`** — republishes a public endpoint that returns by
  itself (D-045, D-046)
- **Adding a site to the allowlist, or raising its permission tier**
- **Spending money**

Explain the trade-off and let them decide. Never self-authorize because it is convenient.

## 8. Changing the passwords

There are **four**, all 64 hex characters, all on the Mac:

| Name | Guards | Re-entered where |
|---|---|---|
| `MCP_CLIENT_TOKEN` | the AI's way in | Claude connector |
| `DEVICE_TOKEN` | the browser bridge | iPad Remote AI panel |
| `DEMO_PASSWORD` | demo pages + script install | browser sign-in |
| `CONTROL_PASSWORD` | Start/Stop panel | browser sign-in |

**Needing one is usually a symptom, not a routine step.** They are saved: Claude keeps the
connector token, the iPad keeps the device token, the browser keeps the passwords. So:

- **One mismatch in the log** → one stale copy. Name *which* from §6 and fix only that
- **All failing at once** → a rotation happened; everything must be redone
- **A new device** → the device token, once

To rotate: delete `.env.mac-tailscale` and `.env.gateway-control`, restart, redo all four.
**At the Mac, never remotely** — the iPad cannot reconnect until you carry the new token across.

**Never print a credential value** (D-046, `AGENTS.md` §6b). Locate and validate; do not display.
Move one by clipboard, or a file **outside the repo** for AirDrop:

```sh
awk -F= '/^DEVICE_TOKEN=/{printf "%s",$2}' .env.mac-tailscale | pbcopy
```

**Verify by checksum, never by eye.** `DEMO_PASSWORD` and `DEVICE_TOKEN` are both 64 hex
characters, so length proves nothing. This exact mix-up cost four rounds of debugging on
2026-10-24. **Clipboard to iPad is unreliable** — Universal Clipboard lags and a stale clipboard
pastes the *previous* secret, which looks correct. On a second failure, switch to AirDrop.

## 9. Gotchas that have each cost real time

- **`http://127.0.0.1:8788` breaks in Safari** — it upgrades to HTTPS and the panel is plain HTTP
  on loopback. **Use the public HTTPS controls URL everywhere, including on the Mac.**
- **The iPad never reaches `127.0.0.1`.** Tailscale proxies public `:8443` → loopback `:8788` on
  the Mac. The panel binds loopback-only, so Tailscale is the only door in.
- **`tailscale funnel status` misleads both ways** — prints `# Funnel on:` with nothing mapped,
  and says `No serve config` while the Tailscale app serves fine. Trust only a functional check.
- **`/help` is on the gateway, not the panel** — `https://<host>/help`, no port. `:8443/help` is
  401 and a different service.
- **Everything needs the Mac awake, logged in and online.**
