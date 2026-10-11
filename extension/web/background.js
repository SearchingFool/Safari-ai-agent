/*
 * File: extension/web/background.js
 * Description: MV3 background service worker for the Safari AI Agent extension.
 *   This is the extension-side replacement for the polling half of src/remote.js.
 *   It owns the gateway credential, the /device/poll -> execute -> /device/result
 *   loop, and the tab-bound session. It NEVER hands the device token to a content
 *   script or to a web page.
 * Author: safari-ai-agent-native-extension (Claude Code, Opus 5)
 * Created: 2026-10-11
 * Last Updated: 2026-10-11
 * Last Updated By: safari-ai-agent-sw-recovery (D-028)
 *
 * WHY THIS LIVES IN THE BACKGROUND (and not in the page, as the userscript does):
 *   - The userscript's loop dies on every navigation, so src/remote.js has to set
 *     running=false before location.assign and the operator must reconnect by hand.
 *     Here the loop outlives the page, so a navigation does not end the session.
 *   - The credential never enters a page's JavaScript realm at all. In the
 *     userscript it lives in GM storage but the fetch is still initiated from a
 *     script that shares a global with the site.
 *   - The session is keyed on a TAB ID as well as an origin. docs/DECISIONS.md
 *     D-023 records that an origin-only session can be hijacked by a second
 *     window on the same site. A tabId is not spoofable from page content.
 *
 * THE EXECUTION MODEL THIS FILE IS BUILT FOR (D-024-rationale / D-028):
 *   Measured on WebKit 26.x (docs/SERVICE-WORKER-LIFETIME.md, 1199 raw records):
 *   this worker gets a HARD 30.0 s wall-clock budget from its own start, and
 *   being busy does not extend it by one millisecond. A 1.2 s fetch loop runs
 *   24 ticks and is killed on schedule. The platform therefore offers RESUMABLE
 *   EXECUTION IN 30-SECOND INSTALMENTS, not a long-running worker.
 *
 *   Everything below follows from that one fact:
 *     1. Worker memory is assumed LOST at any moment. The session of record is
 *        the `session` key in storage.local; `state` is only a cache of it.
 *     2. Every entry point is re-establishable from TOP-LEVEL EVALUATION, which
 *        is the one thing guaranteed to run on every respawn. boot() is called
 *        at the bottom of this file and is idempotent.
 *     3. The instanceId is persisted, so a respawned worker re-polls as the SAME
 *        device session and the gateway does not see it as a rival tab (409).
 *     4. Nothing about an in-flight command is persisted, deliberately. See the
 *        "RESUME SAFETY" note on handleCommand().
 */
'use strict';

const api = globalThis.browser ?? globalThis.chrome;

/* =====================================================================
 * KEEPALIVE — THIS CALL MUST STAY AT TOP-LEVEL EVALUATION. DO NOT MOVE IT.
 * =====================================================================
 * Measured (docs/SERVICE-WORKER-LIFETIME.md §4.3): WebKit schedules teardown at
 * 30.0 s from worker start, and alarms.create() on an existing name RESETS that
 * alarm's schedule. Armed during top-level evaluation (t = 0 ms) the alarm fires
 * at 30.000 s and wins on run-loop ordering: 0/24 and 0/14 teardowns. Re-armed
 * from inside the worker at boot + 2 ms it fires at 30.002 s, two milliseconds
 * after the worker is already gone: 26/26 and 6/6 teardowns, never survived once.
 * periodInMinutes: 0.4 is clamped back up to 30 s, so no margin can be bought.
 *
 * Moving this behind an `await`, into onInstalled, into start(), or into any
 * function silently converts a persistent session into one that dies every 30
 * seconds, with no error anywhere. extension/background.test.mjs pins it, and
 * `node extension/build.mjs` refuses to stage the bundle if it moves.
 */
const KEEPALIVE_ALARM = 'safari-ai-agent-keepalive';
api.alarms.create(KEEPALIVE_ALARM, {periodInMinutes: 0.5});

