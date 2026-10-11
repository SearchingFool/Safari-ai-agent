# B1–D release acceptance checklist

**Status: BLOCKED on reliability and security review.** Do not tag the AI-driven iPad MVP as accepted until every mandatory item is evidenced. These are operational tests that cannot be replaced with local simulation.

**2026-10-11 — the device blocker is cleared.** The full natural-language workflow ran on the **physical iPad**: Claude on iPad drove a real Safari tab through 17 tool calls with no copy/paste. Operator denial, disallowed navigation and stale references were all refused, each by a different layer. B1-01, B1-02, B2-01, C1-01, C2-01 and D1-01 are closed on device.

**What is left is no longer about whether it works.** Outstanding: network loss mid-command, Stop while a command is queued, same-origin recovery, **ten-run reliability**, and an **independent security review**.

**Two cautions when reading the evidence below.** (1) **Submissions are no longer blocked by a ceiling** — hard ceilings are payment, account-deletion and credentials-security only, so a generic submit on a `trusted` origin prompts and, once approved, dispatches (D-026 (C) as chosen; D-034 for the stale tool description that still claims otherwise). (2) In the device run the submit **was dispatched** and nothing happened only because the demo page blocks itself with `preventDefault` — **demo-page results are not proof that submissions are prevented.**

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
- [x] **Claude on existing subscription:** *Done on device 2026-10-11.* `browser_status` invoked **from the iPad Claude app** (`ua=Claude-User`, 2 ms). Static bearer header on a custom remote connector; existing subscription; no API billing incurred.
- [x] **Demo authentication:** *Done 2026-10-11.* Anonymous `/demo` returned an empty 401 with a Basic challenge over the public path; MCP and device bearer tokens were both rejected; the distinct demo password granted access.
- [x] **Actual Safari/Userscripts:** *Done on the iPad 2026-10-11.* Real Userscripts extension, explicit per-site permission, Save + Connect on the demo origin; `/device/poll → 200` carrying token, origin, per-tab `instanceId` and `visibility`. Stop revocation verified earlier on macOS (polling ceased, `/device/disconnect` 200, `generation` incremented by `cancelAll()` — server-side revocation, not a paused poller); **Stop-while-a-command-is-queued is still outstanding on both.**
- [x] **Natural-language workflow:** *Done on the iPad 2026-10-11.* 17 tool calls; search → navigate → fill text/time/select → preview → verify `Preview ready`; no copy/paste; not submitted. Approval latency 3.6/5.5/6.8 s against the 25 s timeout.
- [ ] **Same-origin recovery:** Navigate back to `/demo`, confirm the bridge reconnects as appropriate and resuming does not repeat a prior action.
- [ ] **Negative cases:** Deny click approval, try disallowed external navigation, blocked Submit, stale reference, suspend app, disconnect network, Stop while queued. Confirm no unintended actions. — *On the iPad 2026-10-11: **denial refuses the action**, verified twice including on a submit (`TOOL_DENIED_BY_OPERATOR`); **disallowed external navigation** refused by the gateway in **0 ms**; **stale reference** refused by the bridge; **app suspension** characterised (D-029). **Submit is NO LONGER blocked by a ceiling** — see D-034; it prompts, and on a trusted origin an approval dispatches it. **Still outstanding: network loss mid-command, Stop while queued.*** — *2026-10-11 on macOS: **blocked Submit PASSED** (`browser_click` on the submit control refused in 424 ms with "High-impact control blocked: form submission", no approval dialog offered, form not submitted — refusal enforced in the bridge at the point of execution, not only at the gateway). **Stop PASSED** (see above). **Stale reference PASSED** implicitly — refs were reassigned across navigation and the client used the fresh snapshot. Still untested: denied click approval, disallowed external navigation, app suspension, network loss, Stop while a command is queued.*
- [ ] **Reliability:** Run 10 safe workflows; record each result and errors. Do not claim 100% success without evidence.
- [ ] **Security:** Review and approve remote exposure, secret rotation plan, retention policy, disclosure risks of webpage contents; only then consider production website access.

If any step fails, capture the client-visible response and gateway status (without credentials) in a GitHub issue. Resolve the exact problem before advancing the acceptance state.
