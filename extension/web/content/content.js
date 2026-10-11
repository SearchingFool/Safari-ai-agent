/*
 * File: extension/web/content/content.js
 * Description: Content script for the Safari AI Agent extension. This is the
 *   extension-side replacement for the EXECUTION half of src/remote.js. It holds
 *   no credential, does no networking, and talks only to the background worker.
 *   The DOM work itself is delegated entirely to SafariAIAgentCore, which is a
 *   byte-for-byte copy of src/core.js placed here by extension/build.mjs.
 * Author: safari-ai-agent-native-extension (Claude Code, Opus 5)
 * Created: 2026-10-11
 *
 * The action allowlist and every safety check below are a deliberate port of
 * src/remote.js execute(). If the two ever diverge, src/remote.js is canonical.
 */
(function () {
  'use strict';

  const api = globalThis.browser ?? globalThis.chrome;
  if (window.self !== window.top) return;
  // Re-injection is normal (the background injects after each navigation).
  if (globalThis.__safariAiAgentContentLoaded) return;
  globalThis.__safariAiAgentContentLoaded = true;

  if (!globalThis.SafariAIAgentCore) {
    console.error('[safari-ai-agent] vendor/core.js did not load; run `node extension/build.mjs`.');
    return;
  }
  const core = globalThis.SafariAIAgentCore.createAgentCore(document, window);
  let lastSnapshot = null;

  /* ------------------------------------------------------- approval surface */

  /*
   * WHY NOT window.confirm: the userscript has no choice but to use it. It is a
   * single line of unstyled text, it cannot show structure, and on iPadOS it is
   * easy to dismiss by reflex. This sheet is rendered in a CLOSED shadow root so
   * page scripts cannot read or re-style it, and it is marked with
   * data-safari-ai-agent-host so core.js's isVisible() filter excludes it from
   * inspect() - the agent cannot see or click its own approval UI.
   *
   * It is still injected into the page's layout, which is the honest limitation:
   * a browser extension cannot draw a true OS-level modal over a web page.
   */
  let sheetHost = null;

  // Built fresh per approval and removed on answer. Toggling visibility on a
  // host with `all: initial` is unreliable, and a stale sheet left in the DOM is
  // a security smell: the operator should never see a prompt that is not live.
  function approvalSheet() {
    sheetHost = document.createElement('div');
    sheetHost.setAttribute('data-safari-ai-agent-host', '');
    const shadow = sheetHost.attachShadow({mode: 'closed'});
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop { position: fixed; inset: 0; background: #0b1b2e99; z-index: 2147483647;
                    display: flex; align-items: flex-end; justify-content: center; }
        .card { background: #fff; color: #17283e; font: 15px/1.4 -apple-system, system-ui, sans-serif;
                width: min(460px, calc(100vw - 20px)); margin: 0 10px 10px; padding: 16px;
                border-radius: 14px; box-shadow: 0 8px 34px #0006; box-sizing: border-box; }
        h2 { font-size: 15px; margin: 0 0 8px; }
        .what { font-weight: 600; word-break: break-word; margin: 0 0 6px; }
        .where { color: #4a5a6e; font-size: 13px; word-break: break-all; margin: 0 0 12px; }
        .warn { color: #8a3b10; font-size: 13px; margin: 0 0 12px; }
        .row { display: flex; gap: 10px; }
        button { flex: 1; font: 600 15px -apple-system, system-ui, sans-serif; padding: 12px;
                 border-radius: 10px; border: 1px solid #8da3bf; cursor: pointer; }
        .allow { background: #254c7c; color: #fff; border-color: #254c7c; }
        .deny  { background: #eef2f7; color: #17283e; }
      </style>
      <div class="backdrop" role="dialog" aria-modal="true">
        <div class="card">
          <h2>Safari AI Agent wants permission</h2>
          <p class="what"></p>
          <p class="where"></p>
          <p class="warn" hidden></p>
          <div class="row">
            <button class="deny" type="button">Deny</button>
            <button class="allow" type="button">Allow once</button>
          </div>
        </div>
      </div>`;
    sheetHost.__shadow = shadow;
    document.documentElement.appendChild(sheetHost);
    return shadow;
  }

  function askApproval({what, where, warning}) {
    teardownSheet();
    const shadow = approvalSheet();
    shadow.querySelector('.what').textContent = what;
    shadow.querySelector('.where').textContent = where;
    const warn = shadow.querySelector('.warn');
    warn.hidden = !warning;
    warn.textContent = warning || '';
    return new Promise(resolve => {
      const finish = answer => {
        teardownSheet();
        resolve(answer);
      };
      shadow.querySelector('.allow').onclick = () => finish(true);
      shadow.querySelector('.deny').onclick = () => finish(false);
    });
  }

  function teardownSheet() {
    if (sheetHost?.isConnected) sheetHost.remove();
    sheetHost = null;
  }

  function teardown() {
    teardownSheet();
    lastSnapshot = null;
  }

  /* --------------------------------------------------------------- execution */

  async function execute(command, sessionOrigin) {
    if (!command || typeof command !== 'object') throw new Error('Malformed command');
    if (command.origin !== location.origin || sessionOrigin !== location.origin) throw new Error('Wrong session origin');
    if (!/^[0-9a-f-]{36}$/.test(command.id) || Date.now() >= command.expiresAt) throw new Error('Expired/invalid command');
    const a = command.args || {};
    if (a.ref && !/^e\d{1,3}$/.test(a.ref)) throw new Error('Invalid element reference');

    switch (command.action) {
      case 'browser_inspect':
        lastSnapshot = core.inspect();
        return {success: true, data: lastSnapshot};

      case 'browser_fill':
        if (!lastSnapshot?.elements.some(x => x.ref === a.ref)) throw new Error('Inspect before filling a field');
        return {success: true, data: core.fill(a.ref, a.value)};

      case 'browser_verify': {
        const snap = core.inspect();
        lastSnapshot = snap;
        const pass = (!a.textIncludes || snap.textExcerpt.includes(a.textIncludes)) &&
                     (!a.urlIncludes || snap.url.includes(a.urlIncludes));
        return {
          success: pass,
          data: {match: pass, url: snap.url, title: snap.title},
          error: pass ? undefined : 'Expected condition was not observed'
        };
      }

      case 'browser_click': {
        if (!lastSnapshot?.elements.some(x => x.ref === a.ref)) throw new Error('Inspect before clicking an element');
        const preview = core.previewClick(a.ref);
        if (preview.risk) throw new Error(`High-impact control blocked: ${preview.risk}; use the webpage manually`);
        if (preview.href && new URL(preview.href).origin !== location.origin) throw new Error('Cross-site link blocked');
        const ok = await askApproval({
          // Name the control, never the opaque ref. core.previewClick already
          // builds a human sentence; the extension just gets to render it well.
          what: `Click ${preview.summary || a.ref}`,
          where: location.origin,
          warning: preview.control?.unnamed ? 'This control has no accessible name and cannot be identified.' : ''
        });
        if (!ok) throw new Error('User denied click');
        // Acknowledge the DISPATCH, then click. The click may unload the page and
        // kill this script, so the reply must leave first. verified:false is not
        // a formality: nothing here confirms the click had its intended effect.
        return {success: true, dispatched: true, verified: false, action: 'click', __deferredClick: a.ref};
      }

      case 'browser_navigate': {
        const dest = new URL(a.url);
        if (!['http:', 'https:'].includes(dest.protocol) || dest.origin !== location.origin) {
          throw new Error('Only same-site navigation allowed');
        }
        const ok = await askApproval({what: `Navigate to ${dest.href}`, where: location.origin, warning: ''});
        if (!ok) throw new Error('User denied navigation');
        // navigateTo is stripped by the background before the result is reported
        // to the gateway; it is an instruction to the worker, not a tool result.
        return {success: true, dispatched: true, verified: false, url: dest.href, navigateTo: dest.href};
      }

      default:
        throw new Error('Unsupported tool action');
    }
  }

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'ping') { sendResponse({ok: true}); return false; }
    if (message?.type === 'teardown') { teardown(); sendResponse({ok: true}); return false; }
    if (message?.type !== 'exec') return false;
    execute(message.command, message.sessionOrigin).then(
      outcome => {
        const {__deferredClick, ...reply} = outcome;
        sendResponse(reply);
        if (__deferredClick) {
          // Re-resolve after approval, exactly as src/remote.js does: the page
          // may have changed between the snapshot and the operator's answer.
          setTimeout(() => {
            try {
              const result = core.click(__deferredClick);
              if (result.requiresApproval) console.warn('[safari-ai-agent] high-impact control on recheck; not clicked');
            } catch (error) {
              console.warn('[safari-ai-agent] deferred click failed:', error?.message || error);
            }
            lastSnapshot = null;
          }, 0);
        }
      },
      error => sendResponse({success: false, error: String(error?.message || error)})
    );
    return true;
  });
})();