const K_URL = 'gatewayUrl';
const K_TOKEN = 'deviceToken';
const K_SESSION = 'session';
const POLL_INTERVAL_MS = 1200;
const REQUEST_TIMEOUT_MS = 8000;
// How often the live session record is re-stamped. The popup uses the age of
// this stamp to tell "connected and polling" apart from "the worker was torn
// down and has not completed a poll since".
const HEARTBEAT_MS = 2000;

/**
 * In-memory CACHE of the persisted session. Not the source of truth: this whole
 * object is destroyed every time the worker is torn down, which is at most 30 s
 * after it started. `epoch` increments on every start/stop so that a write that
 * was in flight across a session change cannot resurrect a stopped session.
 */
const state = {
  running: false,
  pumping: false,
  resolved: false,   // has this worker instance read storage yet?
  epoch: 0,
  tabId: null,
  origin: null,
  instanceId: null,
  paused: false,
  lastCommand: '',
  lastError: '',
  lastBeatAt: 0,
  statusText: 'Idle'
};

/** Thrown when the session cannot continue at all - the tab is gone or moved. */
class SessionEnded extends Error {}

/* ------------------------------------------------------------------ config */

async function readConfig() {
  const got = await api.storage.local.get([K_URL, K_TOKEN]);
  const url = String(got[K_URL] || '').replace(/\/$/, '');
  const token = String(got[K_TOKEN] || '');
  return {url, token};
}

/* --------------------------------------------------- persisted session state */

/*
 * THE SESSION OF RECORD. A record exists if and only if a session is live.
 * "Stopped" is represented by the absence of the key, never by a flag inside it,
 * so there is no half-state a respawned worker could misread.
 */
/*
 * Throws rather than returning null if storage itself fails. "Storage is
 * unavailable" and "there is no session" must not look the same: treating a
 * failed read as "no session" would silently abandon a live session, and
 * because resume() only reads storage once per worker instance it would stay
 * abandoned until the operator noticed. On a throw, resume() leaves the worker
 * unresolved so the next keepalive alarm retries.
 */
async function readSession() {
  const got = await api.storage.local.get([K_SESSION]);
  const record = got?.[K_SESSION];
  if (!record || typeof record !== 'object') return null;
  if (typeof record.origin !== 'string' || typeof record.instanceId !== 'string') return null;
  if (!Number.isInteger(record.tabId)) return null;
  return record;
}

async function writeSession(record) {
  await api.storage.local.set({[K_SESSION]: record});
}

async function clearSession() {
  try { await api.storage.local.remove([K_SESSION]); }
  catch { /* A failed clear is reported through the status surface by the caller. */ }
}

/**
 * Re-stamp the live record so the popup can detect a stalled worker. Throttled,
 * and guarded by the epoch so a beat that was in flight when the operator
 * pressed Stop cannot write the session back into storage.
 */
async function beat(force = false) {
  if (!state.running) return;
  const now = Date.now();
  if (!force && now - state.lastBeatAt < HEARTBEAT_MS) return;
  const epoch = state.epoch;
  const record = {
    tabId: state.tabId,
    origin: state.origin,
    instanceId: state.instanceId,
    lastCommand: state.lastCommand,
    lastBeatAt: now
  };
  if (state.epoch !== epoch || !state.running) return;
  state.lastBeatAt = now;
  try { await writeSession(record); } catch { /* Heartbeat is advisory. */ }
}

/* ----------------------------------------------------------------- gateway */

/**
 * Same wire contract as src/remote.js: POST JSON with a bearer device token.
 * The userscript needed GM.xmlHttpRequest to escape page CORS. A service worker
 * with a granted host permission does not - plain fetch is the privileged path.
 */
async function request(path, payload) {
  const {url, token} = await readConfig();
  if (!url.startsWith('https://')) throw new Error('An HTTPS gateway is required.');
  if (token.length < 24) throw new Error('A device token of 24+ characters is required.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url + path, {
      method: 'POST',
      headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store'
    });
  } catch (error) {
    throw new Error(error?.name === 'AbortError' ? 'Gateway request timed out' : `Gateway unreachable: ${error?.message || error}`);
  } finally {
    clearTimeout(timer);
  }
  if (response.status !== 200) throw new Error(`Gateway HTTP ${response.status}`);
  try { return await response.json(); }
  catch { throw new Error('Gateway returned invalid JSON'); }
}

