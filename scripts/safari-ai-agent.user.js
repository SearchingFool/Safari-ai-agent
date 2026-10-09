// ==UserScript==
// @name         Safari AI Agent Lab
// @namespace    https://github.com/SearchingFool/Safari-ai-agent
// @version      0.1.1
// @description  Local-only manual browser inspection, form filling and navigation test tools.
// @match        https://*/*
// @match        http://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

/*
 * Safari AI Agent: webpage action engine.
 * This file intentionally depends only on the browser DOM and standard JavaScript.
 * It must never contact a server, execute strings as code, or read password values.
 * The same engine can later be imported by a full Safari WebExtension.
 */
(function (global) {
  'use strict';

  const MAX_ELEMENTS = 100;
  const MAX_TEXT = 2000;
  const ACTIONABLE = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"]';
  // Time fields accept only canonical HTML values; other input types stay restricted.
  const FILLABLE_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'time']);
  const TIME_FORMAT = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const HIGH_IMPACT = /\b(delete|remove|erase|pay|purchase|buy|checkout|transfer|send|publish|confirm|submit|post|order)\b/i;
  const trim = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

  function createAgentCore(doc, win) {
    if (!doc || !win) throw new TypeError('Document and window are required');
    const references = new Map();
    let sequence = 0;

    function isVisible(el) {
      if (!el || !el.isConnected || el.closest('[data-safari-ai-agent-host]')) return false;
      if (el.hidden || el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const style = win.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function getLabel(el) {
      const fromAria = el.getAttribute('aria-label');
      if (fromAria) return trim(fromAria);
      if (el.labels && el.labels.length) return trim([...el.labels].map(label => label.textContent).join(' '));
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const label = labelledBy.split(/\s+/).map(id => doc.getElementById(id)?.textContent || '').join(' ');
        if (label.trim()) return trim(label);
      }
      return trim(el.getAttribute('placeholder') || el.innerText || el.textContent || el.getAttribute('title') || '');
    }

    function describe(el, ref) {
      const tag = el.tagName.toLowerCase();
      const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag;
      const details = {ref, tag, type, label: getLabel(el), disabled: Boolean(el.disabled)};
      if (tag === 'a') {
        const raw = el.getAttribute('href') || '';
        try { const href = new URL(raw, doc.baseURI); if (['https:', 'http:'].includes(href.protocol)) details.href = href.href; }
        catch (_) { /* An invalid URL is deliberately omitted. */ }
      }
      if (tag === 'select') details.options = [...el.options].slice(0, 30).map(option => ({value: option.value, label: trim(option.textContent, 80)}));
      // Never expose input values. This covers passwords as well as personal form data.
      return details;
    }

    function inspect() {
      references.clear();
      sequence = 0;
      const elements = [];
      for (const el of doc.querySelectorAll(ACTIONABLE)) {
        if (elements.length >= MAX_ELEMENTS) break;
        if (!isVisible(el)) continue;
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (['hidden', 'file'].includes(type)) continue;
        const ref = `e${++sequence}`;
        references.set(ref, el);
        elements.push(describe(el, ref));
      }
      // body.innerText only reflects rendered text. This is intentionally local-only.
      // Never copy a snapshot to an AI provider without separate explicit consent.
      const pageText = trim(doc.body?.innerText || '', MAX_TEXT);
      return {
        schema: 'safari-ai-agent.snapshot.v1',
        url: win.location.href,
        title: trim(doc.title, 240),
        textExcerpt: pageText,
        elements,
        truncated: elements.length >= MAX_ELEMENTS
      };
    }

    function resolve(ref) {
      if (typeof ref !== 'string' || !/^e\d{1,3}$/.test(ref)) throw new Error('Invalid element reference; inspect the page first.');
      const el = references.get(ref);
      if (!el || !isVisible(el)) throw new Error('Element missing or no longer visible; inspect again.');
      return el;
    }

    function fill(ref, value) {
      const el = resolve(ref);
      if (el.disabled || el.readOnly) throw new Error('Field is disabled or read-only.');
      if (typeof value !== 'string' || value.length > 10000) throw new Error('Value must be text of at most 10,000 characters.');
      const tag = el.tagName.toLowerCase();
      if (tag === 'select') {
        const option = [...el.options].find(item => item.value === value || trim(item.textContent) === value);
        if (!option || option.disabled) throw new Error('No enabled option matches that text or value.');
        el.value = option.value;
      } else if (tag === 'textarea' || (tag === 'input' && FILLABLE_INPUT_TYPES.has((el.type || 'text').toLowerCase()))) {
        const inputType = tag === 'input' ? (el.type || 'text').toLowerCase() : null;
        // The native time widget accepts HH:mm, not locale-specific inputs such as 2:30 PM.
        // Validate before writing so malformed values never clear a previously valid value.
        if (inputType === 'time' && value !== '' && !TIME_FORMAT.test(value)) {
          throw new Error('Time must use 24-hour HH:mm format, e.g. 14:30.');
        }
        const proto = tag === 'textarea' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (!setter) throw new Error('Native value setter unavailable.');
        const previousValue = el.value;
        setter.call(el, value);
        if (inputType === 'time') {
          // Browser constraint validation checks min/max/step as defined by each site.
          // For the HTTPBin demo, only 11:00-21:00 at 15-minute intervals is legal.
          // Revert on failure, and do not emit change events for rejected values.
          if (el.value !== value || !el.validity.valid) {
            const reason = el.validationMessage || 'Time is outside the allowed range or interval.';
            setter.call(el, previousValue);
            throw new Error(`Invalid time: ${reason}`);
          }
        }
      } else if (el.isContentEditable && el.getAttribute('contenteditable') === 'true') {
        el.textContent = value;
      } else {
        throw new Error('Unsupported field. Passwords, files, and sensitive controls cannot be filled.');
      }
      el.dispatchEvent(new win.Event('input', {bubbles: true}));
      el.dispatchEvent(new win.Event('change', {bubbles: true}));
      return {action: 'fill', ref, success: true, type: tag};
    }

    function riskOfClick(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'button' && el.closest('form') && (el.getAttribute('type') || 'submit').toLowerCase() === 'submit') return 'form submission';
      if (tag === 'input' && ['submit', 'image'].includes((el.type || '').toLowerCase())) return 'form submission';
      if (HIGH_IMPACT.test(getLabel(el))) return 'potentially consequential action';
      return null;
    }

    function click(ref, approved = false) {
      const el = resolve(ref);
      if (el.disabled) throw new Error('Control is disabled.');
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      if (!['button', 'a', 'input'].includes(tag) && !['button', 'link'].includes(role)) throw new Error('Only buttons, links and click controls are supported.');
      if (tag === 'input' && !['button','submit','checkbox','radio','reset','image'].includes((el.type || '').toLowerCase())) throw new Error('This is not a click control.');
      if (tag === 'a') {
        const href = new URL(el.getAttribute('href') || '', doc.baseURI);
        if (!['https:', 'http:'].includes(href.protocol)) throw new Error('Unsupported link protocol.');
      }
      const risk = riskOfClick(el);
      if (risk && approved !== true) return {action: 'click', ref, requiresApproval: true, reason: risk};
      el.click();
      return {action: 'click', ref, success: true, approvalUsed: Boolean(risk)};
    }

    function highlight(ref) {
      const el = resolve(ref);
      const old = el.style.outline;
      el.style.outline = '3px solid #e38a1b';
      el.scrollIntoView({behavior: 'smooth', block: 'center'});
      win.setTimeout(() => { if (el.isConnected) el.style.outline = old; }, 2000);
      return {action: 'highlight', ref, success: true};
    }

    function navigate(rawUrl, approvedCrossOrigin = false) {
      if (typeof rawUrl !== 'string' || rawUrl.length > 2048) throw new Error('Invalid destination.');
      const url = new URL(rawUrl, win.location.href);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Only normal HTTP(S) destinations are allowed.');
      if (url.origin !== win.location.origin && !approvedCrossOrigin) return {action: 'navigate', requiresApproval: true, reason: 'cross-site navigation', url: url.href};
      win.location.assign(url.href);
      return {action: 'navigate', success: true, url: url.href};
    }

    return Object.freeze({inspect, fill, click, highlight, navigate});
  }

  global.SafariAIAgentCore = {createAgentCore};
  if (typeof module !== 'undefined' && module.exports) module.exports = {createAgentCore};
})(typeof globalThis !== 'undefined' ? globalThis : this);


