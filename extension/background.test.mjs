/*
 * File: extension/background.test.mjs
 * Description: Regression tests for the MV3 service-worker lifetime defect
 *   recorded as D-028 in docs/DECISIONS.md. These tests exist because the
 *   platform constraint they encode is invisible at runtime: a refactor that
 *   breaks it produces no error, no log line and no failing request - it just
 *   makes every session die silently 30 seconds after it starts.
 * Author: safari-ai-agent-sw-recovery (Claude Code, Opus 5)
 * Created: 2026-10-11
 *
 * WHAT IS BEING MODELLED
 *   docs/SERVICE-WORKER-LIFETIME.md measured that a WebKit MV3 background worker
 *   is destroyed 30.0 s after its own start regardless of activity, and that the
 *   keepalive alarm only survives that teardown when `alarms.create` runs during
 *   TOP-LEVEL EVALUATION (0/24 and 0/14 teardowns when armed there; 26/26 and
 *   6/6 when armed 2 ms later from inside the worker).
 *
 *   A teardown is therefore modelled here exactly as it behaves in reality:
 *   THROW AWAY THE WHOLE JAVASCRIPT REALM and evaluate background.js again in a
 *   fresh one, keeping only storage.local - which is the one thing that does
 *   survive. Anything the extension needs after a teardown must have been in
 *   storage, and anything it needs to restart must happen at top level.
 *
 * NOT WIRED INTO `npm run check`
 *   package.json and .github/ are outside this change's write scope, so this
 *   suite is not yet part of the repo gate. Run it with:
 *     node --test extension/background.test.mjs
 *   `node extension/build.mjs` additionally enforces the top-level-alarm
 *   invariant statically, so the bundle cannot be staged with it broken.
 */
import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BACKGROUND = join(here, 'web', 'background.js');
const SOURCE = readFileSync(BACKGROUND, 'utf8');

const GATEWAY = 'https://gateway.example';
const TOKEN = 'd'.repeat(32);
const ORIGIN = 'https://site.example';

/* --------------------------------------------------------------- harness */

/**
 * A fake WebExtension world. `storage` is a Map deliberately passed BETWEEN
 * harnesses to model the one thing that outlives a worker teardown.
 */
function createHarness({storage = new Map(), tab, gateway, exec, badge} = {}) {
  const h = {
    storage,
    // Call log across the whole fake API. Order matters for the top-level test.
    log: [],
    fetches: [],
    messages: [],          // messages sent to the content script
    alarmsCreated: [],
    badge: badge || {text: undefined, color: undefined},
    listeners: {alarm: [], message: [], tabRemoved: [], tabUpdated: []},
    tab: tab === undefined ? {id: 7, url: `${ORIGIN}/page`, active: true, windowId: 1} : tab,
    gateway: gateway || (() => ({status: 200, body: {command: null, generation: 0}})),
    exec: exec || (() => ({success: true, data: {}}))
  };

  const note = name => { h.log.push(name); };

  const api = {
    alarms: {
      create: (name, opts) => { note('alarms.create'); h.alarmsCreated.push([name, opts]); },
      onAlarm: {addListener: fn => h.listeners.alarm.push(fn)}
    },
    storage: {
      local: {
        async get(keys) {
          note('storage.get');
          const out = {};
          for (const key of keys) if (h.storage.has(key)) out[key] = h.storage.get(key);
          return out;
        },
        async set(obj) { note('storage.set'); for (const [k, v] of Object.entries(obj)) h.storage.set(k, v); },
        async remove(keys) { note('storage.remove'); for (const key of keys) h.storage.delete(key); }
      }
    },
    action: {
      setBadgeText: ({text}) => { note('badge'); h.badge.text = text; },
      setBadgeBackgroundColor: ({color}) => { h.badge.color = color; }
    },
    runtime: {
      lastError: undefined,
      sendMessage: () => undefined,
      onMessage: {addListener: fn => h.listeners.message.push(fn)}
    },
    permissions: {contains: async () => true},
    scripting: {executeScript: async () => { note('inject'); }},
    tabs: {
      async get(id) {
        note('tabs.get');
        if (!h.tab || h.tab.id !== id) throw new Error('No tab with id: ' + id);
        return {...h.tab};
      },
      async update(id, props) { note('tabs.update'); if (h.tab) h.tab.url = props.url; return {...h.tab}; },
      async sendMessage(id, message) {
        if (message.type === 'ping') return {ok: true};
        if (message.type === 'teardown') { h.messages.push(message); return {ok: true}; }
        h.messages.push(message);
        return h.exec(message);
      },
      onRemoved: {addListener: fn => h.listeners.tabRemoved.push(fn)},
      onUpdated: {addListener: fn => h.listeners.tabUpdated.push(fn)}
    }
  };

  const fetchImpl = async (url, init) => {
    const path = url.slice(GATEWAY.length);
    const body = JSON.parse(init.body);
    h.fetches.push({path, body});
    const reply = await h.gateway(path, body, h);
    return {status: reply.status, json: async () => reply.body};
  };

  // Real timers, but the 1.2 s poll interval is collapsed so a test can observe
  // several cycles in milliseconds. The 8 s request timeout is left alone so it
  // never fires during a test.
  //
  // h.kill() is how a test ENDS a worker. There is no such thing in the real
  // platform - a worker is killed from outside - so this models exactly that:
  // scheduled work stops happening and the pump's pending promise is simply
  // abandoned, which is also why the suite can exit afterwards.
  const timers = new Set();
  const fastSetTimeout = (fn, ms) => {
    if (h.dead) return 0;
    const handle = setTimeout(() => { timers.delete(handle); fn(); }, ms >= 5000 ? ms : Math.min(ms, 1));
    timers.add(handle);
    return handle;
  };
  const clearFast = handle => { timers.delete(handle); clearTimeout(handle); };
  h.dead = false;
  h.kill = () => { h.dead = true; for (const handle of timers) clearTimeout(handle); timers.clear(); };
  LIVE.push(h);

  h.context = vm.createContext({
    browser: api,
    chrome: undefined,
    fetch: fetchImpl,
    AbortController,
    URL,
    crypto: globalThis.crypto,
    console,
    setTimeout: fastSetTimeout,
    clearTimeout: clearFast
  });
  return h;
}