/*
 * Identity sent on EVERY device call, matching src/remote.js identity().
 * gateway/server.mjs rejects any /device/* call without a well-formed
 * instanceId with HTTP 400, and refuses to hand a command to a tab whose
 * reported visibility is not 'visible'. Both fields are part of the contract,
 * not decoration.
 */
function identity(visibility) {
  return {origin: state.origin, instanceId: state.instanceId, visibility};
}

function newInstanceId() {
  // Must satisfy the gateway's /^[A-Za-z0-9_-]{8,64}$/. A UUID does.
  if (typeof crypto === 'object' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `t${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/* -------------------------------------------------------- content-script IO */

/**
 * The content script is injected on demand rather than declared in the manifest
 * with a broad match pattern. That is the point of the permission model: the
 * userscript had to be @match'ed against every site it might ever drive, so it
 * ran everywhere. Here nothing is injected until the operator connects a tab.
 */
async function ensureInjected(tabId) {
  try {
    const pong = await api.tabs.sendMessage(tabId, {type: 'ping'});
    if (pong?.ok) return true;
  } catch { /* No receiver yet. Fall through and inject. */ }
  await api.scripting.executeScript({
    target: {tabId, allFrames: false},
    // core.js first: it publishes globalThis.SafariAIAgentCore, which content.js
    // consumes. The engine is COPIED from src/core.js by extension/build.mjs and
    // is never edited here, so there is exactly one DOM engine in the project.
    files: ['vendor/core.js', 'content/content.js']
  });
  return true;
}

async function callContent(tabId, message) {
  await ensureInjected(tabId);
  return api.tabs.sendMessage(tabId, message);
}

/* ------------------------------------------------------------------- status */

function setStatus(text, isError = false) {
  state.statusText = text;
  if (isError) state.lastError = text;
  // The toolbar badge is a surface the userscript simply does not have: it is
  // visible without opening anything and cannot be drawn over by the page.
  //
  // D-028: the badge is browser UI state and OUTLIVES the worker, so a badge set
  // to ON before a teardown stays ON afterwards whatever happens. The only
  // defence is that every worker boot re-derives it from the persisted record
  // (see resume()), which it does within one storage read of top-level
  // evaluation. A badge that is ON while nothing is running is therefore bounded
  // by "the worker never came back at all" - which no in-worker code can signal.
  try {
    api.action.setBadgeText({text: state.running ? 'ON' : ''});
    api.action.setBadgeBackgroundColor({
      color: !state.running ? '#777777' : (state.paused ? '#8a6d1f' : '#254c7c')
    });
  } catch { /* Badge APIs are cosmetic; never let them break the loop. */ }
  // Best-effort push to an open popup. No listener is the normal case, and the
  // call shape differs between the `browser` and `chrome` namespaces, so this
  // must never be allowed to throw into the poll loop.
  try {
    const sent = api.runtime.sendMessage({type: 'status', status: snapshotStatus()}, () => void api.runtime.lastError);
    if (sent && typeof sent.catch === 'function') sent.catch(() => {});
  } catch { /* No popup open. Expected. */ }
}

function snapshotStatus() {
  return {
    running: state.running,
    paused: state.paused,
    tabId: state.tabId,
    origin: state.origin,
    lastCommand: state.lastCommand,
    statusText: state.statusText,
    lastError: state.lastError,
    // Age of the last completed poll. Large while a respawned worker is still
    // catching up; the popup can say "resuming" instead of a confident "ON".
    beatAgeMs: state.running && state.lastBeatAt ? Date.now() - state.lastBeatAt : null
  };
}

/* ----------------------------------------------------------- tab validation */

/**
 * Re-derive, from the browser rather than from memory, whether the bound tab is
 * still a legal place to act. This runs on EVERY poll because the worker may
 * have been dead for the last 30 seconds, during which tabs.onRemoved and
 * tabs.onUpdated could not fire: the tab may have been closed or navigated to
 * another site with nothing to observe it.
 */
async function checkTab() {
  let tab;
  try { tab = await api.tabs.get(state.tabId); }
  catch { throw new SessionEnded('Session ended: the connected tab was closed.'); }
  if (!tab) throw new SessionEnded('Session ended: the connected tab was closed.');

  let origin = null;
  try { origin = new URL(tab.url || '').origin; } catch { origin = null; }
  if (origin && origin !== state.origin) {
    throw new SessionEnded(`Session ended: the tab left ${state.origin}.`);
  }
  // An unreadable URL (about:blank, a page mid-load, a missing permission) is
  // not proof of anything. Pause rather than acting on an unverified page.
  if (!origin) return {visibility: 'hidden', reason: 'the tab URL could not be confirmed'};

  /*
   * `tab.active` is this worker's stand-in for the `document.visibilityState`
   * that src/remote.js reports, and the gateway's safety gate is written against
   * those semantics: a command must not be delivered to a tab whose approval
   * sheet the operator cannot see.
   *
   * It is deliberately NOT narrowed further with windows.focused. The operator
   * drives this from another application - that is the entire point - so an
   * unfocused Safari window is the NORMAL case, and `document.visibilityState`
   * stays 'visible' through it too. The honest gap: a minimised or fully
   * occluded window still reports active, where visibilityState would not.
   */
  if (tab.active !== true) return {visibility: 'hidden', reason: 'the tab is not the active tab in its window'};
  return {visibility: 'visible', reason: ''};
}

/* --------------------------------------------------------------- poll pump */

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function pump() {
  if (state.pumping) return;
  state.pumping = true;
  try {
    while (state.running) {
      try {
        const probe = await checkTab();
        if (!state.running) break;
        const polled = await request('/device/poll', identity(probe.visibility));
        // A stop issued while this request was in flight must prevent execution.
        // Same invariant as src/remote.js; it matters more here because the
        // worker survives navigation and could otherwise act on a new page.
        if (!state.running) break;
        state.paused = probe.visibility !== 'visible';
        await beat();
        if (polled.command) {
          await handleCommand(polled.command);
          if (!state.running) break;
        }
        setStatus(state.paused
          ? `Paused - ${probe.reason}. Nothing will run until you return to the tab.`
          : `Connected - ${state.lastCommand || 'ready'}`);
      } catch (error) {
        if (error instanceof SessionEnded) { await stop(error.message); break; }
        setStatus(`Connection/action error: ${String(error?.message || error)}`, true);
      }
      if (state.running) await sleep(POLL_INTERVAL_MS);
    }
  } finally {
    state.pumping = false;
  }
}

/*
 * RESUME SAFETY - why nothing about an in-flight command is persisted.
 *
 * Verified against gateway/server.mjs (unchanged by this work):
 *   - /device/poll marks the command `claimed = true` before returning it, and
 *     only ever hands out commands with `!p.claimed`. A command interrupted by a
 *     worker teardown is therefore NEVER re-delivered to the resumed worker; it
 *     sits claimed until expiresAt and the caller gets the honest "action
 *     outcome may be uncertain. Inspect again." timeout.
 *   - /device/result rejects an id it does not hold with HTTP 409 "Unknown,
 *     expired or duplicate command", and rejects a result whose instanceId is
 *     not the one the command was issued to with HTTP 403 "Instance mismatch".
 *
 * So the only way this worker could double-execute or double-report is if IT
 * replayed a command from its own storage. It must not, and it does not: a
 * resumed worker starts from a clean poll and has no memory of the command.
 */
async function handleCommand(command) {
  state.lastCommand = command.action;
  await beat(true);
  let outcome;
  try {
    if (command.origin !== state.origin) throw new Error('Wrong session origin');
    outcome = await callContent(state.tabId, {type: 'exec', command, sessionOrigin: state.origin});
    if (!outcome || typeof outcome !== 'object') throw new Error('Content script returned nothing');
  } catch (error) {
    outcome = {success: false, error: String(error?.message || error)};
  }
  // Dispatch acknowledgement only. A click or navigation is reported as
  // verified:false exactly as in src/remote.js - the caller must inspect again.
  const {navigateTo, ...reportable} = outcome;
  const ack = await request('/device/result', {
    id: command.id, origin: state.origin, instanceId: state.instanceId, result: reportable
  });
  if (!ack.accepted) throw new Error('Gateway rejected result');
  if (!state.running) return;

  if (navigateTo) {
    // The userscript could not do this without killing its own loop. Here the
    // session is tab-bound, so it survives the page swap and keeps polling.
    await api.tabs.update(state.tabId, {url: navigateTo});
  }
}

/* --------------------------------------------------------- session control */

async function start({tabId, origin}) {
  await boot();
  if (state.running) throw new Error('Already connected. Stop first.');
  if (!Number.isInteger(tabId) || typeof origin !== 'string' || !origin) {
    throw new Error('A tab and an origin are required.');
  }
  const {url, token} = await readConfig();
  if (!url.startsWith('https://') || token.length < 24) {
    throw new Error('Configure an HTTPS gateway and a 24+ character device token first.');
  }
  const granted = await api.permissions.contains({origins: [`${origin}/*`, `${new URL(url).origin}/*`]});
  if (!granted) throw new Error('Site and gateway permissions have not been granted yet.');

  state.epoch++;
  state.running = true;
  state.resolved = true;
  state.paused = false;
  state.tabId = tabId;
  state.origin = origin;
  state.instanceId = newInstanceId();
  state.lastCommand = '';
  state.lastError = '';
  state.lastBeatAt = 0;
  // Persist BEFORE the first poll. A teardown five milliseconds from now must
  // still leave a record the next worker can resume from.
  await beat(true);
  setStatus('Connecting...');
  void pump();
  return snapshotStatus();
}

async function stop(reason = '') {
  await boot();
  const wasRunning = state.running;
  const {origin, instanceId, tabId} = state;

  // Order matters, and mirrors src/remote.js stop(): the persisted stop is
  // written FIRST, so that a worker teardown part-way through this function
  // cannot be resumed by the next boot into a session the operator ended.
  state.epoch++;
  state.running = false;
  state.paused = false;
  state.tabId = null;
  state.origin = null;
  state.instanceId = null;
  state.lastBeatAt = 0;
  await clearSession();
  setStatus(reason || 'Stopping and revoking queued commands...', Boolean(reason));

  // Local stop always wins; the remote revoke is best-effort, as in src/remote.js.
  try {
    if (wasRunning && origin && instanceId) {
      await request('/device/disconnect', {origin, instanceId});
      setStatus(reason ? `${reason} Queued commands revoked.` : 'Disconnected; queued commands revoked.', Boolean(reason));
    } else if (!reason) {
      setStatus('Stopped.');
    }
  } catch {
    setStatus(`${reason || 'Stopped locally.'} Remote revoke unavailable; pending calls will time out.`, Boolean(reason));
  }
  try { if (tabId !== null) await api.tabs.sendMessage(tabId, {type: 'teardown'}); }
  catch { /* Tab may be gone. */ }
  return snapshotStatus();
}

