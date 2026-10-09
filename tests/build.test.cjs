'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root,'scripts/safari-ai-agent.user.js'),'utf8');
test('generated userscript has Userscripts metadata and can run standalone',()=>{
  assert.match(script,/\/\/ ==UserScript==/);
  assert.match(script,/@match\s+https:\/\/\*\/\*/);
  assert.match(script,/@run-at\s+document-idle/);
  assert.match(script,/@grant\s+none/);
  assert.match(script,/SafariAIAgentCore/);
  assert.match(script,/SafariAIAgentPanel/);
});
test('built code contains no provider calls, remote includes or eval',()=>{
  assert.doesNotMatch(script,/@require\s|\beval\s*\(|new Function\s*\(/);
  assert.doesNotMatch(script,/fetch\s*\(|XMLHttpRequest|WebSocket\s*\(/);
});
