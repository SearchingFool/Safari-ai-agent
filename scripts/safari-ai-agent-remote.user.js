// ==UserScript==
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
  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'time']);
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
      } else if (tag === 'textarea' || (tag === 'input' && TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase()))) {
        const proto = tag === 'textarea' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (!setter) throw new Error('Native value setter unavailable.');
        const isTime = tag === 'input' && el.type === 'time';
        if (isTime && value !== '' && !TIME_FORMAT.test(value)) throw new Error('Time format must be HH:mm, e.g. 14:30.');
        const previous = el.value;
        setter.call(el, value);
        if (isTime && (el.value !== value || !el.validity.valid)) {
          const reason = el.validationMessage || 'Time violates min/max/step constraint.';
          setter.call(el, previous);
          throw new Error(`Invalid time: ${reason}`);
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

    function previewClick(ref) {
      const el = resolve(ref);
      const href = el.tagName.toLowerCase() === 'a' ? new URL(el.getAttribute('href') || '', doc.baseURI).href : null;
      return {ref, risk: riskOfClick(el), href, tag: el.tagName.toLowerCase()};
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

    return Object.freeze({inspect, fill, click, previewClick, highlight, navigate});
  }

  global.SafariAIAgentCore = {createAgentCore};
  if (typeof module !== 'undefined' && module.exports) module.exports = {createAgentCore};
})(typeof globalThis !== 'undefined' ? globalThis : this);


/*
 * Opt-in remote MCP browser bridge for Userscripts on iPad.
 * IMPORTANT: this must run with @inject-into content and GM.* grants.
 * Never inject the device credential into the webpage or localStorage.
 * The UI uses a closed ShadowRoot so site scripts cannot inspect entered secrets.
 */
