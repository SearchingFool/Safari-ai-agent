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