/** Workers spawned by the current test, torn down when it ends. */
const LIVE = [];
afterEach(() => { for (const h of LIVE.splice(0)) h.kill(); });

/** Evaluate background.js the way a freshly spawned worker would. */
function spawnWorker(h) {
  vm.runInContext(SOURCE, h.context, {filename: 'background.js'});
  return h;
}

function send(h, message) {
  return new Promise((resolve, reject) => {
    const handler = h.listeners.message[0];
    handler(message, {}, reply => (reply.ok ? resolve(reply.result) : reject(new Error(reply.error))));
  });
}

async function waitFor(predicate, what, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, 2));
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

const settle = (ms = 40) => new Promise(r => setTimeout(r, ms));

function seededStorage() {
  return new Map([['gatewayUrl', GATEWAY], ['deviceToken', TOKEN]]);
}

/** Start a session and wait until it is polling. Returns the harness. */
async function connected(options = {}) {
  const h = createHarness({storage: seededStorage(), ...options});
  spawnWorker(h);
  await send(h, {type: 'start', tabId: 7, origin: ORIGIN});
  await waitFor(() => h.fetches.some(f => f.path === '/device/poll'), 'first poll');
  return h;
}

/* ------------------------------------------------- the load-bearing invariant */

test('alarms.create runs during top-level evaluation, before anything else', () => {
  const h = createHarness({storage: seededStorage()});
  spawnWorker(h);

  // Asserted with NO await in between: this is the state of the world at the
  // instant top-level evaluation returned. If alarms.create moves behind an
  // `await`, into onInstalled, into start(), or into any function, the arming
  // happens at boot + N ms instead of boot + 0 ms - which was measured to lose
  // 26/26 and 6/6 teardowns - and this assertion fails.
  assert.equal(h.alarmsCreated.length, 1, 'alarms.create did not run at top level');
  assert.equal(h.log[0], 'alarms.create', 'alarms.create must be the first API call of the worker');
  // Compared field-by-field: the options object is created inside the vm realm,
  // so deepStrictEqual would fail on prototype identity alone.
  assert.equal(h.alarmsCreated[0][0], 'safari-ai-agent-keepalive');
  assert.equal(h.alarmsCreated[0][1].periodInMinutes, 0.5);
});