(function () {
  'use strict';
  if (window.self !== window.top) return;
  if (typeof GM !== 'object' || typeof GM.getValue !== 'function' || typeof GM.xmlHttpRequest !== 'function') return;
  const K_URL = 'safari-agent:gateway-url';
  const K_TOKEN = 'safari-agent:device-token';
  const K_SITE = `safari-agent:enabled:${location.origin}`;
  const MAX_WAIT = 8000;
  let running = false;
  let timer = null;
  let lastCommand = '';
  let lastSnapshot = null;
  const core = globalThis.SafariAIAgentCore.createAgentCore(document, window);
  let url = '';
  let token = '';

  // The native Userscripts API bridges to Safari's extension, bypassing page CORS.
  async function request(path, payload) {
    if (!url.startsWith('https://')) throw new Error('An HTTPS gateway is required.');
    const response = await GM.xmlHttpRequest({
      method:'POST', url:url + path, headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
      data:JSON.stringify(payload), timeout:MAX_WAIT, responseType:'text'
    });
    if(response.status!==200) throw new Error(`Gateway HTTP ${response.status}`);
    try{return JSON.parse(response.responseText);}catch{throw new Error('Gateway returned invalid JSON');}
  }
  function execute(command){
    if(!command || typeof command!=='object' || command.origin!==location.origin) throw new Error('Wrong session origin');
    if(!/^[0-9a-f-]{36}$/.test(command.id)|| Date.now()>=command.expiresAt)throw new Error('Expired/invalid command');
    const a=command.args||{};
    if(a.ref && !/^e\d{1,3}$/.test(a.ref))throw new Error('Invalid element reference');
    switch(command.action){
      case 'browser_inspect': lastSnapshot=core.inspect(); return {success:true,data:lastSnapshot};
      case 'browser_fill':
        if(!lastSnapshot?.elements.some(x=>x.ref===a.ref))throw new Error('Inspect before filling a field');
        return {success:true,data:core.fill(a.ref,a.value)};
      case 'browser_verify': {
        const snap=core.inspect(); lastSnapshot=snap;
        const pass=(!a.textIncludes || snap.textExcerpt.includes(a.textIncludes)) && (!a.urlIncludes || snap.url.includes(a.urlIncludes));
        return {success:pass,data:{match:pass,url:snap.url,title:snap.title},error:pass?undefined:'Expected condition was not observed'};
      }
      case 'browser_click': {
        if(!lastSnapshot?.elements.some(x=>x.ref===a.ref))throw new Error('Inspect before clicking an element');
        const preview=core.previewClick(a.ref);
        if(preview.risk)throw new Error(`High-impact control blocked: ${preview.risk}; use the webpage manually`);
        if(preview.href && new URL(preview.href).origin!==location.origin)throw new Error('Cross-site link blocked');
        if(!window.confirm(`Allow AI browser agent to click ${a.ref} on ${location.origin}?`))throw new Error('User denied click');
        // Links may cause a page unload. Caller must inspect again to verify.
        return {success:true,dispatched:true,verified:false,action:'click'};
      }
      case 'browser_navigate': {
        const dest = new URL(a.url);
        if(!['http:','https:'].includes(dest.protocol)||dest.origin!==location.origin)throw new Error('Only same-site navigation allowed');
        if(!window.confirm(`Allow AI browser agent to navigate to ${dest.href}?`))throw new Error('User denied navigation');
        return {success:true,dispatched:true,verified:false,url:dest.href};
      }
      default:throw new Error('Unsupported tool action');
    }
  }
  const sleep=ms=>new Promise(resolve=>{timer=setTimeout(resolve,ms);});
  async function pump(){
    while(running){
      try {
        const p=await request('/device/poll',{origin:location.origin});
        if(!running) break; // Stop during an in-flight network request must prevent execution.
        if(p.command){
          const command=p.command;
          lastCommand=command.action;
          let outcome;
          try{outcome=execute(command);}catch(e){outcome={success:false,error:String(e.message||e)};}
          // Acknowledge before unload for click/navigation. This is a dispatch
          // acknowledgement ONLY, not confirmation that navigation succeeded.
          const a=await request('/device/result',{id:command.id,origin:location.origin,result:outcome});
          if(!a.accepted)throw new Error('Gateway rejected result');
          if(outcome.success && outcome.dispatched && command.action==='browser_navigate'){
            running=false;
            location.assign(outcome.url);
            return;
          }
          if(outcome.success && outcome.dispatched && command.action==='browser_click'){
            // Re-check element/reference after user's confirmation, then click.
            const result=core.click(command.args.ref);
            if(result.requiresApproval)throw new Error('Unexpected high-impact control on recheck');
            lastSnapshot=null;
          }
        }
        show(running?`Connected · ${lastCommand||'ready'}`:'Stopped');
      } catch(e){show(`Connection/action error: ${String(e.message||e)}`);}
      if(running)await sleep(1200);
    }
  }
  function show(message){ if(status)status.textContent=message; }
  let status=null;
  async function start(){
    if(running)return;
    url=String(await GM.getValue(K_URL,'')).replace(/\/$/,'');
    token=String(await GM.getValue(K_TOKEN,''));
    if(!url.startsWith('https://')||token.length<24)throw Error('Configure HTTPS gateway and 24+ character device token first');
    running=true; await GM.setValue(K_SITE,true);show('Connecting...');void pump();
  }
  async function stop(){running=false;clearTimeout(timer);await GM.setValue(K_SITE,false);show('Disconnected');}
  function mount(){
    const host=document.createElement('div');host.setAttribute('data-safari-ai-remote-host','');
    const shadow=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');style.textContent=`
      button,input{font:14px system-ui}button{cursor:pointer;padding:9px;border-radius:6px;border:1px solid #8da3bf}
      .toggle{position:fixed;bottom:65px;right:20px;background:#254c7c;color:white;z-index:2147483647}
      .panel{position:fixed;bottom:112px;right:12px;width:min(360px,calc(100vw - 24px));background:white;color:#17283e;border:1px solid #b7c3d1;z-index:2147483647;padding:12px;box-sizing:border-box;border-radius:10px;font:13px system-ui;box-shadow:0 4px 20px #0004}
      .panel[hidden]{display:none}label{display:block;margin-top:8px}input{width:100%;box-sizing:border-box;padding:9px;border:1px solid #bbc6d8;border-radius:5px}
      .actions{display:flex;gap:8px;margin-top:8px}.status{padding-top:9px;line-height:1.3;word-break:break-word}
    `;
    const root=document.createElement('div');root.innerHTML=`
      <button class="toggle" type="button">Remote AI</button><section class="panel" hidden>
      <b>Safari AI Agent Remote</b><p>This page can be read by a connected AI. For testing, use only a non-sensitive website. Every click requires permission; form submission is blocked.</p>
      <label>Gateway HTTPS URL</label><input id="gateway" autocomplete="off" placeholder="https://your-domain.example" />
      <label>Device token (never share with an AI)</label><input id="secret" type="password" autocomplete="off" />
      <div class="actions"><button id="save" type="button">Save</button><button id="connect" type="button">Connect</button><button id="stop" type="button">Stop</button></div>
      <div class="status" role="status">Disabled on this site</div></section>`;
    shadow.append(style,root);document.documentElement.appendChild(host);
    const panel=root.querySelector('.panel');status=root.querySelector('.status');
    root.querySelector('.toggle').addEventListener('click',()=>{panel.hidden=!panel.hidden;});
    root.querySelector('#save').addEventListener('click',async()=>{
      try{const u=root.querySelector('#gateway').value.trim().replace(/\/$/,'');const t=root.querySelector('#secret').value.trim();
        if(new URL(u).protocol!=='https:'||t.length<24)throw Error('HTTPS URL and long device token required');
        await GM.setValue(K_URL,u);await GM.setValue(K_TOKEN,t);root.querySelector('#secret').value='';
        show('Configuration saved in Userscripts extension storage.');
      }catch(e){show(String(e.message||e));}
    });
    root.querySelector('#connect').addEventListener('click',async()=>{try{await start()}catch(e){show(String(e.message||e))}});
    root.querySelector('#stop').addEventListener('click',()=>void stop());
    void (async()=>{try{
      root.querySelector('#gateway').value=String(await GM.getValue(K_URL,''));
      if(await GM.getValue(K_SITE,false))await start();
    }catch(e){show(String(e.message||e))}})();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
