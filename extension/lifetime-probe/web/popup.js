/*
 * File: extension/lifetime-probe/web/popup.js
 * Description: TEST-ONLY popup script. Dumps the storage.local journal written
 *   by probe.js so it can be read when the localhost collector was unavailable.
 * Author: safari-ai-agent-sw-lifetime (Claude Code, Opus 5)
 * Created: 2026-10-11
 */
'use strict';
const api = globalThis.browser ?? globalThis.chrome;
api.storage.local.get(['journal']).then(got => {
  const list = Array.isArray(got.journal) ? got.journal : [];
  document.getElementById('out').textContent =
    list.length ? list.map(e => `${new Date(e.at).toISOString()} ${e.ev} ${e.bootId}`).join('\n')
                : '(empty)';
});