/* ------------------------------------------------- boot / session recovery */

/**
 * restoreSession, finally implemented. The comment in the pre-D-028 version of
 * this file promised it and the function did not exist, so the keepalive alarm
 * fired into a worker whose module-level `state.running` was false and did
 * nothing at all - the session died silently 30 s after it was started.
 *
 * Contract: idempotent, safe to call from top level, from the alarm, from a
 * popup message and from a tab event. Reads storage at most once per worker
 * instance; after that the in-memory cache is authoritative, because nothing
 * outside this worker ever writes the session record.
 */
let bootPromise = null;

function boot() {
  if (!bootPromise) {
    bootPromise = resume()
      .catch(error => { setStatus(`Could not restore session: ${String(error?.message || error)}`, true); })
      .finally(() => { bootPromise = null; });
  }
  return bootPromise;
}

async function resume() {
  if (state.resolved) {
    // Already know the answer in this worker instance. The alarm's real job is
    // this line: restart a pump that stopped when its realm was destroyed.
    if (state.running && !state.pumping) void pump();
    return;
  }
  // If this throws, `resolved` stays false on purpose: the worker does not know
  // whether a session exists, so the next keepalive alarm must ask again rather
  // than assume there is nothing to resume.
  const record = await readSession();
  state.resolved = true;
  if (!record) {
    // Also the path that clears a badge left reading ON by a dead worker.
    state.running = false;
    state.paused = false;
    setStatus('Idle');
    return;
  }
  state.epoch++;
  state.running = true;
  state.paused = false;
  state.tabId = record.tabId;
  state.origin = record.origin;
  state.instanceId = record.instanceId;
  state.lastCommand = String(record.lastCommand || '');
  state.lastBeatAt = Number(record.lastBeatAt) || 0;
  setStatus(`Resuming after worker restart - ${state.lastCommand || 'ready'}`);
  void pump();
}

