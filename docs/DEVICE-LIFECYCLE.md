# Adding and removing an iPad

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/docs/DEVICE-LIFECYCLE.md
**Description:** How to add an iPad as a paired device, and — more importantly — how to remove everything from one before it leaves your hands. Written so an AI assistant on the device itself can follow it with you, step by step, without needing anything from the Mac except two values.
**Author:** Claude Code (Opus 5)
**Created:** 2026-10-11
**Last Updated:** 2026-10-11
**Last Updated By:** Claude Code (Opus 5)

---

> **If you are an AI assistant reading this on the device:** work through one numbered step at a time and wait for the person to confirm before moving on. Several steps have a verification line — do not skip it, and do not assume a step worked because the previous one did. Never ask the person to read a token aloud, paste one into a chat, or send one anywhere. If a step cannot be completed, stop and say so rather than improvising an equivalent.

## Decide first: are you keeping this device?

This is the only question that matters, and it is easy to get wrong because setup is quick and removal is not automatic.

| | |
|---|---|
| **You are keeping it** | Follow [Part A — adding a device](#part-a--adding-a-device). |
| **It is going to someone else, being sold, returned, or repurposed** | **Do not set it up.** Go to [Part B — removing a device](#part-b--removing-a-device-before-it-leaves). |
| **It is already set up and now going to someone else** | Go straight to [Part B](#part-b--removing-a-device-before-it-leaves). This is the case with a deadline. |

**Why this matters more than it sounds.** The device token is not a password to a website. It is a standing grant to drive a browser — to read pages you are signed into and click things on them — against your gateway, for as long as that gateway is running. It lives in extension storage on the device, not in your iCloud account, so **signing out of iCloud does not remove it.** Neither does handing the device over, factory-resetting only the Apple ID, or deleting the demo bookmark.

Setting up a device you will not keep means deliberately leaving that grant on hardware you no longer control.

---

# Part A — adding a device

## What the device needs

Four things, and only two of them are secret:

| | What it is | Secret? |
|---|---|---|
| **Userscripts** | A free Safari extension from the App Store (by Justin Wasack) | no |
| **The bridge script** | Installed from this repository's raw URL | no |
| **Base URL** | Your Mac's `https://<name>.ts.net` address, **nothing after it** | no |
| **Device token** | A long random string from `.env.mac-tailscale` on the Mac | **yes** |

The device token is **different** from the token Claude's connector uses. They are deliberately two separate secrets so that compromising one does not yield the other. Do not reuse one for the other, and do not store either in a notes app, a chat, an email, or this repository.

## Steps

**A1. Confirm the Mac is running.** The launcher (`bash tools/start-mac-tailscale-test.sh`) must be running in a Terminal window, and the Mac must be awake. Nothing on the iPad will work otherwise. See [SETUP-GUIDE.md](SETUP-GUIDE.md) Part 1.

**A2. Install Userscripts.** App Store → search *Userscripts* → install.

**A3. Enable it for your gateway's host only.**
Settings → Apps → Safari → Extensions → Userscripts → **on**, then set your `.ts.net` host to **Allow**.

> Grant it to that host, not to *All Websites*. The script's `@match` is `https://*/*`, so a blanket grant lets it load everywhere; the per-site permission is what actually keeps it off your bank.

**A4. Install the bridge script.** In Safari, open:

```
https://raw.githubusercontent.com/SearchingFool/Safari-ai-agent/main/scripts/safari-ai-agent-remote.user.js
```

Accept the install prompt.

> **There is no auto-update.** The script carries no `@updateURL` or `@downloadURL`, so Userscripts will never offer a newer version, and `@version` does not reliably move between changes. **Updating means repeating this step.** If the Mac side has been updated and the device behaves oddly, reinstall before debugging anything else.

**A5. Open the demo page and sign in.** `https://<your-host>.ts.net/demo`, username `safari-demo`, password = `DEMO_PASSWORD` from the Mac.

> The bare base URL returns **404**. That is correct — only `/demo` is a page.

**A6. Fill in the panel.** Tap **Remote AI**.

- **Base URL** — the `.ts.net` address with **nothing after it**. No `/demo`, no `/mcp`. *This is the most common setup mistake: pasting the full page URL here looks right and fails confusingly.*
- **Device token** — paste it. Do not type it.

Getting the token across without typing: on the Mac, `awk -F= '/^DEVICE_TOKEN=/{printf "%s",$2}' .env.mac-tailscale | pbcopy`, then paste via Universal Clipboard.

> **Universal Clipboard needs the same Apple ID on both devices**, plus Handoff, Bluetooth and Wi-Fi. On a device signed into a *different* Apple ID it will not work at all, and there is no indication — Paste simply offers whatever was last copied locally. If the device is on another Apple ID, AirDrop a text file to yourself and delete it afterwards.
>
> Even on the same Apple ID the clipboard is easily clobbered: anything that copies on either device replaces it. If a paste gives you the wrong thing, re-copy on the Mac and paste immediately.
>
> **Do not sign a device into your Apple ID just to make this step easier.** Signing in syncs your iCloud data onto it and leaves Activation Lock to untangle later — a large and lasting cost for one paste. If the token is awkward to move onto a device, treat that as a signal about whether the device should be paired at all.

**A7. Tap Save, then Connect.** The token field going blank after Save is **correct and deliberate**.

**A8. Verify — do not skip this.** The panel should read **● Live in this tab**. On the Mac, `npm run diagnose` should show successful `/device/poll` entries. If the panel shows anything else, read [DIAGNOSTICS.md](DIAGNOSTICS.md) rather than retrying blindly.

**A9. Use Split View.** On iPadOS the tab must be **on screen** to act — backgrounding Safari suspends it. Put Safari and your AI client side by side. This is a platform constraint, not a setting.

---

# Part B — removing a device before it leaves

Work top to bottom. **Step B1 is the one that matters**; the rest is hygiene.

**B1. Remove the device token.**

1. Open Safari on the device and go to the `/demo` page (sign in if asked).
2. Tap **Remote AI**.
3. Tap **Stop**.
4. Clear the **Device token** field and the **Base URL** field, then tap **Save**.

**Verify:** the panel should read *Stopped*. On the Mac, run `npm run diagnose -- --since 5m` — there should be no further polls from that device.

**B2. Delete the bridge script.** Open the **Userscripts** app → find *Safari AI Agent Remote MCP* → delete it.

**Verify:** reload the demo page. The **Remote AI** button should no longer appear.

**B3. Revoke the extension's site permission.** Settings → Apps → Safari → Extensions → Userscripts → set your `.ts.net` host to **Deny**, or turn Userscripts off entirely.

**B4. Delete the Userscripts app** if the next owner has no use for it.

**B5. Tailscale — assume it IS involved. Corrected 2026-10-24.**

> **This section used to say the opposite and was wrong.** It claimed an iPad reaches the gateway
> over the public internet, does not need Tailscale, and "normally is not a member of your
> network". Checked against `tailscale status` and the gateway's own request log on 2026-10-24:
> the iPad **is** a tailnet member and its `/device/poll` requests arrive from a **tailnet**
> address (`100.x`), not a public one. Anthropic's requests to `/mcp` are the public ones.

**The security conclusion below did not change, and it is the part that matters.** The gateway is
published with `tailscale funnel`, which makes it reachable from the **public internet** whether or
not a device is on your tailnet. So **removing a device from your tailnet does NOT revoke its
access** — the device token keeps working from anywhere the Funnel is reachable. Tailnet membership
is how the iPad *happens* to route today; it is not what is protecting the gateway.

Both of these are therefore true at once, and both need doing:

```sh
tailscale status
```

**Expect the device to be listed.** Sign out in the Tailscale app on the device, and also remove it
from the [admin console](https://login.tailscale.com/admin/machines) from your own machine. Signing
out on the device alone leaves it an authorised machine on your private network.

**Then rotate `DEVICE_TOKEN` as well** (see the Mac-side steps). Tailnet removal alone is not
enough while the Funnel is public: a departing device still holds a token that works over the
public internet. **Rotation is what actually revokes access; tailnet removal is housekeeping.**

> While you are in `tailscale status`, look for devices you cannot identify. A machine named something generic like `localhost`, or one last seen months ago, is worth removing: you cannot make a security decision about a device you cannot name.

**B6. Clear Safari website data** for the gateway host: Settings → Apps → Safari → Advanced → Website Data → find the `.ts.net` entry → delete. This clears the saved demo login and any `sessionStorage` left behind.

**B7. Rotate the device token on the Mac — recommended.** Removal steps can be done wrong, and a token you have rotated cannot be misused regardless of what is left on the device.

1. Stop the launcher (Ctrl+C in its Terminal).
2. Edit `.env.mac-tailscale` and delete the whole `DEVICE_TOKEN=` line.
3. Start the launcher again — it generates a fresh one and tells you so.
4. **Every remaining device must be re-paired** with the new token (Part A, steps A6–A8).

> Rotating is the only step that does not depend on the device having been cleaned correctly. If the device is already gone, or you are not certain about any step above, **do this one**. It is the difference between trusting a checklist and not needing to.

**B8. If the device is already out of your hands**, skip to B7 and do B5's admin-console half. Those are the two you can still do remotely, and together they revoke both the browser grant and the network access.

---

## What is left behind if you do nothing

Stated plainly, because "I'll wipe it later" is the common failure:

- The **device token** stays in extension storage and keeps working against your gateway whenever it is running. The iPad normally reaches the gateway over your **tailnet**, but the Funnel publishes it to the **public internet** too — so the token keeps working even after the device leaves your network, your home, or the country. **Taking a device off the tailnet does not revoke anything; rotating the token does.**
- The **saved demo login** stays in Safari.
- If Tailscale was installed and signed in, the device stays an **authorised machine on your private network** until removed from the admin console.
- None of this is removed by signing out of iCloud, and none of it appears in any Apple-facing list of "things this device can access".

## Related

- [SETUP-GUIDE.md](SETUP-GUIDE.md) — full first-time walkthrough including the Mac and Claude sides
- [DIAGNOSTICS.md](DIAGNOSTICS.md) — reading `npm run diagnose` when a device will not connect
- [../README.md](../README.md) — the risks section; read it before adding any device
