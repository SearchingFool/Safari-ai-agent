/** Build standalone opt-in remote script using the tested DOM engine. */
import {readFile, writeFile} from 'node:fs/promises';
const header=`// ==UserScript==
// @name         Safari AI Agent Remote MCP
// @namespace    https://github.com/SearchingFool/Safari-ai-agent
// @version      0.2.0
// @description  Opt-in MCP gateway bridge. Only use on safe websites; never put credentials in webpage context.
// @match        https://*/*
// @run-at       document-idle
// @noframes
// @inject-into   content
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// ==/UserScript==\n`;
const payload=await Promise.all(['src/core.js','src/remote.js'].map(file=>readFile(file,'utf8')));
await writeFile('scripts/safari-ai-agent-remote.user.js',header+'\n'+payload.join('\n\n'));
