/*
 * File: extension/lifetime-probe/collector.mjs
 * Description: TEST-ONLY localhost collector for the service-worker lifetime
 *   probe. Stamps a server-side receive time on every event the probe reports,
 *   appends JSONL to extension/lifetime-probe/out/events.jsonl, and tells the
 *   probe which experiment arm to run via the HTTP response body.
 * Author: safari-ai-agent-sw-lifetime (Claude Code, Opus 5)
 * Created: 2026-10-11
 *
 * !!! TEST ONLY. Zero dependencies, by project rule. Binds 127.0.0.1:4037,
 * !!! taken from the registry's 4000-4050 temporary-testing range.
 *
 * WHY SERVER-SIDE TIMESTAMPS
 *   The whole point is to observe a process being killed. Anything the worker
 *   remembers dies with it, so the only trustworthy clock is one outside it.
 *   Date.now() inside the worker is still recorded, but silence in this log is
 *   the primary signal, and silence can only be seen from here.
 *
 * Usage:
 *   node extension/lifetime-probe/collector.mjs            # default mode 'active'
 *   node extension/lifetime-probe/collector.mjs idle       # start in the idle arm
 *   # switch arms at runtime (the probe picks it up on its next report):
 *   curl -X POST 'http://127.0.0.1:4037/mode?m=idle'
 */
import {createServer} from 'node:http';
import {appendFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'out');
const OUT_FILE = join(OUT_DIR, 'events.jsonl');
const PORT = 4037;

mkdirSync(OUT_DIR, {recursive: true});

let mode = process.argv[2] || 'active';
const started = Date.now();
let lastEventAt = null;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

function record(obj) {
  appendFileSync(OUT_FILE, JSON.stringify(obj) + '\n');
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  if (url.pathname === '/mode') {
    const m = url.searchParams.get('m');
    if (m) {
      mode = m;
      const gapMs = lastEventAt === null ? null : Date.now() - lastEventAt;
      record({serverAt: Date.now(), serverIso: new Date().toISOString(), ev: 'MODE-SET', mode: m, gapSinceLastEventMs: gapMs});
      console.log(`[${new Date().toISOString()}] MODE-SET -> ${m} (gap since last probe event: ${gapMs}ms)`);
    }
    res.writeHead(200, {...CORS, 'Content-Type': 'application/json'});
    return res.end(JSON.stringify({mode}));
  }

  if (url.pathname === '/note') {
    // Lets the driving script interleave its own markers (e.g. "Safari hidden")
    // into the same timeline as the probe events.
    const text = url.searchParams.get('t') || '';
    const gapMs = lastEventAt === null ? null : Date.now() - lastEventAt;
    record({serverAt: Date.now(), serverIso: new Date().toISOString(), ev: 'NOTE', text, gapSinceLastEventMs: gapMs});
    console.log(`[${new Date().toISOString()}] NOTE ${text} (gap: ${gapMs}ms)`);
    res.writeHead(200, {...CORS, 'Content-Type': 'application/json'});
    return res.end(JSON.stringify({ok: true, gapMs}));
  }

  if (url.pathname === '/wake') {
    // A page the content script matches, so navigating Safari here measures
    // message-triggered wake-up.
    res.writeHead(200, {...CORS, 'Content-Type': 'text/html'});
    return res.end('<!doctype html><title>wake</title><body>wake probe page</body>');
  }

  if (url.pathname === '/ev' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const serverAt = Date.now();
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { parsed = {raw: body}; }
      const gapMs = lastEventAt === null ? null : serverAt - lastEventAt;
      lastEventAt = serverAt;
      const row = {serverAt, serverIso: new Date(serverAt).toISOString(), gapSinceLastEventMs: gapMs, ...parsed};
      record(row);
      // Ticks are the noisy majority; only print the structurally interesting ones.
      if (parsed?.ev !== 'tick') {
        console.log(`[${row.serverIso}] ${parsed?.ev} boot=${parsed?.bootId} sinceBoot=${parsed?.sinceBootMs}ms gap=${gapMs}ms ${JSON.stringify({...parsed, ev: undefined, bootId: undefined, bootAt: undefined, clientAt: undefined, sinceBootMs: undefined, mode: undefined})}`);
      }
      res.writeHead(200, {...CORS, 'Content-Type': 'application/json'});
      res.end(JSON.stringify({mode}));
    });
    return;
  }

  res.writeHead(404, CORS);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  record({serverAt: started, serverIso: new Date(started).toISOString(), ev: 'COLLECTOR-START', mode});
  console.log(`collector listening on http://127.0.0.1:${PORT} (mode=${mode}) -> ${OUT_FILE}`);
});
