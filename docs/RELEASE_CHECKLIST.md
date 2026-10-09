# B1–D release acceptance checklist

**Status: BLOCKED on external account / device checks.** Do not tag the AI-driven iPad MVP as accepted until every mandatory item is evidenced. These are operational tests that cannot be replaced with local simulation.

## Completed engineering checks

- [x] Existing manual Userscripts form manipulation preserved.
- [x] MCP gateway responds to initialize, tool discovery, status, tools/call and notification.
- [x] Client/device credentials separated; wrong origin/expired/duplicate requests rejected.
- [x] Local Stop triggers device-session cancellation, and queued commands are invalidated.
- [x] Real loopback MCP request executed against a Chromium DOM via mocked isolated Userscripts transport.
- [x] Non-sensitive `/demo` and `/demo/product` supplied by gateway, no real network submissions.
- [x] Deployment container and HTTPS endpoint smoke check provided.

## Mandatory owner-side evidence to obtain

- [ ] **Public HTTPS gateway:** Deploy with trusted TLS, distinct generated tokens, origin allowlist containing `https://YOUR_HOST`. Direct unencrypted upstream HTTP must not be internet-accessible.
- [ ] **Remote MCP endpoint:** Run `npm run check:deployment` using credentials stored outside the repository; record `transport: PASS` and seven tools.
- [ ] **Claude on existing subscription:** Add remote connector with supported authentication; demonstrate `browser_status` tool call from the iPad Claude app. Record eligibility/billing without publishing secrets.
- [ ] **Demo authentication:** Anonymous `/demo` and `/demo/product` must yield an empty HTTP 401 challenge; the distinct demo password must work and MCP/device bearer tokens must not grant access.
- [ ] **Actual Safari/Userscripts:** Install separate remote script, Save + Connect on `https://YOUR_HOST/demo`. Verify explicit permission and test that Stop disconnects gateway.
- [ ] **Natural-language workflow:** Ask Claude to search for widget, open Demo Widget, fill `Test Person` and `14:30`, select Basic, preview selection and verify `Preview ready` without submitting. No copy/paste of tool calls.
- [ ] **Same-origin recovery:** Navigate back to `/demo`, confirm the bridge reconnects as appropriate and resuming does not repeat a prior action.
- [ ] **Negative cases:** Deny click approval, try disallowed external navigation, blocked Submit, stale reference, suspend app, disconnect network, Stop while queued. Confirm no unintended actions.
- [ ] **Reliability:** Run 10 safe workflows; record each result and errors. Do not claim 100% success without evidence.
- [ ] **Security:** Review and approve remote exposure, secret rotation plan, retention policy, disclosure risks of webpage contents; only then consider production website access.

If any step fails, capture the client-visible response and gateway status (without credentials) in a GitHub issue. Resolve the exact problem before advancing the acceptance state.
