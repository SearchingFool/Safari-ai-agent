/*
 * File: extension/lifetime-probe/summarize-arms.mjs
 * Description: TEST-ONLY. Summarises each experiment arm (delimited by the NOTE
 *   markers the driving shell writes) into the one number that matters: how many
 *   of that arm's alarms arrived at a freshly respawned worker.
 * Author: safari-ai-agent-sw-lifetime (Claude Code, Opus 5)
 * Created: 2026-10-11
 *
 * Usage: node extension/lifetime-probe/summarize-arms.mjs
 */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const rows = readFileSync(join(HERE, 'out', 'events.jsonl'), 'utf8')
  .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

const marks = rows.filter(r => r.ev === 'NOTE');
for (let i = 0; i < marks.length; i++) {
  const start = marks[i].serverAt;
  const end = marks[i + 1]?.serverAt ?? rows[rows.length - 1].serverAt;
  const seg = rows.filter(r => r.serverAt >= start && r.serverAt < end);
  const alarms = seg.filter(r => r.ev === 'alarm' || r.ev === 'silent-probe-alarm');
  const boots = new Set(seg.filter(r => r.ev === 'boot').map(r => r.bootId));
  const respawned = alarms.filter(a => a.respawnedForThisAlarm).length;
  const lat = alarms.map(a => a.latenessMs).filter(v => v !== null && v !== undefined);
  const ticks = seg.filter(r => r.ev === 'tick').length;
  console.log(
    `${marks[i].text}`.padEnd(38),
    `dur=${((end - start) / 1000).toFixed(0)}s`.padEnd(10),
    `boots=${boots.size}`.padEnd(10),
    `alarms=${alarms.length}`.padEnd(11),
    `respawnedForAlarm=${respawned}/${alarms.length}`.padEnd(24),
    `ticks=${ticks}`.padEnd(11),
    lat.length ? `lateness ${Math.min(...lat)}-${Math.max(...lat)}ms` : ''
  );
}