/*
 * Local, manual test panel. Mounted in a Shadow DOM to keep page CSS
 * and page scripts from accidentally changing the controller UI.
 */
(function (global) {
  'use strict';

  function mountPanel(doc, win, core) {
    if (doc.querySelector('[data-safari-ai-agent-host]')) return;
    const host = doc.createElement('div');
    host.setAttribute('data-safari-ai-agent-host', '');
    const root = host.attachShadow({mode: 'open'});
    const style = doc.createElement('style');
    style.textContent = `
      :host {all:initial}
      .toggle { position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#193c6b;color:white;border:0;border-radius:24px;padding:12px 16px;font:600 14px system-ui;box-shadow:0 4px 16px #0004;cursor:pointer; }
      .panel { position:fixed;z-index:2147483647;right:15px;bottom:75px;width:min(360px,calc(100vw - 30px));max-height:75vh;overflow:auto;background:white;color:#142334;border:1px solid #ccd3dc;border-radius:12px;box-shadow:0 6px 30px #0005;padding:14px;box-sizing:border-box;font:14px system-ui; }
      .panel[hidden] {display:none}
      h2 {font:700 17px system-ui;margin:0 0 6px}
      p {font:12px system-ui;color:#445566;margin:0 0 10px;line-height:1.4}
      label {display:block;font:600 12px system-ui;margin-top:10px}
      input {width:100%;box-sizing:border-box;border:1px solid #a1afc1;border-radius:6px;padding:8px;color:#142334;background:white;font:14px system-ui}
      button {border:1px solid #bac7d8;background:#eef3f9;border-radius:6px;padding:8px;cursor:pointer;font:600 13px system-ui;color:#132c49}
      button:focus-visible,input:focus-visible {outline:2px solid #2e65ca;outline-offset:2px}
      .actions {display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
      pre {font:11px ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;background:#f1f5fa;color:#16263b;border-radius:7px;padding:8px;max-height:180px;overflow:auto}
      .status {font:12px system-ui;min-height:20px;padding:5px 0}
      .error {color:#9c1c1c}
    `;
    const wrapper = doc.createElement('div');
    wrapper.innerHTML = `
      <button class="toggle" type="button" aria-label="Open browser agent tools" aria-expanded="false">Browser Lab</button>
      <section class="panel" hidden aria-label="Browser agent manual test panel">
        <h2>Safari AI Agent Lab</h2>
        <p>Local-only test. Inspect first, then use an element reference such as e1. No AI or network connection.</p>
        <div class="actions"><button data-do="inspect" type="button">Inspect page</button><button data-do="copy" type="button">Copy snapshot</button></div>
        <label for="ref">Element reference</label><input id="ref" type="text" placeholder="e1" autocomplete="off" />
        <label for="value">Text or select-option value</label><input id="value" type="text" placeholder="Enter text to fill" autocomplete="off" />
        <div class="actions"><button data-do="highlight" type="button">Highlight</button><button data-do="fill" type="button">Fill</button><button data-do="click" type="button">Click</button></div>
        <label for="url">URL for navigation</label><input id="url" type="url" placeholder="https://example.com" autocomplete="off" />
        <div class="actions"><button data-do="navigate" type="button">Navigate</button><button data-do="close" type="button">Close</button></div>
        <div class="status" role="status" aria-live="polite">Ready. Click Inspect page.</div>
        <pre aria-label="Results"></pre>
      </section>`;
    root.append(style, wrapper);
    doc.documentElement.appendChild(host);

    const toggle = root.querySelector('.toggle');
    const panel = root.querySelector('.panel');
    const status = root.querySelector('.status');
    const results = root.querySelector('pre');
    const field = id => root.getElementById(id).value;
    let lastSnapshot = null;

    function report(value) {
      results.textContent = JSON.stringify(value, null, 2);
      status.classList.remove('error');
      status.textContent = 'Completed.';
    }
    function reportError(error) {
      status.classList.add('error');
      status.textContent = error instanceof Error ? error.message : String(error);
    }
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });
    root.querySelectorAll('button[data-do]').forEach(button => button.addEventListener('click', async () => {
      try {
        const action = button.getAttribute('data-do');
        if (action === 'close') { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); return; }
        if (action === 'inspect') { lastSnapshot = core.inspect(); report(lastSnapshot); return; }
        if (action === 'copy') {
          if (!lastSnapshot) throw new Error('Inspect the page before copying.');
          if (!win.navigator.clipboard?.writeText) throw new Error('Clipboard unavailable. Select and copy results manually.');
          await win.navigator.clipboard.writeText(JSON.stringify(lastSnapshot, null, 2));
          report({copied: true, elementCount: lastSnapshot.elements.length});
          return;
        }
        if (action === 'highlight') { report(core.highlight(field('ref').trim())); return; }
        if (action === 'fill') { report(core.fill(field('ref').trim(), field('value'))); return; }
        if (action === 'click') {
          let result = core.click(field('ref').trim());
          if (result.requiresApproval) {
            if (!win.confirm(`Confirm ${result.reason}? This may change data on the website.`)) { report({cancelled: true}); return; }
            result = core.click(field('ref').trim(), true);
          }
          report(result);
          return;
        }
        if (action === 'navigate') {
          let result = core.navigate(field('url').trim());
          if (result.requiresApproval) {
            if (!win.confirm(`Leave this site and navigate to ${result.url}?`)) { report({cancelled: true}); return; }
            result = core.navigate(field('url').trim(), true);
          }
          report(result);
        }
      } catch (error) { reportError(error); }
    }));
  }

  global.SafariAIAgentPanel = {mountPanel};
  if (typeof module !== 'undefined' && module.exports) module.exports = {mountPanel};
})(typeof globalThis !== 'undefined' ? globalThis : this);


/* Entry point injected by the userscript, intentionally avoiding iframes. */
(function () {
  'use strict';
  if (window.self !== window.top) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once: true});
  } else start();
  function start() {
    if (!document.documentElement || document.querySelector('[data-safari-ai-agent-host]')) return;
    const core = globalThis.SafariAIAgentCore.createAgentCore(document, window);
    globalThis.SafariAIAgentPanel.mountPanel(document, window, core);
  }
})();
