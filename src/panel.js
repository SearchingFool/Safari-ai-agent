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
