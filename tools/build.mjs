/* Deterministic, dependency-free userscript builder. */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const header = `// ==UserScript==
// @name         Safari AI Agent Lab
// @namespace    https://github.com/SearchingFool/Safari-ai-agent
// @version      0.1.0
// @description  Local-only manual browser inspection, form filling and navigation test tools.
// @match        https://*/*
// @match        http://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==\n`;
const contents = await Promise.all(['src/core.js','src/panel.js','src/bootstrap.js'].map(p => readFile(resolve(root,p),'utf8')));
const artifact = header + '\n' + contents.join('\n\n');
await mkdir(resolve(root,'scripts'),{recursive:true});
await writeFile(resolve(root,'scripts/safari-ai-agent.user.js'),artifact);
console.log(`Wrote scripts/safari-ai-agent.user.js (${Buffer.byteLength(artifact)} bytes)`);
