# Mac + Tailscale test deployment

**Status:** setup path prepared. No Mac, Claude subscription, or physical iPad has been accessed from this conversation. Public HTTPS and device acceptance remain outstanding.

## Why use Funnel?

Both Mac and iPad are on Tailscale. **Tailscale Serve** provides a private connection between them, but Claude's custom remote MCP connectors operate from Anthropic's servers and cannot reach that private tailnet. **Tailscale Funnel** exposes one local service at a public HTTPS `*.ts.net` address, without opening router ports, creating a cloud VM, or requiring a domain.

The public URL can be reached by anyone, so the gateway requires separate random bearer tokens for the Claude MCP client and the iPad device, and its action restrictions remain mandatory. This is for the harmless demo only, not personal or production webpages.

Verified references: [Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel), [Tailscale macOS CLI](https://tailscale.com/docs/reference/tailscale-cli?tab=macos), [Claude remote MCP connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Start on Mac

Requirements: Tailscale installed and logged in, Mac MagicDNS/HTTPS and Funnel allowed, Node.js 20+, git, curl. The macOS App Store Tailscale CLI is detected at its bundled app path; the Standalone variant must provide a `tailscale` command in PATH through CLI integration.

Run in Terminal:

```bash
git clone https://github.com/SearchingFool/Safari-ai-agent.git
cd Safari-ai-agent
npm run check
bash tools/start-mac-tailscale-test.sh
```

For an existing clone, use `git pull --ff-only` instead of `git clone` and continue from the repository root.

Existing two-token files are upgraded in place with a separate `DEMO_PASSWORD`; the original caller/device credentials are not changed. The demo challenges with browser HTTP Basic authentication over HTTPS and will not serve the test form anonymously.

The launcher automatically discovers the Mac's real Tailscale hostname, generates two API credentials plus an independent 64-character demo-page password in gitignored `.env.mac-tailscale` (permissions 0600), binds Node to **127.0.0.1:8787**, allowlists the precise HTTPS origin, checks the local gateway, and starts `tailscale funnel 8787` in the foreground. It never needs administrator/root access itself and does not alter the Tailscale installation.

Approve Tailscale's own Funnel enablement screen if prompted. Do not send either secret to ChatGPT, GitHub, or another person.

If the Mac already serves another application on port 8787 or the Funnel's public HTTPS port, stop and review the conflict instead of replacing existing services.

## Configure Claude

The launcher prints the **Claude MCP URL**, ending in `/mcp`. On your own Claude account (web settings for custom connectors):

1. Add a custom connector called **Safari AI Agent** with the printed MCP URL.
2. If supported on your account, choose no interactive sign-in **with** fixed request-header authentication: `Authorization: Bearer <MCP_CLIENT_TOKEN>`. Retrieve the actual token **locally on your Mac** from the credentials file; never paste it into chat.
3. Enable the connector in Claude on iPad; call **browser_status** as an initial non-destructive test.

If your Claude account does not support custom MCP tools or fixed authentication headers, stop and report that capability blocker; do not disable authentication or purchase API access without separate approval.

## Configure iPad

1. Keep existing Browser Lab. Install the separate [Remote AI Userscripts file](../scripts/safari-ai-agent-remote.user.js) from the `main` branch using its raw GitHub URL, and permit Userscripts only on the demo site.
2. Visit the printed iPad demo URL (ends in `/demo`). For the browser login use username `safari-demo` and the `DEMO_PASSWORD` value in the Mac's `.env.mac-tailscale` file; never use MCP_CLIENT_TOKEN or DEVICE_TOKEN in the login. Then tap **Remote AI**.
3. Enter the printed **base** gateway HTTPS URL (without `/mcp` or `/demo`) and the separate **DEVICE_TOKEN** from the Mac credentials file in the Remote AI extension panel. Select **Save** then **Connect**.
4. Keep this Safari tab active. Claude should now be able to call `browser_inspect` and other allowed tools. The iPad bridge requires local confirmation for clicking and navigation; high-impact submissions remain blocked.

Use [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for negative/security tests, a two-page task, connection interruption and repeatability evidence.

## End test and privacy

Press **Ctrl+C** in the Mac launcher Terminal to stop its foreground gateway/Funnel. Check `tailscale funnel status` to make sure the public exposure is disabled; if a Funnel configuration remains, stop that **specific** exposure per the Tailscale CLI (avoid resetting other running services).

The demo origin is public while Funnel runs, but tool calls require bearer authentication. Browser snapshots may contain private page text; do not enable remote automation on sensitive websites. Credentials are generated locally, never checked in, and should be rotated if exposed.

Mac must stay awake and online during tests. Successful GitHub CI does not establish that Claude or actual iPad Userscripts work until tested there.
