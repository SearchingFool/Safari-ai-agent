/*
 * File: extension/web/popup/popup.js
 * Description: Popup controller. Collects gateway config, requests the scoped
 *   host permissions, and starts/stops a tab-bound session. The device token is
 *   written to extension storage and never read back out - not even here.
 * Author: safari-ai-agent-native-extension (Claude Code, Opus 5)
 * Created: 2026-10-11
 */
'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const $ = id => document.getElementById(id);

let currentTab = null;
let currentOrigin = null;

/*
 * Safari exposes both `browser` (promise-based) and `chrome` (historically
 * callback-based) and the two are not interchangeable for sendMessage. Handle
 * whichever shape we actually got rather than betting on one.
 */
function send(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const handle = reply => {
      if (settled) return;
      settled = true;
      const failure = api.runtime.lastError;
      if (failure) return reject(new Error(failure.message));
      if (!reply) return reject(new Error('No reply from the background worker.'));
      if (!reply.ok) return reject(new Error(reply.error));
      resolve(reply.result);
    };
    const maybePromise = api.runtime.sendMessage(message, handle);
    if (maybePromise && typeof maybePromise.then === 'function') maybePromise.then(handle, reject);
  });
}

function show(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${kind}`;
}

function renderStatus(status) {
  if (!status) return;
  const live = status.running;
  // Never re-enable Connect for a tab that cannot be automated at all.
  $('connect').disabled = live || !currentOrigin;
  $('stop').disabled = !live;
  show(
    live ? `${status.statusText} (tab ${status.tabId}, ${status.origin})` : status.statusText,
    live ? 'live' : (status.lastError && !live ? 'error' : '')
  );
}

async function loadTab() {
  const [tab] = await api.tabs.query({active: true, currentWindow: true});
  currentTab = tab || null;
  currentOrigin = null;
  // Only http(s) pages can be automated. about:, file:, and Safari's own pages
  // must not even offer a Connect button.
  try {
    const parsed = new URL(currentTab?.url || '');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') currentOrigin = parsed.origin;
  } catch { /* No URL, or not a URL. currentOrigin stays null. */ }
  $('tabinfo').textContent = currentOrigin || 'This tab cannot be automated (not an http/https page).';
  $('connect').disabled = !currentOrigin;
}

$('save').addEventListener('click', async () => {
  try {
    const result = await send({type: 'saveConfig', url: $('gateway').value, token: $('secret').value});
    $('secret').value = '';
    show(`Saved. Gateway: ${result.url}`);
  } catch (error) { show(String(error.message || error), 'error'); }
});

$('clear').addEventListener('click', async () => {
  try { await send({type: 'clearConfig'}); $('gateway').value = ''; $('secret').value = ''; show('Gateway config forgotten.'); }
  catch (error) { show(String(error.message || error), 'error'); }
});

$('connect').addEventListener('click', async () => {
  try {
    if (!currentOrigin) throw new Error('No automatable tab.');
    const config = await send({type: 'getConfig'});
    if (!config.url || !config.hasToken) throw new Error('Save an HTTPS gateway URL and device token first.');
    /*
     * This is the permission model the userscript cannot have. Userscripts grant
     * themselves every site in their @match block at install time and there is
     * no per-site revoke. Here the grant is requested from a user gesture, is
     * scoped to this one origin plus the gateway, and the operator can withdraw
     * it later in Safari Settings > Extensions without touching this code.
     */
    const granted = await api.permissions.request({
      origins: [`${currentOrigin}/*`, `${new URL(config.url).origin}/*`]
    });
    if (!granted) throw new Error('Permission for this site was not granted.');
    renderStatus(await send({type: 'start', tabId: currentTab.id, origin: currentOrigin}));
  } catch (error) { show(String(error.message || error), 'error'); }
});

$('stop').addEventListener('click', async () => {
  try { renderStatus(await send({type: 'stop'})); }
  catch (error) { show(String(error.message || error), 'error'); }
});

api.runtime.onMessage.addListener(message => {
  if (message?.type === 'status') renderStatus(message.status);
});

(async () => {
  try {
    await loadTab();
    const config = await send({type: 'getConfig'});
    $('gateway').value = config.url || '';
    $('secret').placeholder = config.hasToken ? 'Saved - type to replace' : '';
    renderStatus(await send({type: 'getStatus'}));
  } catch (error) { show(String(error.message || error), 'error'); }
})();