/* ---------------------------------------------------------------- lifecycle */

// If the tab the session is bound to disappears, the session must end. An
// origin-only session (the userscript model) has no way to notice this. This
// listener can only fire while the worker happens to be alive, which is why
// checkTab() re-verifies the same facts on every poll.
api.tabs.onRemoved.addListener(tabId => {
  void (async () => {
    await boot();
    if (state.running && tabId === state.tabId) await stop('Session ended: the connected tab was closed.');
  })();
});

// A navigation away from the session origin ends the session rather than
// silently following the user to a new site.
api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo?.url) return;
  void (async () => {
    await boot();
    if (!state.running || tabId !== state.tabId) return;
    let origin = null;
    try { origin = new URL(changeInfo.url).origin; } catch { /* about:blank etc. */ }
    if (origin !== state.origin) await stop(`Session ended: the tab left ${state.origin}.`);
  })();
});

/*
 * The alarm's main job is to cause the respawn; top-level evaluation does the
 * restoring. It deliberately does NOT guard on in-memory state - that guard was
 * the D-028 defect, because the teardown the alarm exists to recover from is the
 * same teardown that cleared the state it was reading.
 *
 * Its secondary job is to be the retry for a boot that could not read storage,
 * and to restart a pump that stopped inside a worker that is still alive.
 */
