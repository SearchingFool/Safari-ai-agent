/**
 * File: tools/analyze-handover.mjs
 * Description: Reads logs/gateway-diagnostics.jsonl and reconstructs which Safari
 *   tab held the device session over time, then times every handover between
 *   tabs. Exists to answer the one D-033 question that cannot be answered off a
 *   real device: when the operator switches tabs, does the new tab go live in
 *   about a second, or does it wait out the full 45s staleness window because
 *   iPadOS suspended the leaving tab before its "I am hidden" poll got out?
 * Author: Claude Code (Opus 5), acting as fleet lead
 * Created: 2026-10-11
 *
 * Usage:
 *   node tools/analyze-handover.mjs                 # whole log
 *   node tools/analyze-handover.mjs --since 10m     # last 10 minutes
 *   node tools/analyze-handover.mjs --log <path>
 *
 * Reads only. Writes nothing, touches no network, and never prints a token:
 * the only identifiers it shows are the per-tab instance ids, which are random
 * opaque strings minted in sessionStorage and are not credentials.
 */
import {readFileSync} from 'node:fs';

const args = process.argv.slice(2);
const flag = name => {const i = args.indexOf(name); return i < 0 ? null : args[i + 1];};
const LOG = flag('--log') || 'logs/gateway-diagnostics.jsonl';

// The gateway ages a session out after this long without a poll. A handover
// that takes about this long did NOT follow the visible tab - it waited for the
// incumbent to go stale, which is the slow path D-033 warns about.
const DEVICE_FRESH_MS = 45000;

function parseSince(text) {
  if (!text) return 0;
  const m = /^(\d+)([smhd])$/.exec(text.trim());
  if (!m) throw Error(`--since expects a value like 30s, 10m, 2h or 1d; got "${text}"`);
  const unit = {s: 1e3, m: 6e4, h: 36e5, d: 864e5}[m[2]];
  return Date.now() - Number(m[1]) * unit;
}

let lines;
try {
  lines = readFileSync(LOG, 'utf8').split('\n').filter(Boolean);
} catch (error) {
  console.error(`Cannot read ${LOG}: ${error.message}`);
  console.error('Run the gateway at least once with diagnostics enabled, or pass --log <path>.');
  process.exit(2);
}

const since = parseSince(flag('--since'));
const polls = [];
for (const line of lines) {
  let e;
  try { e = JSON.parse(line); } catch { continue; } // A torn final line is ordinary.
  if (e.path !== '/device/poll' || !e.deviceInstance) continue;
  const ts = Date.parse(e.ts);
  if (!Number.isFinite(ts) || ts < since) continue;
  polls.push({ts, instance: e.deviceInstance, origin: e.deviceOrigin,
              visibility: e.deviceVisibility, status: e.status});
}

if (!polls.length) {
  console.log('No /device/poll events carrying a tab identity were found.');
  console.log('If the log is not empty, it predates the session-identity fields:');
  console.log('restart the gateway on current code and re-run the device steps.');
  process.exit(0);
}
polls.sort((a, b) => a.ts - b.ts);

const seconds = ms => `${(ms / 1000).toFixed(1)}s`;
const short = id => id.slice(0, 12);
const clock = ts => new Date(ts).toISOString().slice(11, 23);

// A 200 means the gateway served this tab, so it held the session at that
// instant. That is the ground truth for ownership; 409 means refused.
const served = polls.filter(p => p.status === 200);
const byOrigin = new Map();
for (const p of served) {
  if (!byOrigin.has(p.origin)) byOrigin.set(p.origin, []);
  byOrigin.get(p.origin).push(p);
}

console.log(`\nSession handover report  (${polls.length} polls, ${served.length} served, log: ${LOG})\n`);

let handovers = 0;
for (const [origin, events] of byOrigin) {
  console.log(`Origin ${origin}`);
  const tabs = [...new Set(events.map(e => e.instance))];
  console.log(`  ${tabs.length} tab(s) served: ${tabs.map(short).join(', ')}\n`);

  let owner = null, ownerLast = null;
  for (const e of events) {
    if (owner === null) {
      console.log(`  ${clock(e.ts)}  tab ${short(e.instance)} takes the session`);
    } else if (e.instance !== owner) {
      const gap = e.ts - ownerLast;
      handovers++;
      // Everything between the old owner's last served poll and the new
      // owner's first one. 409s here are the new tab being told to stand by.
      const waiting = polls.filter(p => p.ts > ownerLast && p.ts < e.ts &&
                                        p.instance === e.instance && p.status === 409).length;
      // The gateway reports the LEAVING tab's visibility on its final poll.
      // 'hidden' means the leaving tab got its notification out and the new tab
      // could follow; 'visible' means it did not, and the gap is staleness.
      const leftAs = polls.filter(p => p.instance === owner && p.ts <= ownerLast).pop()?.visibility;
      const slow = gap >= DEVICE_FRESH_MS * 0.9;
      console.log(`  ${clock(e.ts)}  HANDOVER  ${short(owner)} -> ${short(e.instance)}   ${seconds(gap)}` +
                  `${waiting ? `  (${waiting} stand-by refusals)` : ''}`);
      console.log(`            leaving tab's last reported visibility: ${leftAs ?? 'unknown'}`);
      console.log(slow
        ? `            SLOW PATH: ~${seconds(DEVICE_FRESH_MS)} staleness window, so the new tab did NOT follow.\n` +
          `            The leaving tab's "hidden" poll did not reach the gateway - on iPadOS,\n` +
          `            suspension beat it (D-029). Fix the notification or shorten deviceFreshMs;\n` +
          `            do NOT add an unresponsiveness threshold (it would displace an open approval).`
        : `            FOLLOWED: the new visible tab took over without operator action (D-033 working).`);
    }
    owner = e.instance;
    ownerLast = e.ts;
  }
  if (owner) console.log(`  ${clock(ownerLast)}  tab ${short(owner)} still holding at end of log`);
  console.log('');
}

if (!handovers) {
  console.log('No handover observed: only one tab was ever served on each origin.');
  console.log('To produce one, open a second tab on the same site and switch to it.');
}
process.exit(0);
