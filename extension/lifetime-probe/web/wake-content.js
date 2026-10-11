/*
 * File: extension/lifetime-probe/web/wake-content.js
 * Description: TEST-ONLY content script. Pings the probe service worker as soon
 *   as the collector's own page loads, so that message-triggered wake-up latency
 *   can be measured by navigating Safari to that page via AppleScript.
 * Author: safari-ai-agent-sw-lifetime (Claude Code, Opus 5)
 * Created: 2026-10-11
 */
'use strict';
const api = globalThis.browser ?? globalThis.chrome;
try {
  api.runtime.sendMessage({type: 'wake', sentAt: Date.now()});
} catch { /* Background unreachable. That is itself a datum; the collector sees no 'wake'. */ }
