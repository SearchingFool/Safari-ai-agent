# B1–D execution evidence

Updated: 2026-10-09. **Engineering validation is not equivalent to device acceptance.**

| Workstream | Result | Proof / remaining restriction |
|---|---|---|
| B1 — Provider/MCP | **Supported route verified in public documentation; account unverified** | Claude custom remote MCP connectors support iOS clients and eligible subscriptions; require public HTTPS. Account sign-in and fixed-header behavior still need a real test. |
| B2 — iPad transport | **Implemented, simulated** | Isolated Userscripts GM API documented; mocked-GM browser tests pass. Actual iPad background/polling/navigation handling not yet tested. |
| C1 — Browser tool contract | **Implemented and HTTP-tested** | Seven MCP tool schemas; legacy Streamable HTTP protocol 2025-11-25; accepts matching protocol-header requests and rejects wrong media type/version. |
| C2 — Gateway | **Implemented and tested locally** | Bearer separation, origin allowlist, one pending command, timeouts, replay/cancel resistance, explicit server-side device disconnect. Container packaging exists. **No public HTTPS deployment.** |
| C3 — Userscripts bridge | **Implemented, simulated** | Explicit origin activation, privileged GM storage/transport, connected controls, local approval and Stop. Chromium with mocked GM passes; real extension runtime not validated. |
| C4 — Minimum safety | **Implemented for tests, not audited** | Forbidden origin, bad credentials/arguments, refused submissions, old results and revoked commands rejected. No arbitrary JS from AI. A full security audit and live negative tests remain. |
| D1 — Observe/act/verify | **Integrated local HTTP/DOM roundtrip passes; live model not tested** | Real Node MCP gateway -> local GM-transport shim -> Chromium DOM -> verified result. Separate unrestricted CI tests cover simulated real page navigation/Userscripts reinjection. |
| D2 — Release | **Not accepted** | User Claude connector, HTTPS deployment, real iPad actions, navigation/recovery, ten-run reliability measurements all pending. |

## Test evidence

- `npm run check`: 13/13 Node/build/integration tests passed in local environment.
- `npm run test:browser`: 3/3 Chromium suites passed, including real MCP HTTP through isolated GM test shim. The original manual Browser Lab remains intact.
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
