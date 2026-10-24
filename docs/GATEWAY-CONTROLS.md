# Gateway controls — Mac and iPad

Updated: 2026-10-13. Implemented and locally verified; public control forwarding, login-service installation and the updated script still need an owner-side iPad run.

## First use

1. In the Mac Terminal running the old test launcher, press **Ctrl+C** once. The new panel deliberately does not stop a gateway it did not start.
2. In Finder, double-click **Safari Gateway.command** in this repository. It installs a per-user login controller and opens `http://127.0.0.1:8788`. Closing the setup Terminal afterward does not stop the login controller.
3. Sign in with username **safari-control** and paste the password copied by the launcher. This is a fourth, independent credential, stored locally in `.env.gateway-control`. It is not the MCP token, device token or demo password.
4. Click **Start gateway**. The MCP URL stays the same, so the existing Claude connector needs no URL change.
5. On the iPad, open the panel's **iPad controls** URL (the same Mac hostname with `:8443`), sign in with the control credential, and bookmark it. Transfer the password with Universal Clipboard or AirDrop if necessary; keep it out of chats. You can now start or stop the gateway from either device.
6. In **iPad Safari**, open **Install the updated remote userscript** from the panel. It opens the published raw GitHub artifact and requires no login. Accept Userscripts' install/replace prompt. The published script contains no runtime credentials; pairing values stay in isolated Userscripts storage. The authenticated local build route remains available for development, but Userscripts' separate installer fetch does not reliably inherit Safari's Basic-auth login and can return “failed to fetch.” Publish the new script before asking the owner to install it.
7. Install remote script **0.2.4** for category permissions and saved button approvals. On a webpage, enable Userscripts in Safari if needed, then tap **Remote AI → Connect**. Leave **Connect across websites** enabled. Newly opened websites allow reads and ask before actions. Safari and Claude must remain visible together for page execution.

The Mac must stay awake, online, signed in to Tailscale and logged in. The gateway uses `caffeinate` while running. iPad requests use the public HTTPS endpoint and do not require the iPad to belong to the tailnet. Test with the iPad's Tailscale app on and off separately. This does not support Tailscale being off on the hosting Mac, waking a sleeping Mac, or starting before Mac login.

## Website permissions

Reading does not require a site-list entry. Password/payment/hidden field exclusions remain in the DOM engine; reading a webpage does not imply disclosure of protected form values.

Enter a webpage URL or hostname under **Websites**, choose a permission, click **Add website**, then **Save settings**. A bare hostname uses HTTPS; choose **Local web server (HTTP)** for an HTTP address without its prefix. The URL is normalized to its exact origin (scheme, hostname and port), so the permission covers that site's pages, not every subdomain. Change existing permissions using the dropdown in each row; no delete/recreate step is needed. **What do the permissions mean?** opens a description modal.

| Permission | Behavior |
|---|---|
| Ask every time (default) | Read freely; each fill, click and same-site navigation asks in Safari; no standing grants or existing field-value disclosure |
| Read only | Inspect and verify; no fills, commanded navigation or clicks |
| Fill only — navigation asks, clicks blocked | Fill ordinary fields without asking; navigation asks each time; no clicks, including search buttons |
| Full permission | Fill ordinary fields, navigate within the site and use recognised links, disclosures, tabs, menus and tour steps automatically; submissions, data changes and unclear actions ask |

Unlisted websites default to **Ask every time**. Set an explicit **Read only** entry to block actions without prompting. Removing an entry restores the ask default. A settings save automatically restarts a panel-owned gateway, cancels pending work and refreshes policy; saved button approvals remain in isolated Userscripts storage. Reconnect Safari afterward. After a code update, restart the controller login service to load the new gateway implementation before testing. An old script does not recognise ask and safely refuses actions until updated.

Navigation is currently same-origin only; crossing to another hostname or scheme remains blocked. Local HTML served over HTTP is supported by the script's HTTP match rule, with hardware validation still needed. On an iPad, localhost refers to the iPad itself, so use an address reachable from the iPad for a server running on the Mac. Direct `file://` pages and documents are not supported by this connector; the disabled local-file choice makes that limit explicit pending clarification and a scoped design.

## Automation and shutdown

### Saved button approvals

When Remote AI offers **Always allow this button on this page**, it saves approval in isolated Userscripts storage for that identifiable control on that exact origin, path and query. Reloads, reconnects, controller restarts and Stop do not erase it. A different button does not inherit it; changes to the label, ID, link destination or page may require a new approval. Ambiguous/unnamed controls cannot receive saved approval. Current site policy and classification are always checked first. Submissions, data changes, unclear and blocked actions cannot use a saved approval. Revoke individual approvals or **Revoke all** in Remote AI. Stop disconnects and cancels execution; it preserves these saved preferences.

Full permission already executes recognised routine controls automatically, so those actions need no Always allow prompt. The stored approvals apply where a permitted routine action still prompts, such as a legacy gateway configuration without automatic routine actions. Commanded navigation has no button identity and asks each time outside full permission.

The controller starts at Mac login; the gateway starts only when requested, unless you enable **Start the gateway automatically when I log in** and save. Startup settings and site permissions persist privately in `.gateway-control.json`.

**Stop gateway** stops browser automation and the controller-owned HTTPS forwarding on port 443. The password-protected control endpoint on port 8443 stays available while the controller runs, so the iPad can start the gateway again. Both are public HTTPS endpoints. Control requests require the separate password; mutations also require a same-origin request and CSRF token.

Double-click **Remove Gateway Controls.command** to remove the per-user login service and stop its owned gateway/control forwarding. It preserves local settings/passwords and does not reset unrelated Tailscale services.

The remote forwarding uses the port-specific foreground Funnel command documented by [Tailscale](https://tailscale.com/docs/reference/tailscale-cli/funnel). A port conflict is reported rather than replacing an existing service.

## Acceptance run

1. Start from the Mac UI. Confirm **Running**; open the demo and connect the bridge in iPad Split View. Ask Claude for `browser_status`, then `browser_inspect`.
2. Open an ordinary public website **without adding it to the list**. Permit Userscripts there, connect if needed, and ask Claude to report its title. Confirm reads work; ask to fill a harmless field, deny the prompt and confirm it stays unchanged, then repeat and approve it.
3. Add a harmless test origin with **Fill fields and navigate**. Save, reconnect and confirm fill works while clicks remain refused.
4. Use the bundled demo for trusted-site clicks and approval/Stop checks. Do not interpret its prevented submission as proof a real website cannot submit.
5. From iPad controls, stop the gateway; confirm the control page stays accessible. Start it again and reconnect Safari.
6. Repeat the iPad control/status test with iPad Tailscale on, then off. Keep Mac Tailscale on.
7. If desired, enable automatic gateway start, log out/in on the Mac, and verify. Then test removal of the login controller separately.

Engineering evidence: 79 Node/build tests, five Chromium browser suites, and native Mac Safari control-panel authentication/add/save verified on 2026-10-13. The new public 8443 control endpoint, actual login-agent lifecycle and new iPad script behavior are not yet accepted on hardware. The existing Terminal rig was not migrated during development.