test('the keepalive period is 30s, the shortest the platform honours', () => {
  // periodInMinutes: 0.4 is clamped back up to 0.5 by WebKit, so anything below
  // 0.5 is a false sense of margin; anything above leaves the worker dead for
  // the difference (measured: 0.6 => dead for ~6 s every cycle).
  assert.match(SOURCE, /periodInMinutes: 0\.5/);
  // Statically: column 0 means module top level, not nested in a block.
  assert.match(SOURCE, /^api\.alarms\.create\(KEEPALIVE_ALARM, \{periodInMinutes: 0\.5\}\);$/m);
});

/* ------------------------------------------------------- the D-028 recovery */

test('starting a session persists it outside the worker', async () => {
  const h = await connected();
  const record = h.storage.get('session');
  assert.ok(record, 'no session record was persisted');
  assert.equal(record.origin, ORIGIN);
  assert.equal(record.tabId, 7);
  assert.match(record.instanceId, /^[A-Za-z0-9_-]{8,64}$/, 'instanceId must satisfy the gateway contract');
});

test('a worker teardown mid-session is resumed from storage with no user action', async () => {
  const first = await connected();
  const instanceId = first.storage.get('session').instanceId;

  // THE TEARDOWN. The entire realm is discarded; only storage survives. No
  // message is sent, no button is pressed, nothing calls start().
  const second = createHarness({storage: first.storage, tab: first.tab});
  spawnWorker(second);

  await waitFor(() => second.fetches.some(f => f.path === '/device/poll'), 'poll after respawn');
  const poll = second.fetches.find(f => f.path === '/device/poll');
  assert.equal(poll.body.origin, ORIGIN);
  assert.equal(poll.body.instanceId, instanceId,
    'the resumed worker must re-poll as the SAME device instance or the gateway treats it as a rival tab');
  assert.equal(second.badge.text, 'ON');
});

test('the keepalive alarm resumes a session the boot read could not see', async () => {
  // The pre-fix alarm handler guarded on in-memory `state.running`, which is
  // false in every respawned worker, so the alarm provably could not do the one
  // job it existed for. This drives the alarm as the SOLE route to recovery: the
  // boot-time storage read fails, so top-level recovery finds nothing, and only
  // an unconditional alarm handler can still rescue the session.
  const first = await connected();
  const storage = first.storage;
  let failNextRead = true;
  const second = createHarness({storage, tab: first.tab});
  const realGet = second.context.browser.storage.local.get;
  second.context.browser.storage.local.get = async keys => {
    if (failNextRead && keys.includes('session')) { failNextRead = false; throw new Error('storage unavailable'); }
    return realGet(keys);
  };

  spawnWorker(second);
  await settle();
  assert.equal(second.fetches.length, 0, 'precondition: the boot read failed, so nothing resumed');

  for (const fn of second.listeners.alarm) fn({name: 'safari-ai-agent-keepalive'});
  await waitFor(() => second.fetches.some(f => f.path === '/device/poll'), 'poll driven by the alarm');
});

/* ------------------------------------------------------------- honest state */

test('a boot with no persisted session clears a badge left reading ON', async () => {
  // Models the worst pre-fix symptom: the session died, but the badge - which is
  // browser UI state and outlives the worker - still said ON.
  const badge = {text: 'ON', color: '#254c7c'};
  const h = createHarness({storage: seededStorage(), badge});
  spawnWorker(h);
  await waitFor(() => h.badge.text === '', 'badge cleared on boot');
  const status = await send(h, {type: 'getStatus'});
  assert.equal(status.running, false);
});

test('getStatus resolves the persisted session before answering', async () => {
  const first = await connected();
  const second = createHarness({storage: first.storage, tab: first.tab});
  spawnWorker(second);
  // Asked immediately, before the pump has done anything: a status surface that
  // answered from empty worker memory here would report a live session as Idle.
  const status = await send(second, {type: 'getStatus'});
  assert.equal(status.running, true);
  assert.equal(status.origin, ORIGIN);
  assert.equal(status.tabId, 7);
});

test('stop clears the persisted session so the next boot does not resurrect it', async () => {
  const first = await connected();
  await send(first, {type: 'stop'});
  assert.equal(first.storage.has('session'), false, 'stop must remove the session record');
  assert.equal(first.badge.text, '');
  assert.ok(first.fetches.some(f => f.path === '/device/disconnect'), 'stop must revoke at the gateway');

  const second = createHarness({storage: first.storage, tab: first.tab});
  spawnWorker(second);
  await settle();
  assert.equal(second.fetches.length, 0, 'a stopped session must not be resumed by a later worker boot');
  assert.equal(second.badge.text, '');
});

/* -------------------------------------------------------- gateway contract */

