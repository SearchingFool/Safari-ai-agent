# B1–D execution evidence

Updated: 2026-10-11. **Engineering validation is not equivalent to device acceptance.**

| Workstream | Result | Proof / remaining restriction |
|---|---|---|
| B1 — Provider/MCP | **VERIFIED LIVE 2026-10-11** | Real Claude custom remote MCP connector on the user's existing subscription, static `Authorization: Bearer` header accepted. Full `initialize` / `tools/list` / `tools/call` handshake over public HTTPS. No API billing incurred. |
| B2 — iPad transport | **macOS rehearsal passed; iPad unverified** | Real Userscripts extension paired on **macOS Safari**, polling ~1/s, all `DEVICE_OK`. iPadOS extension runtime, tab suspension and backgrounding still untested. |
| C1 — Browser tool contract | **VERIFIED LIVE 2026-10-11** | All seven tools exercised against a real client. Element refs correctly reassigned across navigation and the client used the fresh snapshot. Client requested protocol `2026-07-28` and renegotiated to `2025-11-25` after a 400 (see D-015). |
| C2 — Gateway | **VERIFIED LIVE 2026-10-11** | Public HTTPS via Tailscale Funnel, loopback-bound Node process. Reachability proven via Tailscale ingress IP, bypassing MagicDNS. `check:deployment` → `transport: PASS`, 7 tools. Tool round trips 2–1191 ms. |
| C3 — Userscripts bridge | **macOS rehearsal passed; iPadOS unverified** | Real extension, privileged GM storage/transport, explicit origin opt-in, token cleared from the DOM after save, local approval prompts observed. |
| C4 — Minimum safety | **Verified live on macOS; not audited** | Origin allowlist enforced, approval prompts on every ordinary click, **submission refused outright** (424 ms, no dialog, enforced in the bridge at execution point), **Stop performs server-side revocation** (`generation` incremented, subsequent status `connected: false`), stale refs reassigned across navigation. Still untested: denied approval, disallowed external navigation, suspension, network loss, Stop while queued. No security audit. |
| D1 — Observe/act/verify | **VERIFIED LIVE ON macOS 2026-10-11** | 10 tool calls, all HTTP 200: search → navigate → fill text/time/select → click → verify `Preview ready`, stopped without submitting, no copy/paste. Click returned `dispatched/unverified` and the client re-inspected rather than assuming success. |
| D2 — Release | **Not accepted** | Everything above was **macOS Safari, not the iPad**. Pending: iPad actions and lifecycle, live negative tests, same-origin recovery, ten-run reliability, security review. |

## Test evidence

- `npm run check`: **22/22** Node/build/integration tests passed (2 in `tests/build.test.cjs`, 12 in `tests/gateway.test.mjs`, 8 in `tests/diagnostics.test.mjs`) on 2026-10-11. The 12 gateway tests were additionally run 25 consecutive times with zero failures after the determinism fix.
- `npm run test:browser`: 3/3 Chromium suites passed, including real MCP HTTP through isolated GM test shim. The original manual Browser Lab remains intact.

**Correction (2026-10-11).** The earlier "13/13 Node tests pass" claim recorded a single lucky run of a suite that was in fact non-deterministic: roughly half of local runs failed. `/device/poll` returns immediately with `command:null` when the queue is empty, so the tests' single poll after an un-awaited `tools/call` raced the gateway's registration of the pending command and read `null`. The gateway and the iPad bridge were never affected — `src/remote.js` re-polls every 1200ms against a 25s command timeout and treats an empty answer as the normal idle case — so this was a test-harness defect, not a product defect. The tests now re-poll the way the real bridge does; 25 consecutive gateway runs and 5 consecutive full `npm run check` runs passed with no failures. Treat past single-run green results in this repo as unverified unless a repeat count is recorded alongside them.
- `tests/remote_browser_e2e.py`: requires browser navigation to intercepted HTTPS origin; **blocked in the current environment** by `ERR_BLOCKED_BY_ADMINISTRATOR`, and is scheduled in GitHub Actions' browser-integration job. Its result must be checked before merge.
- `Dockerfile`: not build-tested here because no container engine is available. Node gateway startup and loopback HTTP confirmed.

## Known unresolved behavior

- Userscripts runs only while Safari allows its content script to execute. Any iPad sleep/background behavior must be treated as an interruption; do not promise unattended operation.
- A click/navigation response may be *dispatched but unverified*. Re-inspect the destination and never retry an uncertain consequential action automatically.
- Public MCP endpoint requires a hosting account, public HTTPS hostname and owner-created secrets. No service was deployed and no paid provider account was modified.
- The MCP server uses a single-operator static bearer prototype, not OAuth/multi-user governance. Do not expose it to untrusted users.

## Documentation sources verified

- Claude custom remote connectors: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Safari Userscripts isolated GM APIs: https://github.com/quoid/userscripts
- Legacy Streamable HTTP: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
