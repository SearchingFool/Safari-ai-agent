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
          // Stop while the request was in flight must prevent further local actions.
          // An already-acknowledged navigation/click is still unverified remotely.
          if(!running) return;
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
  async function stop(){
    running=false;clearTimeout(timer);
    // Persist the explicit stop before asking the gateway to revoke this device.
    await GM.setValue(K_SITE,false);
    show('Stopping and revoking queued commands...');
    try {
      if(url && token) await request('/device/disconnect',{origin:location.origin});
      show('Disconnected; queued commands revoked.');
    } catch (error) {
      // Local stop always wins. If offline, the gateway may retain an in-flight
      // request until timeout; no further local actions will be executed.
      show('Stopped locally. Remote revoke unavailable; pending calls will time out.');
    }
  }
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
