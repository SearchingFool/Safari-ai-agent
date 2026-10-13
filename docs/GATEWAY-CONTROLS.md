# Gateway controls — Mac and iPad

Updated: 2026-10-13. Implemented and locally verified; public control forwarding, login-service installation and the updated script still need an owner-side iPad run.

## First use

1. In the Mac Terminal running the old test launcher, press **Ctrl+C** once. The new panel deliberately does not stop a gateway it did not start.
2. In Finder, double-click **Safari Gateway.command** in this repository. It installs a per-user login controller and opens `http://127.0.0.1:8788`. Closing the setup Terminal afterward does not stop the login controller.
3. Sign in with username **safari-control** and paste the password copied by the launcher. This is a fourth, independent credential, stored locally in `.env.gateway-control`. It is not the MCP token, device token or demo password.
4. Click **Start gateway**. The MCP URL stays the same, so the existing Claude connector needs no URL change.
5. On the iPad, open the panel's **iPad controls** URL (the same Mac hostname with `:8443`), sign in with the control credential, and bookmark it. Transfer the password with Universal Clipboard or AirDrop if necessary; keep it out of chats. You can now start or stop the gateway from either device.
6. From the panel, open **Install the updated remote userscript** on the iPad. It serves the local build at `/install/safari-ai-agent-remote.user.js`, protected by the existing catalog demo login. Accept Userscripts' install/replace prompt. This avoids waiting for a GitHub push; the raw GitHub file remains the older build until changes are published.
7. On a webpage, enable Userscripts in Safari if needed, then tap **Remote AI → Connect**. Leave **Connect across websites** enabled. Once connected, newly opened websites auto-connect in read-only mode. Safari and Claude must remain visible together for page execution.

The Mac must stay awake, online, signed in to Tailscale and logged in. The gateway uses `caffeinate` while running. iPad requests use the public HTTPS endpoint and do not require the iPad to belong to the tailnet. Test with the iPad's Tailscale app on and off separately. This does not support Tailscale being off on the hosting Mac, waking a sleeping Mac, or starting before Mac login.

## Website permissions

Reading does not require a site-list entry. Password/payment/hidden field exclusions remain in the DOM engine; reading a webpage does not imply disclosure of protected form values.

For actions, paste a webpage URL under **Websites**, choose a permission, click **Add website**, then **Save settings**. The URL is normalized to its exact origin (scheme, hostname and port), so the permission covers that site's pages, not every subdomain.

| Permission | Behavior |
|---|---|
| Read only | Inspect and verify; no fills, commanded navigation or clicks |
| Fill fields and navigate | Fill ordinary fields and request navigation; no clicks |
| Allow clicks, fills and navigation | Trusted-site actions with local approval; generic submits can proceed after approval |

Unlisted websites stay read-only. Remove an entry to revoke its action permission. A settings save restarts a panel-owned gateway, cancels pending work, and discards old policy/grants. Reconnect Safari afterward. Removing a website does not block reading it.

## Automation and shutdown

The controller starts at Mac login; the gateway starts only when requested, unless you enable **Start the gateway automatically when I log in** and save. Startup settings and site permissions persist privately in `.gateway-control.json`.

**Stop gateway** stops browser automation and the controller-owned HTTPS forwarding on port 443. The password-protected control endpoint on port 8443 stays available while the controller runs, so the iPad can start the gateway again. Both are public HTTPS endpoints. Control requests require the separate password; mutations also require a same-origin request and CSRF token.

Double-click **Remove Gateway Controls.command** to remove the per-user login service and stop its owned gateway/control forwarding. It preserves local settings/passwords and does not reset unrelated Tailscale services.

The remote forwarding uses the port-specific foreground Funnel command documented by [Tailscale](https://tailscale.com/docs/reference/tailscale-cli/funnel). A port conflict is reported rather than replacing an existing service.

## Acceptance run

1. Start from the Mac UI. Confirm **Running**; open the demo and connect the bridge in iPad Split View. Ask Claude for `browser_status`, then `browser_inspect`.
2. Open an ordinary public website **without adding it to the list**. Permit Userscripts there, connect if needed, and ask Claude to report its title. Confirm reads work and a fill/click request is refused.
3. Add a harmless test origin with **Fill fields and navigate**. Save, reconnect and confirm fill works while clicks remain refused.
4. Use the bundled demo for trusted-site clicks and approval/Stop checks. Do not interpret its prevented submission as proof a real website cannot submit.
5. From iPad controls, stop the gateway; confirm the control page stays accessible. Start it again and reconnect Safari.
6. Repeat the iPad control/status test with iPad Tailscale on, then off. Keep Mac Tailscale on.
7. If desired, enable automatic gateway start, log out/in on the Mac, and verify. Then test removal of the login controller separately.

Engineering evidence: 79 Node/build tests, five Chromium browser suites, and native Mac Safari control-panel authentication/add/save verified on 2026-10-13. The new public 8443 control endpoint, actual login-agent lifecycle and new iPad script behavior are not yet accepted on hardware. The existing Terminal rig was not migrated during development.