api.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === KEEPALIVE_ALARM) void boot();
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'getStatus':
        // Must resolve the persisted session first: a worker that booted two
        // milliseconds ago to serve this very message would otherwise answer a
        // confident "Idle" about a session that is live.
        await boot();
        return snapshotStatus();
      case 'start':
        return start({tabId: message.tabId, origin: message.origin});
      case 'stop':
        return stop();
      case 'saveConfig': {
        const url = String(message.url || '').trim().replace(/\/$/, '');
        const token = String(message.token || '').trim();
        if (new URL(url).protocol !== 'https:') throw new Error('Gateway URL must be https.');
        if (token.length < 24) throw new Error('Device token must be at least 24 characters.');
        await api.storage.local.set({[K_URL]: url, [K_TOKEN]: token});
        return {saved: true, url};
      }
      case 'getConfig': {
        const {url, token} = await readConfig();
        // The token value is never returned, not even to our own popup.
        return {url, hasToken: token.length >= 24};
      }
      case 'clearConfig':
        // Forgetting the credential must also end the session it authenticates.
        await boot();
        if (state.running) await stop('Session ended: the gateway configuration was cleared.');
        await api.storage.local.remove([K_URL, K_TOKEN]);
        return {cleared: true};
      /*
       * SCAFFOLDED, NOT WIRED: the extension can capture the visible tab, which
       * the userscript cannot do at all. There is no browser_screenshot tool in
       * gateway/server.mjs, so nothing can request it yet. Adding the tool is a
       * gateway change and is outside this scaffold's write scope.
       */
      case 'captureTab': {
        await boot();
        if (!state.running) throw new Error('No active session.');
        const tab = await api.tabs.get(state.tabId);
        return {dataUrl: await api.tabs.captureVisibleTab(tab.windowId, {format: 'png'})};
      }
      default:
        throw new Error(`Unknown message type: ${message?.type}`);
    }
  })().then(
    result => sendResponse({ok: true, result}),
    error => sendResponse({ok: false, error: String(error?.message || error)})
  );
  return true; // Keep the message channel open for the async reply.
});

// The one line that makes a 30-second worker into a resumable session. Top level
// is the only code guaranteed to run on every respawn, so recovery starts here
// and not in any event handler.
void boot();
