# B1–D release acceptance checklist

**Status: BLOCKED on iPad device checks.** Do not tag the AI-driven iPad MVP as accepted until every mandatory item is evidenced. These are operational tests that cannot be replaced with local simulation.

**2026-10-11 — the account/provider blocker is cleared.** A real Claude custom remote MCP connector authenticated over public HTTPS and completed the full natural-language workflow against a real browser. **That run was on macOS Safari, not the iPad.** macOS Safari and iPadOS Safari differ in extension lifecycle, tab suspension and backgrounding, so a macOS pass is a rehearsal, not acceptance. Items below marked *macOS* must be repeated on the device.

## Completed engineering checks

- [x] Existing manual Userscripts form manipulation preserved.
- [x] MCP gateway responds to initialize, tool discovery, status, tools/call and notification.
- [x] Client/device credentials separated; wrong origin/expired/duplicate requests rejected.
- [x] Local Stop triggers device-session cancellation, and queued commands are invalidated.
- [x] Real loopback MCP request executed against a Chromium DOM via mocked isolated Userscripts transport.
- [x] Non-sensitive `/demo` and `/demo/product` supplied by gateway, no real network submissions.
- [x] Deployment container and HTTPS endpoint smoke check provided.

## Mandatory owner-side evidence to obtain

- [x] **Public HTTPS gateway:** *Done 2026-10-11.* Tailscale Funnel, trusted TLS, three distinct generated secrets, origin allowlist set to the exact Funnel host; Node bound to `127.0.0.1` only. Public reachability proven via Tailscale ingress IP, bypassing MagicDNS.
- [x] **Remote MCP endpoint:** *Done 2026-10-11.* `npm run check:deployment` → `transport: PASS`, `toolCount: 7`, credentials read from the gitignored local file.
- [ ] **Claude on existing subscription:** Add remote connector with supported authentication; demonstrate `browser_status` tool call **from the iPad Claude app**. Record eligibility/billing without publishing secrets. — *Connector and `browser_status` verified 2026-10-11 but NOT from an iPad. Static bearer header accepted; no API billing. Device-side half outstanding.*
- [x] **Demo authentication:** *Done 2026-10-11.* Anonymous `/demo` returned an empty 401 with a Basic challenge over the public path; MCP and device bearer tokens were both rejected; the distinct demo password granted access.
- [ ] **Actual Safari/Userscripts:** Install separate remote script, Save + Connect on `https://YOUR_HOST/demo`. Verify explicit permission and test that Stop disconnects gateway. — *Passed on **macOS Safari** 2026-10-11, including **Stop revocation**: polling ceased, `/device/disconnect` returned 200, and a subsequent `browser_status` reported `connected: false` with `generation` incremented by `cancelAll()` — proving server-side revocation, not merely a paused poller. iPad outstanding.*
- [ ] **Natural-language workflow:** Ask Claude to search for widget, open Demo Widget, fill `Test Person` and `14:30`, select Basic, preview selection and verify `Preview ready` without submitting. No copy/paste of tool calls. — *Completed in full on **macOS Safari** 2026-10-11, 10 tool calls all HTTP 200. Must be repeated on the iPad.*
- [ ] **Same-origin recovery:** Navigate back to `/demo`, confirm the bridge reconnects as appropriate and resuming does not repeat a prior action.
- [ ] **Negative cases:** Deny click approval, try disallowed external navigation, blocked Submit, stale reference, suspend app, disconnect network, Stop while queued. Confirm no unintended actions. — *2026-10-11 on macOS: **blocked Submit PASSED** (`browser_click` on the submit control refused in 424 ms with "High-impact control blocked: form submission", no approval dialog offered, form not submitted — refusal enforced in the bridge at the point of execution, not only at the gateway). **Stop PASSED** (see above). **Stale reference PASSED** implicitly — refs were reassigned across navigation and the client used the fresh snapshot. Still untested: denied click approval, disallowed external navigation, app suspension, network loss, Stop while a command is queued.*
- [ ] **Reliability:** Run 10 safe workflows; record each result and errors. Do not claim 100% success without evidence.
- [ ] **Security:** Review and approve remote exposure, secret rotation plan, retention policy, disclosure risks of webpage contents; only then consider production website access.

If any step fails, capture the client-visible response and gateway status (without credentials) in a GitHub issue. Resolve the exact problem before advancing the acceptance state.