test('every device call carries the instanceId and visibility the gateway demands', async () => {
  const h = await connected();
  const poll = h.fetches.find(f => f.path === '/device/poll');
  assert.equal(typeof poll.body.instanceId, 'string');
  assert.equal(poll.body.visibility, 'visible');
});

test('a tab that is not frontmost reports hidden rather than claiming to be visible', async () => {
  const h = await connected({tab: {id: 7, url: `${ORIGIN}/page`, active: false, windowId: 1}});
  const poll = h.fetches.find(f => f.path === '/device/poll');
  assert.equal(poll.body.visibility, 'hidden');
});

test('a result is reported with the instanceId the command was issued to', async () => {
  const command = {id: '11111111-2222-4333-8444-555555555555', action: 'browser_inspect', args: {}, origin: ORIGIN, expiresAt: Date.now() + 20000};
  let delivered = false;
  const h = await connected({
    gateway: (path) => {
      if (path === '/device/poll' && !delivered) { delivered = true; return {status: 200, body: {command}}; }
      if (path === '/device/result') return {status: 200, body: {accepted: true}};
      return {status: 200, body: {command: null}};
    }
  });
  await waitFor(() => h.fetches.some(f => f.path === '/device/result'), 'result posted');
  const result = h.fetches.find(f => f.path === '/device/result');
  const poll = h.fetches.find(f => f.path === '/device/poll');
  assert.equal(result.body.instanceId, poll.body.instanceId);
  assert.equal(result.body.id, command.id);
});

/* ------------------------------------------------- resume must not duplicate */

test('a command interrupted by a teardown is never replayed or re-reported', async () => {
  const command = {id: '99999999-2222-4333-8444-555555555555', action: 'browser_click', args: {ref: 'e1'}, origin: ORIGIN, expiresAt: Date.now() + 20000};
  let delivered = false;
  const first = createHarness({
    storage: seededStorage(),
    gateway: (path) => {
      if (path === '/device/poll' && !delivered) { delivered = true; return {status: 200, body: {command}}; }
      return {status: 200, body: {command: null}};
    },
    // The content script never answers: the worker is torn down mid-execution,
    // which is the window where a naive resume would re-run the click.
    exec: () => new Promise(() => {})
  });
  spawnWorker(first);
  await send(first, {type: 'start', tabId: 7, origin: ORIGIN});
  await waitFor(() => first.messages.some(m => m.type === 'exec'), 'command dispatched');

  // Nothing about the in-flight command may be in the record the next worker reads.
  const record = first.storage.get('session');
  assert.equal(JSON.stringify(record).includes(command.id), false,
    'the in-flight command id must not be persisted - persisting it invites a replay');

  const second = createHarness({storage: first.storage, tab: first.tab});
  spawnWorker(second);
  await waitFor(() => second.fetches.some(f => f.path === '/device/poll'), 'resumed poll');
  await settle();
  assert.equal(second.messages.some(m => m.type === 'exec'), false,
    'the resumed worker must not re-execute the interrupted command');
  assert.equal(second.fetches.some(f => f.path === '/device/result'), false,
    'the resumed worker must not report a result it did not produce');
});

/* ----------------------------------- events that could not fire while dead */

test('a tab closed while the worker was dead ends the session on resume', async () => {
  const first = await connected();
  const second = createHarness({storage: first.storage, tab: null});   // tab gone
  spawnWorker(second);
  await waitFor(() => !second.storage.has('session'), 'session cleared after the tab vanished');
  assert.ok(second.fetches.some(f => f.path === '/device/disconnect'));
  assert.equal(second.badge.text, '');
});

test('a tab navigated off-origin while the worker was dead ends the session on resume', async () => {
  const first = await connected();
  const second = createHarness({
    storage: first.storage,
    tab: {id: 7, url: 'https://elsewhere.example/page', active: true, windowId: 1}
  });
  spawnWorker(second);
  await waitFor(() => !second.storage.has('session'), 'session cleared after the tab left the origin');
  assert.equal(second.fetches.some(f => f.path === '/device/poll'), false,
    'the resumed worker must not poll for a tab that is now on another site');
});

test('clearing the gateway config also ends the session it authenticated', async () => {
  const h = await connected();
  await send(h, {type: 'clearConfig'});
  assert.equal(h.storage.has('session'), false);
  assert.equal(h.storage.has('deviceToken'), false);
  assert.equal(h.badge.text, '');
});
