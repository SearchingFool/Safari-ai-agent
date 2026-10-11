/**
 * File: tests/diagnostics.test.mjs
 * Description: Unit tests for the gateway diagnostics classifier and for the
 *   guarantee that diagnostics never record credential values.
 * Author: Claude Code (Opus 5)
 * Created: 2026-10-11
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, renderHuman, createDiagnostics, SEVERITY} from '../gateway/diagnostics.mjs';
import {createGateway} from '../gateway/server.mjs';

const base = {
  method: 'POST', path: '/mcp', status: 200,
  authScheme: 'Bearer', authLength: 71,
  expectedMcpAuthLength: 71, expectedDeviceAuthLength: 71,
  contentType: 'application/json', protocolVersion: null, origin: null,
  rpcMethod: 'tools/list', deviceOrigin: null, allowedOrigins: ['https://example.org']
};
const at = over => classify({...base, ...over});

test('Distinguishes the three distinct MCP credential failures', () => {
  assert.equal(at({status: 401, authScheme: null, authLength: 0}).code, 'MCP_NO_CREDENTIAL');
  assert.equal(at({status: 401, authScheme: 'Basic', authLength: 40}).code, 'MCP_WRONG_AUTH_SCHEME');
  // Correct scheme, wrong size -> truncated or doubled paste, not a wrong secret.
  assert.equal(at({status: 401, authLength: 60}).code, 'MCP_TOKEN_LENGTH_MISMATCH');
  // Correct scheme and size -> genuinely the wrong secret.
  assert.equal(at({status: 401, authLength: 71}).code, 'MCP_TOKEN_MISMATCH');
});

test('Length diagnosis explains direction of the error', () => {
  assert.match(at({status: 401, authLength: 78}).summary, /too long/);
  assert.match(at({status: 401, authLength: 60}).summary, /too short/);
});

test('Discovery and legacy-transport probes are surfaced, not silently 404d', () => {
  const oauth = at({path: '/.well-known/oauth-protected-resource', status: 404});
  assert.equal(oauth.code, 'PROBE_OAUTH_DISCOVERY');
  assert.equal(oauth.severity, SEVERITY.WARN);
  assert.ok(oauth.suggestedActions.join(' ').includes('B1'));
  assert.equal(at({path: '/sse', status: 404}).code, 'PROBE_LEGACY_SSE_TRANSPORT');
});

test('Device origin rejection names the allowlist it was compared against', () => {
  const g = at({path: '/device/poll', status: 403, deviceOrigin: 'http://wrong.test'});
  assert.equal(g.code, 'DEVICE_ORIGIN_NOT_ALLOWED');
  assert.match(g.summary, /http:\/\/wrong\.test/);
  assert.ok(g.likelyCauses.join(' ').includes('https://example.org'));
});

test('HTTP 200 with a tool-level error is NOT reported as success', () => {
  // The whole point: 200 means the exchange completed, not that the action happened.
  const blocked = at({status: 200, isError: true, toolName: 'browser_click',
    toolError: 'High-impact control blocked: form submission; use the webpage manually'});
  assert.equal(blocked.code, 'TOOL_BLOCKED_HIGH_IMPACT');
  assert.ok(blocked.likelyCauses.join(' ').includes('BEFORE any approval prompt'));

  const denied = at({status: 200, isError: true, toolName: 'browser_click',
    toolError: 'User denied click'});
  assert.equal(denied.code, 'TOOL_DENIED_BY_OPERATOR');

  const timedOut = at({status: 200, isError: true, toolName: 'browser_click',
    toolError: 'Device command timed out; action outcome may be uncertain. Inspect again.'});
  assert.equal(timedOut.code, 'TOOL_TIMED_OUT');
  assert.equal(timedOut.severity, SEVERITY.ERROR);
  assert.match(timedOut.summary, /UNCERTAIN/);

  // A genuine success still reads as OK.
  assert.equal(at({status: 200, isError: false, toolName: 'browser_click'}).code, 'MCP_OK');
});

test('Successful exchanges classify as ok and render as a single line', () => {
  const g = at({status: 200});
  assert.equal(g.code, 'MCP_OK');
  assert.equal(g.severity, SEVERITY.OK);
  const line = renderHuman({ts: '2026-10-11T07:00:00.000Z', method: 'POST', path: '/mcp', status: 200, requestId: 'abc123', diagnosis: g});
  assert.ok(!line.includes('\n'));
});

test('Problem rendering includes causes and actions', () => {
  const g = at({status: 401, authScheme: null, authLength: 0});
  const text = renderHuman({ts: '2026-10-11T07:00:00.000Z', method: 'POST', path: '/mcp', status: 401, requestId: 'abc123', diagnosis: g});
  assert.match(text, /Likely causes:/);
  assert.match(text, /Try:/);
});

test('Diagnostics record credential shape but never credential values', async () => {
  const mcpToken = 'M'.repeat(48), deviceToken = 'D'.repeat(48), origin = 'https://example.org';
  const captured = [];
  const diagnostics = createDiagnostics({
    enabled: true, clientTokenLength: mcpToken.length, deviceTokenLength: deviceToken.length,
    allowedOrigins: [origin], write: () => {}, append: line => captured.push(line)
  });
  const g = createGateway({clientToken: mcpToken, deviceToken, allowedOrigins: [origin], diagnostics});
  await new Promise(r => g.server.listen(0, '127.0.0.1', r));
  const port = g.server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${mcpToken}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'})
    });
    assert.equal(response.status, 200);
    // Correlation id is echoed to the caller so a user can quote it.
    assert.ok(response.headers.get('x-request-id'));
    await new Promise(r => setTimeout(r, 20));
    const blob = captured.join('');
    assert.ok(blob.length > 0, 'expected a diagnostics event');
    assert.ok(!blob.includes(mcpToken), 'MCP token value must never be logged');
    assert.ok(!blob.includes(deviceToken), 'device token value must never be logged');
    const event = JSON.parse(captured[captured.length - 1]);
    assert.equal(event.diagnosis.code, 'MCP_OK');
    assert.equal(event.rpcMethod, 'tools/list');
    assert.equal(event.authLength, 7 + mcpToken.length);
  } finally { await g.close(); }
});

test('Device polls record which tab was talking and whether it was on screen', async () => {
  // A session handover (D-033) is invisible without these two fields: every
  // poll looks alike, so nothing can attribute a request to a tab or time a
  // transfer. tools/analyze-handover.mjs reads exactly deviceInstance and
  // deviceVisibility, so this is the contract between gateway and that tool.
  const mcpToken = 'M'.repeat(48), deviceToken = 'D'.repeat(48), origin = 'https://example.org';
  const captured = [];
  const diagnostics = createDiagnostics({
    enabled: true, clientTokenLength: mcpToken.length, deviceTokenLength: deviceToken.length,
    allowedOrigins: [origin], write: () => {}, append: line => captured.push(line)
  });
  const g = createGateway({clientToken: mcpToken, deviceToken, allowedOrigins: [origin], diagnostics});
  await new Promise(r => g.server.listen(0, '127.0.0.1', r));
  const port = g.server.address().port;
  const poll = (instanceId, visibility) => fetch(`http://127.0.0.1:${port}/device/poll`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${deviceToken}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({origin, instanceId, visibility})
  });
  try {
    assert.equal((await poll('tab-alpha-1', 'visible')).status, 200);
    // A second tab on the same origin while the first is visible is refused -
    // and the refusal must be attributable too, or a stand-by period cannot be
    // measured and a 409 storm could not be traced to the tab causing it.
    assert.equal((await poll('tab-beta-2', 'visible')).status, 409);
    await new Promise(r => setTimeout(r, 20));
    const events = captured.map(line => JSON.parse(line)).filter(e => e.path === '/device/poll');
    assert.equal(events.length, 2);
    assert.deepEqual(events.map(e => e.deviceInstance), ['tab-alpha-1', 'tab-beta-2']);
    assert.deepEqual(events.map(e => e.deviceVisibility), ['visible', 'visible']);
    assert.deepEqual(events.map(e => e.status), [200, 409]);
    // An absent visibility is recorded as the value the gateway ACTED on, not
    // as null, so the log cannot disagree with the decision it explains.
    await poll('tab-alpha-1', undefined);
    await new Promise(r => setTimeout(r, 20));
    const last = JSON.parse(captured[captured.length - 1]);
    assert.equal(last.deviceVisibility, 'hidden');
    assert.ok(!captured.join('').includes(deviceToken), 'device token value must never be logged');
  } finally { await g.close(); }
});

test('Error responses carry the request id for support correlation', async () => {
  const mcpToken = 'M'.repeat(48), deviceToken = 'D'.repeat(48);
  const g = createGateway({clientToken: mcpToken, deviceToken, allowedOrigins: ['https://example.org']});
  await new Promise(r => g.server.listen(0, '127.0.0.1', r));
  const port = g.server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST', headers: {Authorization: 'Bearer wrong', 'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'ping'})
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer realm="safari-ai-agent"');
    const body = await response.json();
    assert.equal(body.requestId, response.headers.get('x-request-id'));
  } finally { await g.close(); }
});
