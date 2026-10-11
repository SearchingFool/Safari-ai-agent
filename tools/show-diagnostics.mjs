/**
 * File: tools/show-diagnostics.mjs
 * Description: Render the gateway diagnostics JSONL into a readable report:
 *   a session summary, the request timeline, grouped problems with likely
 *   causes and suggested actions, and an explicit "what to check next" verdict.
 *   Intended to answer "what is actually happening?" without reading raw logs.
 * Author: Claude Code (Opus 5)
 * Created: 2026-10-11
 *
 * Usage:
 *   npm run diagnose                 # full report for the default log file
 *   npm run diagnose -- --since 10m  # only the last 10 minutes
 *   npm run diagnose -- --path /mcp  # only one endpoint
 *   npm run diagnose -- --raw        # emit matching JSONL instead of a report
 */
import {readFileSync, existsSync} from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const file = flag('file', process.env.SAFARI_DIAGNOSTICS_FILE || 'logs/gateway-diagnostics.jsonl');
const pathFilter = flag('path');
const raw = args.includes('--raw');

if (!existsSync(file)) {
  console.error(`No diagnostics log at ${file}`);
  console.error('Start the gateway with diagnostics enabled (they are on by default in tools/start-mac-tailscale-test.sh),');
  console.error('reproduce the problem, then run this again.');
  process.exit(2);
}

function parseSince(text) {
  if (!text) return 0;
  const m = /^(\d+)([smh])$/.exec(text.trim());
  if (!m) return 0;
  const mult = {s: 1e3, m: 6e4, h: 36e5}[m[2]];
  return Date.now() - Number(m[1]) * mult;
}
const sinceMs = parseSince(flag('since'));

const events = readFileSync(file, 'utf8')
  .split('\n').filter(Boolean)
  .map(line => { try { return JSON.parse(line); } catch { return null; } })
  .filter(Boolean)
  .filter(e => !sinceMs || Date.parse(e.ts) >= sinceMs)
  .filter(e => !pathFilter || e.path === pathFilter);

if (raw) { for (const e of events) console.log(JSON.stringify(e)); process.exit(0); }

if (!events.length) {
  console.log(`No matching events in ${file}.`);
  console.log('If you expected a client request here, the client never reached this gateway at all —');
  console.log('check the URL in the client, and confirm the Funnel is still running (tailscale funnel status).');
  process.exit(0);
}

const bar = '='.repeat(74);
const first = events[0], last = events[events.length - 1];
const problems = events.filter(e => e.diagnosis.severity === 'error' || e.diagnosis.severity === 'warn');

console.log(bar);
console.log('SAFARI AI AGENT - GATEWAY DIAGNOSTICS REPORT');
console.log(bar);
console.log(`Log file        : ${file}`);
console.log(`Events          : ${events.length}  (${problems.length} needing attention)`);
console.log(`Window          : ${first.ts}  ->  ${last.ts}`);

// ---- Who actually talked to us -------------------------------------------
const agents = new Map();
for (const e of events) {
  const ua = e.userAgent || '(none)';
  agents.set(ua, (agents.get(ua) || 0) + 1);
}
console.log('\nCLIENTS SEEN');
for (const [ua, n] of [...agents].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}x  ${ua}`);
}

// ---- Endpoint breakdown ---------------------------------------------------
const byPath = new Map();
for (const e of events) {
  const key = `${e.method} ${e.path}`;
  if (!byPath.has(key)) byPath.set(key, new Map());
  const codes = byPath.get(key);
  codes.set(e.status, (codes.get(e.status) || 0) + 1);
}
console.log('\nENDPOINTS');
for (const [key, codes] of byPath) {
  const detail = [...codes].map(([c, n]) => `${c}x${n}`).join(' ');
  console.log(`  ${key.padEnd(30)} ${detail}`);
}

// ---- Grouped problems with advice ----------------------------------------
if (problems.length) {
  const groups = new Map();
  for (const e of problems) {
    if (!groups.has(e.diagnosis.code)) groups.set(e.diagnosis.code, []);
    groups.get(e.diagnosis.code).push(e);
  }
  console.log(`\n${bar}`);
  console.log('ISSUES TO INVESTIGATE');
  console.log(bar);
  const order = {error: 0, warn: 1};
  const sorted = [...groups].sort((a, b) =>
    order[a[1][0].diagnosis.severity] - order[b[1][0].diagnosis.severity] || b[1].length - a[1].length);
  for (const [code, list] of sorted) {
    const g = list[0].diagnosis;
    const mark = g.severity === 'error' ? '[ERROR]' : '[WARN ]';
    console.log(`\n${mark} ${code}  (${list.length} occurrence${list.length > 1 ? 's' : ''})`);
    console.log(`  ${g.summary}`);
    console.log(`  First: ${list[0].ts}  req=${list[0].requestId}`);
    console.log(`  Last : ${list[list.length - 1].ts}  req=${list[list.length - 1].requestId}`);
    if (g.likelyCauses.length) {
      console.log('  Likely causes:');
      for (const c of g.likelyCauses) console.log(`    - ${c}`);
    }
    if (g.suggestedActions.length) {
      console.log('  Suggested actions:');
      for (const a of g.suggestedActions) console.log(`    > ${a}`);
    }
  }
} else {
  console.log('\nNo problems detected in this window.');
}

// ---- Verdict --------------------------------------------------------------
console.log(`\n${bar}`);
console.log('WHAT THIS MEANS');
console.log(bar);
const codes = new Set(events.map(e => e.diagnosis.code));
const mcpEvents = events.filter(e => e.path === '/mcp');
const mcpOk = mcpEvents.some(e => e.diagnosis.code === 'MCP_OK');
const deviceOk = events.some(e => e.diagnosis.code === 'DEVICE_OK');
const nonCurl = events.filter(e => e.userAgent && !/^curl/i.test(e.userAgent));

const say = line => console.log(`  ${line}`);
if (!mcpEvents.length) {
  say('No request ever reached /mcp.');
  say('The client is not contacting this gateway. Verify the connector URL ends in /mcp');
  say('and that it exactly matches the public HTTPS hostname printed by the launcher.');
} else if (!nonCurl.length) {
  say('Only local curl probes were seen - no real client has connected yet.');
  say('Retry the connector, then re-run this report.');
} else if (mcpOk) {
  say('MCP authentication and transport are WORKING (a tools call or handshake succeeded).');
  if (deviceOk) say('The iPad bridge is also talking to the gateway. End-to-end path is live.');
  else say('The iPad bridge has NOT connected yet - pair the device to complete the path.');
} else if (codes.has('MCP_NO_CREDENTIAL')) {
  say('The client reached this gateway but sent no Authorization header.');
  say('This is a connector configuration problem, not a network problem.');
} else if (codes.has('MCP_TOKEN_MISMATCH') || codes.has('MCP_TOKEN_LENGTH_MISMATCH')) {
  say('The client reached this gateway and sent a credential that does not match.');
  say('Re-copy MCP_CLIENT_TOKEN and update the connector.');
} else if (codes.has('PROBE_OAUTH_DISCOVERY') && !mcpOk) {
  say('The client only attempted OAuth discovery and never sent a bearer credential.');
  say('That indicates it requires OAuth rather than a static header - a genuine capability');
  say('blocker for this design. Record it as the B1 answer instead of weakening auth.');
} else {
  say('The client reached this gateway but the exchange did not complete.');
  say('See ISSUES TO INVESTIGATE above for the specific failure and its suggested actions.');
}
console.log(bar);
