---
name: safari-agent-gateway
description: Check whether the Safari AI Agent gateway is running, start it on request, and diagnose why Claude or the iPad cannot connect. Use when the user asks if the gateway is up, how to start or restart it, says they forgot how, or reports "couldn't reach Safari AI Agent", a 401, a connection failure from the iPad, or that the agent stopped responding.
---

# Safari AI Agent — gateway status and start-up

Two questions: **is it up?** and **what do I press?**

## 1. Run the doctor first, always

```sh
bash tools/gateway-status.sh
```

Checks all four layers and prints the next action. **Do not reason from the symptom before
running it.** The error text the operator sees points at the wrong component more often than not
— Claude's "Couldn't reach Safari AI Agent" is usually a *rejected token*, not an unreachable
server.

## 2. Act on the result

| Doctor says | Do this |
|---|---|
| Everything is up | Give them the iPad controls URL it printed. Nothing to do. |
| Panel running, gateway not | Press **Start** in the controls — works from the iPad. Offer to do it (§3). |
| Panel NOT running | They must be **at the Mac**. Offer to run `npm run control`, or they double-click `Safari Gateway.command`. **There is no remote way to start the panel.** |
| Gateway not started by the panel | A Terminal launcher owns it. **Ctrl+C in that Terminal**, then Start in the panel. The panel refusing to manage a process it did not start is correct, not a bug. |
| Not reachable publicly | Tailscale is not serving. Check the Tailscale app is running on the Mac. |
| Login agent disabled | Say what it means — nothing returns after a reboot — but **do not enable it** (§5). |

## 3. Starting things — allowed, on request

You may, when the user asks:

- **Start the control panel** — `npm run control` (foreground; background it so it survives).
- **Start or stop the gateway** through the panel's API, or tell them to press Start.

Always re-run the doctor afterwards and report the real result rather than assuming it worked.

## 4. When it is up but something still cannot connect

**Read the log before theorising.** It distinguishes causes no UI message can:

```sh
npm run diagnose -- --since 15m
```

| Log says | Meaning and fix |
|---|---|
| `MCP_TOKEN_MISMATCH` | Claude's connector holds an old token. **Delete the connector and recreate it** — a saved auth value often cannot be edited, and a failed edit is indistinguishable from success. |
| `DEVICE_TOKEN_MISMATCH` | A tab is polling with a stale device token. Almost always **another tab left open across a credential rotation**. Have them close every bridge tab but one. |
| `MCP_NO_CREDENTIAL` | No Authorization header — usually OAuth discovery probes. Harmless. |
| `MCP_PROTOCOL_VERSION_MISMATCH` | Expected (D-015). Claude retries successfully. Not a fault. |
| 403 `Origin not allowlisted` | The site is not in the allowlist. Adding it is operator-reserved (§5). |

## 5. Operator-reserved — propose, never do

- **Enabling the login agent or `autoStart`** — republishes a public endpoint that returns by
  itself. D-045 and D-046 both put this with the operator.
- **Adding a site to the allowlist, or raising its permission tier.**
- **Spending money.**

Explain the trade-off and let them decide. Never self-authorize because it would be convenient.

## 6. Credentials: needing one is a SYMPTOM, not a routine step

**In normal operation credentials never need handling.** Claude stores the connector token, the
iPad stores the device token in Userscripts storage, the browser stores the control password.

**So if a credential is being asked for, find out why first:**

- A **mismatch in the log** means one stored copy is stale — name *which* one from the table in
  §4 and fix only that. Do not start a general re-entry of everything.
- **All four failing at once** means a rotation happened; every stored copy died simultaneously.
  That is the only case where a full re-entry is correct.
- **A new device** needs the device token, once.

**Never print a credential value** (D-046, `AGENTS.md` §6b). Finding one means locating and
validating it, never displaying it. To move one, use the clipboard, or write it **outside the
repo** for AirDrop:

```sh
awk -F= '/^DEVICE_TOKEN=/{printf "%s",$2}' .env.mac-tailscale | pbcopy
```

Verify by **checksum**, never by eye: `DEMO_PASSWORD` and `DEVICE_TOKEN` are both 64 hex
characters, so length does not prove you copied the right one. This exact mix-up happened on
2026-10-24 and cost four rounds of debugging.

**Clipboard transfer to the iPad is unreliable** — Universal Clipboard lags, and a stale
clipboard pastes the *previous* secret, which looks correct. On any second failure, switch to
AirDrop rather than retrying.

## 7. Facts that are not obvious and have each cost real time

- **`http://127.0.0.1:8788` breaks in Safari** — it upgrades to HTTPS and the panel is plain HTTP
  on loopback. **Use the public HTTPS controls URL everywhere, including on the Mac.**
- **The iPad never reaches `127.0.0.1`.** Tailscale Funnel runs on the Mac and proxies public
  `:8443` → loopback `:8788`. The panel binds loopback-only so the Funnel is the only door.
- **`tailscale funnel status` misleads in both directions** — it prints `# Funnel on:` with
  nothing mapped, and reports `No serve config` while the Tailscale app serves correctly. Trust
  only the functional check.
- **The instructions page is on the gateway, not the panel** — `https://<host>/help`, no port, no
  password. `:8443/help` returns 401 and is a different service.
- **Everything depends on the Mac being awake, logged in and online.** The panel starts the
  *gateway* remotely; nothing starts the *panel* remotely.
