/*
 * File: extension/lifetime-probe/analyze.mjs
 * Description: TEST-ONLY. Reduces extension/lifetime-probe/out/events.jsonl to the
 *   numbers that actually matter: worker boots (= a previous worker was torn
 *   down), silence gaps, alarm lateness, and message wake latency.
 * Author: safari-ai-agent-sw-lifetime (Claude Code, Opus 5)
 * Created: 2026-10-11
 *
 * Usage: node extension/lifetime-probe/analyze.mjs [path-to-events.jsonl]
 */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || join(HERE, 'out', 'events.jsonl');
const rows = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

const iso = t => new Date(t).toISOString().slice(11, 23);

console.log('=== TIMELINE (ticks collapsed) ===');
let runStart = null, runCount = 0, runBoot = null;
const flush = endAt => {
  if (runCount) {
    console.log(`  ${iso(runStart)} .. ${iso(endAt)}  ${runCount} ticks over ${((endAt - runStart) / 1000).toFixed(1)}s  boot=${runBoot}`);
  }
  runStart = null; runCount = 0; runBoot = null;
};
for (const r of rows) {
  if (r.ev === 'tick') {
    if (runStart === null) { runStart = r.serverAt; runBoot = r.bootId; }
    runCount++;
    continue;
  }
  flush(rows[rows.indexOf(r) - 1]?.serverAt ?? r.serverAt);
  const bits = [iso(r.serverAt), r.ev.padEnd(14), `gap=${String(r.gapSinceLastEventMs ?? '-').padStart(7)}ms`];
  if (r.bootId) bits.push(`boot=${r.bootId} sinceBoot=${String(r.sinceBootMs).padStart(7)}ms`);
  if (r.ev === 'alarm') bits.push(`lateness=${r.latenessMs}ms respawnedForAlarm=${r.respawnedForThisAlarm} timerWasDead=${r.timerWasDead}`);
  if (r.ev === 'wake') bits.push(`deliveryMs=${r.deliveryMs} respawned=${r.respawnedForThisMessage}`);
  if (r.ev === 'silent-probe-alarm') bits.push(`lateness=${r.latenessMs}ms RESPAWNED=${r.respawnedForThisAlarm}`);
  if (r.ev === 'silent-armed') bits.push(`remainingAlarms=${JSON.stringify(r.remainingAlarms)}`);
  if (r.ev === 'NOTE' || r.ev === 'MODE-SET') bits.push(JSON.stringify(r.text ?? r.mode));
  console.log(bits.join('  '));
}
flush(rows[rows.length - 1].serverAt);

console.log('\n=== WORKER INSTANCES (each boot == a fresh service worker) ===');
const boots = rows.filter(r => r.ev === 'boot');
let prev = null;
for (const b of boots) {
  const line = [`boot ${b.bootId} at ${iso(b.serverAt)}`];
  if (prev) {
    // Lifetime of the PREVIOUS worker: from its boot to the last event it sent.
    const lastOfPrev = [...rows].reverse().find(r => r.bootId === prev.bootId);
    line.push(`| previous worker ${prev.bootId} lived ${((lastOfPrev.serverAt - prev.serverAt) / 1000).toFixed(1)}s, silent for ${((b.serverAt - lastOfPrev.serverAt) / 1000).toFixed(1)}s before this respawn`);
  }
  console.log(line.join(' '));
  prev = b;
}
if (boots.length) {
  const last = boots[boots.length - 1];
  const lastEvent = [...rows].reverse().find(r => r.bootId === last.bootId);
  console.log(`current worker ${last.bootId}: alive ${((lastEvent.serverAt - last.serverAt) / 1000).toFixed(1)}s so far, last heard ${((Date.now() - lastEvent.serverAt) / 1000).toFixed(1)}s ago`);
}

console.log('\n=== ALARMS ===');
const alarms = rows.filter(r => r.ev === 'alarm');
console.log(`fired: ${alarms.length}`);
for (const a of alarms) {
  console.log(`  ${iso(a.serverAt)} lateness=${a.latenessMs}ms sinceBoot=${a.sinceBootMs}ms respawnedForThisAlarm=${a.respawnedForThisAlarm} timerWasDead=${a.timerWasDead}`);
}

console.log('\n=== SILENCE GAPS > 3s ===');
let last = null;
for (const r of rows) {
  if (r.ev === 'COLLECTOR-START' || r.ev === 'MODE-SET' || r.ev === 'NOTE') continue;
  if (last && r.serverAt - last.serverAt > 3000) {
    console.log(`  ${((r.serverAt - last.serverAt) / 1000).toFixed(1)}s of silence: ${iso(last.serverAt)} (${last.ev}) -> ${iso(r.serverAt)} (${r.ev})  sameWorker=${last.bootId === r.bootId}`);
  }
  last = r;
}
