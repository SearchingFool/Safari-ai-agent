# Setup guide — step by step

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/docs/SETUP-GUIDE.md
**Description:** Complete setup walkthrough for connecting Claude to Safari on an iPad, written for someone who does not write code. Covers the Mac side, the Claude side, the iPad side, and how to stop everything.
**Author:** Claude Code (Opus 5)
**Created:** 2026-10-11
**Last Updated:** 2026-10-11
**Last Updated By:** Claude Code (Opus 5)

---

> **Not keeping this iPad?** If it is going to someone else, being sold or returned, read **[DEVICE-LIFECYCLE.md](DEVICE-LIFECYCLE.md)** before you start. The device token is a standing grant to drive a browser, it lives in extension storage rather than your Apple account, and **signing out of iCloud does not remove it.**
>
> **Read [the risks](../README.md#risks-you-must-understand-before-you-start) first.** This software lets an AI assistant click and type inside your web browser while you are logged in. That is genuinely useful and genuinely risky. Ten minutes of reading now is worth it.

## What you are building

**UI setup added 2026-10-13:** For gateway Start/Stop from the Mac or iPad, automatic startup, and website permissions without editing scripts, use [Gateway controls](GATEWAY-CONTROLS.md). The older Terminal setup below remains available. The new controller is separately authenticated and stays available when the gateway is stopped; reading does not need a site-list entry.

Three pieces talk to each other:

```
Claude (on your iPad or Mac)
   │   asks to click or type
   ▼
A small program on your Mac  ("the gateway")
   │   holds the request until your iPad asks for it
   ▼
Safari on your iPad          ("the bridge")
   │   asks YOUR permission, then does it
   ▼
The web page
```

Your Mac must stay **awake and online** the whole time. The iPad Safari tab must stay **in front**. Nothing works in the background — that is a limitation of iPad Safari, not a bug.

## What you need

| | |
|---|---|
| A Mac | macOS 12 or later, awake and online |
| An iPad | iPadOS 15.1 or later |
| Tailscale | installed and signed in on **both**, same account |
| A Claude account | one that supports custom connectors |
| Node.js 20+ | on the Mac only |
| About 30 minutes | first time through |

---

# Part 1 — The Mac

### Step 1.1 — Get the code

Open **Terminal** on the Mac and paste this, pressing Return after each line:

```sh
cd ~/Documents
git clone https://github.com/SearchingFool/Safari-ai-agent.git
cd Safari-ai-agent
```

### Step 1.2 — Check it works

```sh
npm run check
```

You should see a line ending in `# fail 0`. If you see failures, stop and ask for help — do not continue.

### Step 1.3 — Start it

```sh
bash tools/start-mac-tailscale-test.sh
```

The first run creates three secret passwords automatically and stores them on your Mac only. **Leave this Terminal window open.** Closing it stops everything.

You will see something like:

```
Claude MCP URL: https://your-mac-name.tailxxxx.ts.net/mcp
iPad test page: https://your-mac-name.tailxxxx.ts.net/demo
Demo username: safari-demo
```

**Write down that web address.** You need it twice.

> **What just happened:** your Mac is now reachable from the internet at that address. It is protected by passwords, but it is public. Anyone who guesses the address finds a login prompt. Stop it when you are finished (Part 4).

---

# Part 2 — Connect Claude

### Step 2.1 — Copy the password Claude needs

In a **second** Terminal window:

```sh
cd ~/Documents/Safari-ai-agent
printf 'Bearer %s' "$(awk -F= '/^MCP_CLIENT_TOKEN=/{printf "%s",$2}' .env.mac-tailscale)" | pbcopy
```

Nothing visible happens. The password is now on your clipboard.

### Step 2.2 — Add the connector

1. Go to **claude.ai** → your name → **Settings** → **Connectors**
2. Click **Add custom connector**
3. **Name:** `Safari AI Agent`
4. **URL:** the `/mcp` address from Step 1.3
5. For authentication, choose the option for a **custom request header**:
   - Header name: `Authorization`
   - Header value: press **⌘V** and type nothing else

> **This is the step people get wrong.** Do not type the words `Bearer <MCP_CLIENT_TOKEN>`. That is a placeholder, not a password. Paste only. The value should be 71 characters.
>
> **If you cannot edit the connector afterwards, delete it and make a new one.** There may be no way to correct a saved value.

### Step 2.3 — Test it

In Claude, enable the connector and send:

```
Call the browser_status tool.
```

Expect `connected: false`. That is correct — the iPad is not attached yet. If you get an error instead, see [Troubleshooting](#troubleshooting).

---

# Part 3 — The iPad

> ### Already set up the Mac and Claude? Start here.
>
> You need exactly four things from the Mac, all printed by the launcher in Step 1.3 and none of them secret enough to write down anywhere shared:
>
> | | |
> |---|---|
> | **Demo page** | your `https://<mac>.ts.net/demo` address |
> | **Base URL** | the same address with **nothing after it** — no `/demo`, no `/mcp` |
> | **Demo login** | username `safari-demo`, password = `DEMO_PASSWORD` |
> | **Device token** | `DEVICE_TOKEN` — **a different secret** from the one Claude uses |
>
> Both secrets live only in `.env.mac-tailscale` on the Mac. Copy them across with Universal Clipboard (Step 3.3); never type them into a chat, email or message.
>
> The Mac launcher must be **running** in a Terminal window the whole time, and the Mac must stay awake.

### Step 3.1 — Install Userscripts

1. Open the **App Store** on the iPad
2. Search for **Userscripts** (by Justin Wasack) and install it
3. Open **Settings** → **Apps** → **Safari** → **Extensions**
4. Turn **Userscripts** on
5. Tap it, and set your Mac's `.ts.net` address to **Allow**

### Step 3.2 — Install the script

1. In Safari on the iPad, open:
   `https://raw.githubusercontent.com/SearchingFool/Safari-ai-agent/main/scripts/safari-ai-agent-remote.user.js`
2. Userscripts should offer to install it. Accept.

> **There is no automatic update.** The script carries no `@updateURL`, so Userscripts will never tell you a newer version exists. **To update, repeat this step** — open the same address and accept the replace prompt. If the Mac side has been updated and the iPad behaves oddly, reinstall before debugging anything else.

### Step 3.3 — Get the iPad's password across

The iPad needs a **different** password from Claude's. Typing 64 random characters on an iPad is miserable, so use the clipboard instead.

On the **Mac**:

```sh
cd ~/Documents/Safari-ai-agent
awk -F= '/^DEVICE_TOKEN=/{printf "%s",$2}' .env.mac-tailscale | pbcopy
```

If both devices use the same Apple account with Handoff on, **Universal Clipboard** carries it over — just paste on the iPad. If not, AirDrop a text file to yourself instead.

> **Never** email, message or type these passwords into a chat, including into Claude.

### Step 3.4 — Open the demo page and connect

1. In Safari on the iPad, open the `/demo` address from Step 1.3
2. Sign in: username `safari-demo`, password = the `DEMO_PASSWORD` from the credentials file (same clipboard trick)
3. Tap **Remote AI** on the page
4. **Base URL:** your `.ts.net` address with **nothing after it** — no `/mcp`, no `/demo`
5. **Device token:** paste
6. Tap **Save** — *the token field going blank is correct and deliberate*
7. Tap **Connect**

The status should read `Connected`.

> **Sound when approval is needed** is a checkbox in the panel, on by default. Tick it off and on again and it plays two short beeps, so you can confirm audio works without waiting for a real prompt. The approval box **also pulses visually** every time it appears, so a muted iPad still gets your attention — the alert deliberately does not depend on sound alone (D-040).

> **Only one tab may be connected at a time.** If a second tab tries to connect, it is refused — but it now tells you **which page currently holds the session** and offers a **Take over** button. Use that, or press **Stop** in the other tab. (Previously this was a silent hang; D-017/D-023.)

> **If the tab is not in front, the agent is paused — deliberately.** The panel shows *"Paused — tab not visible"*, and the gateway will **refuse** to hand it a command rather than letting an approval prompt appear where you cannot see it. Claude will be told the tab is not visible. Bring the tab forward and it resumes on its own.

### Step 3.5 — Use Split View. This is a requirement, not a tip.

**On iPadOS, Safari must be visible on screen for the agent to touch the page.** Backgrounding Safari *suspends* the tab: polling stops, the session ages out, and every page-touching tool is refused.

Since you drive the agent from the Claude app, you need both on screen at once:

> Open Safari on the demo page, then drag **Claude** from the Dock to the side of the screen to enter **Split View** (or use Stage Manager).

Without this, `browser_status` works — it never touches the page — and everything else fails with *"No active iPad Safari device"*. Confirmed on device 2026-10-11 (D-029). It is an iPadOS constraint; no setting or update changes it.

The refusal is immediate (about 1 ms), so you get a clear error rather than a long hang.

### Step 3.6 — Try it

Keep that Safari tab **in front**. In Claude:

```
Call browser_status, then browser_inspect.
```

`connected: true` means everything is working.

---

# Part 4 — Stopping safely

**When you finish, stop it.** The web address is public while it runs.

1. On the iPad, tap **Stop** in the Remote AI panel
2. On the Mac, click the Terminal window and press **Ctrl+C**
3. Confirm nothing is still exposed:
   ```sh
   tailscale funnel status
   ```

---

# Can this be automated?

**The Mac side already is** — `start-mac-tailscale-test.sh` does everything, including creating the passwords.

**The iPad side cannot be, and that is Apple's doing.** Installing from the App Store, granting Safari extension permissions and installing a userscript all require manual taps. No script can do them for you.

What *could* reduce the typing, and is not built yet:

- **A QR code in the Terminal** encoding the gateway address, so the iPad can scan instead of type
- **A setup page** served by the gateway showing the device token for easy copying — *deliberately not built*, because it would mean the demo password alone could reveal the device token, collapsing two separate secrets into one

For now, **Universal Clipboard is the recommended shortcut** and needs no new code.

---

# Troubleshooting

Everything the gateway sees is logged. On the Mac, in a second Terminal:

```sh
cd ~/Documents/Safari-ai-agent
npm run diagnose
```

It prints what happened in plain language, with likely causes and suggested fixes.

| What you see | What it means |
|---|---|
| `MCP_NO_CREDENTIAL` | Claude's connector has no password saved |
| `MCP_TOKEN_LENGTH_MISMATCH` | Wrong or truncated paste — it tells you by how many characters |
| `DEVICE_ORIGIN_NOT_ALLOWED` | The iPad is on a page the gateway does not permit |
| `DEVICE_SESSION_CONFLICT` | Another tab holds the session. The panel names it — use **Take over**, or press Stop there |
| `paused: hidden` on a poll | The connected tab is not in front. Expected, not an error — bring it forward |
| `TOOL_BLOCKED_HIGH_IMPACT` | The agent tried something it is not allowed to do. Working as designed |
| `TOOL_APPROVAL_UNANSWERED` | **Nobody answered the prompt.** Not a refusal by you — you probably never saw it. Check the tab is on screen |
| `TOOL_DENIED_BY_OPERATOR` | You actually tapped **Deny** |
| `TOOL_STOPPED_BY_OPERATOR` | You pressed **Stop**, which revokes everything, not just that one action |
| `TOOL_TIMED_OUT` | Nobody answered the permission prompt. **The result is uncertain** — check the page yourself |
| No events at all | Claude never reached your Mac. Check the address, and that the Terminal is still running |

**Nothing happens when Claude calls a tool** → the Safari tab is not in front, or Stop was pressed, or another tab stole the session.

**Everything was working and then stopped** → the Mac went to sleep, or Safari backgrounded the tab. Wake the Mac, bring the tab forward, press Connect again.
