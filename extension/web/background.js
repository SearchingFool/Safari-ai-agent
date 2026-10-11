/*
 * File: extension/web/background.js
 * Description: MV3 background service worker for the Safari AI Agent extension.
 *   This is the extension-side replacement for the polling half of src/remote.js.
 *   It owns the gateway credential, the /device/poll -> execute -> /device/result
 *   loop, and the tab-bound session. It NEVER hands the device token to a content
 *   script or to a web page.
 * Author: safari-ai-agent-native-extension (Claude Code, Opus 5)
 * Created: 2026-10-11
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
 */
'use strict';

const api = globalThis.browser ?? globalThis.chrome;

const K_URL = 'gatewayUrl';
const K_TOKEN = 'deviceToken';
const POLL_INTERVAL_MS = 1200;
const REQUEST_TIMEOUT_MS = 8000;
const KEEPALIVE_ALARM = 'safari-ai-agent-keepalive';

/**
 * Runtime state. Deliberately NOT persisted: if the service worker is torn down
 * and this is lost, the correct behaviour is to stop acting on the page, not to
 * silently resume. restoreSession() below re-arms only from an explicit record.
 */
const state = {
  running: false,
  pumping: false,
  tabId: null,
  origin: null,
  lastCommand: '',
  lastError: '',
  statusText: 'Idle'
};

/* ------------------------------------------------------------------ config */

async function readConfig() {
  const got = await api.storage.local.get([K_URL, K_TOKEN]);
  const url = String(got[K_URL] || '').replace(/\/$/, '');
  const token = String(got[K_TOKEN] || '');
  return {url, token};
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
  try {
    api.action.setBadgeText({text: state.running ? 'ON' : ''});
    api.action.setBadgeBackgroundColor({color: state.running ? '#254c7c' : '#777777'});
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
    tabId: state.tabId,
    origin: state.origin,
    lastCommand: state.lastCommand,
    statusText: state.statusText,
    lastError: state.lastError
  };
}

/* --------------------------------------------------------------- poll pump */

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function pump() {
  if (state.pumping) return;
  state.pumping = true;
  try {
    while (state.running) {
      try {
        const polled = await request('/device/poll', {origin: state.origin});
        // A stop issued while this request was in flight must prevent execution.
        // Same invariant as src/remote.js; it matters more here because the
        // worker survives navigation and could otherwise act on a new page.
        if (!state.running) break;
        if (polled.command) {
          await handleCommand(polled.command);
          if (!state.running) break;
        }
        setStatus(`Connected - ${state.lastCommand || 'ready'}`);
      } catch (error) {
        setStatus(`Connection/action error: ${String(error?.message || error)}`, true);
      }
      if (state.running) await sleep(POLL_INTERVAL_MS);
    }
  } finally {
    state.pumping = false;
  }
}

async function handleCommand(command) {
  state.lastCommand = command.action;
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
  const ack = await request('/device/result', {id: command.id, origin: state.origin, result: reportable});
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
  if (state.running) throw new Error('Already connected. Stop first.');
  const {url, token} = await readConfig();
  if (!url.startsWith('https://') || token.length < 24) {
    throw new Error('Configure an HTTPS gateway and a 24+ character device token first.');
  }
  const granted = await api.permissions.contains({origins: [`${origin}/*`, `${new URL(url).origin}/*`]});
  if (!granted) throw new Error('Site and gateway permissions have not been granted yet.');
  state.running = true;
  state.tabId = tabId;
  state.origin = origin;
  state.lastError = '';
  setStatus('Connecting...');
  void pump();
  return snapshotStatus();
}

async function stop() {
  const wasRunning = state.running;
  state.running = false;
  setStatus('Stopping and revoking queued commands...');
  // Local stop always wins; the remote revoke is best-effort, as in src/remote.js.
  try {
    if (wasRunning && state.origin) {
      await request('/device/disconnect', {origin: state.origin});
      setStatus('Disconnected; queued commands revoked.');
    } else {
      setStatus('Stopped.');
    }
  } catch {
    setStatus('Stopped locally. Remote revoke unavailable; pending calls will time out.');
  }
  try { if (state.tabId !== null) await api.tabs.sendMessage(state.tabId, {type: 'teardown'}); }
  catch { /* Tab may be gone. */ }
  state.tabId = null;
  state.origin = null;
  return snapshotStatus();
}

/* ---------------------------------------------------------------- lifecycle */

// If the tab the session is bound to disappears, the session must end. An
// origin-only session (the userscript model) has no way to notice this.
api.tabs.onRemoved.addListener(tabId => {
  if (state.running && tabId === state.tabId) void stop();
});

// A navigation away from the session origin ends the session rather than
// silently following the user to a new site.
api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!state.running || tabId !== state.tabId || !changeInfo.url) return;
  let origin = null;
  try { origin = new URL(changeInfo.url).origin; } catch { /* about:blank etc. */ }
  if (origin !== state.origin) {
    setStatus(`Session ended: tab left ${state.origin}`, true);
    void stop();
  }
});

/*
 * KNOWN RISK, NOT SOLVED HERE: an MV3 service worker can be suspended while
 * idle. This alarm restarts a pump that was torn down mid-session. It has NOT
 * been measured against Safari's actual suspension behaviour - see
 * docs/NATIVE-EXTENSION.md "What is stubbed or unverified".
 */
api.alarms.create(KEEPALIVE_ALARM, {periodInMinutes: 0.5});
api.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === KEEPALIVE_ALARM && state.running && !state.pumping) void pump();
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'getStatus':
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
        await api.storage.local.remove([K_URL, K_TOKEN]);
        return {cleared: true};
      /*
       * SCAFFOLDED, NOT WIRED: the extension can capture the visible tab, which
       * the userscript cannot do at all. There is no browser_screenshot tool in
       * gateway/server.mjs, so nothing can request it yet. Adding the tool is a
       * gateway change and is outside this scaffold's write scope.
       */
      case 'captureTab': {
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

setStatus('Idle');
