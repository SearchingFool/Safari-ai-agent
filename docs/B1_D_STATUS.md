# B1–D execution record

Date: 2026-10-09. Honest status; no device-specific facts inferred.

| Workstream | Outcome | Evidence and remaining blocker |
|---|---|---|
| B1 provider/MCP | **Supported path identified, actual account not verified** | Claude official remote MCP custom connectors support mobile; subscription permissions and fixed headers documented. Need operator sign-in, published HTTPS URL, live echo/browser_status call. |
| B2 iPad bridge | **Implemented; iPad untested** | Userscripts content world and GM storage/XHR remote transport coded. Simulated isolated-GM bridge tested in Chromium, but actual Userscripts API and suspension not tested. |
| C1 contract | **Implemented** | Seven versioned MCP tool definitions and JSON-RPC Streamable HTTP compatibility. Actual Claude inspector/client validation pending. |
| C2 gateway | **Implemented** | Two distinct bearer credentials, static origin allowlist, 1 inflight request, expiry, replay/cancel checks; Node HTTP tests pass. Gateway not deployed. |
| C3 Userscripts adapter | **Implemented** | Remote UI and foreground polling, manually enabled per exact origin, reinit on same-origin navigation, results/confirmations. Test through mocked GM and Chromium only. |
| C4 minimum controls | **Implemented for test use; not security audited** | Foreground site opt-in, allowlisted origin, human confirm on clicks/navigation, blocking high-impact controls, no arbitrary JS, no credential extraction. Further hardening and iPad proof needed. |
| D1 AI loop | **Contract permits model tool-calling, not live verified** | MCP roundtrip simulated and browser actions exercised separately; actual agent call from subscription and full navigation workflow pending. |
| D2 release acceptance | **Blocked** | Needs hosting/authorization/real iPad; physical Safari tests and repetition metrics cannot run from this environment. |

Prior user test: original manual Browser Lab can manipulate the HTTPBin form on iPad. This is evidence for A-01 only, not for B1–D.

Verification: `npm run check` (10/10 tests), existing Chromium Browser Lab smoke passed, remote DOM with mocked GM passed. Browser-host HTTP E2E test is blocked by Chromium network restrictions, not counted as passed. Run full suite in a normal development environment and record tool responses before publishing a release.

No separate AI subscription API was purchased or used, no cloud hosting was deployed, and no private service was made publicly accessible.
