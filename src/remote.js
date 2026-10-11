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
  // Per-TAB identity. sessionStorage is scoped to one tab and survives
  // same-tab navigation and reload, which is exactly the lifetime of a paired
  // session: a new tab gets a new id, but navigating within this tab keeps it,
  // so the gateway does not see our own next page as a rival tab.
  // Not a secret and never sent to a model - the device token stays in GM storage.
  const K_INSTANCE = 'safari-agent:instance';
  const INSTANCE_ID = /^[A-Za-z0-9_-]{8,64}$/;
  const MAX_WAIT = 8000;
  let running = false;
  let paused = false;
  let timer = null;
  let loopId = 0;
  let lastCommand = '';
  let lastSnapshot = null;
  let takeoverRequested = false;
  const core = globalThis.SafariAIAgentCore.createAgentCore(document, window);
  let url = '';
  let token = '';

  const instanceId = (() => {
    let existing = '';
    // Opaque origins (and Private Browsing) throw on sessionStorage access.
    // Falling back to a memory-only id is correct: no storage means no tab
    // continuity to preserve anyway.
    try { existing = String(window.sessionStorage.getItem(K_INSTANCE) || ''); } catch { existing = ''; }
    if (INSTANCE_ID.test(existing)) return existing;
    const fresh = (typeof crypto === 'object' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `t${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    try { window.sessionStorage.setItem(K_INSTANCE, fresh); } catch { /* memory-only id */ }
    return fresh;
  })();

  // Identity sent on every device call. visibilityState is part of it because
  // the gateway refuses to hand a command to a tab the operator cannot see.
  const identity = () => ({origin: location.origin, instanceId, visibility: document.visibilityState});

  // The native Userscripts API bridges to Safari's extension, bypassing page CORS.
  async function request(path, payload) {
    if (!url.startsWith('https://')) throw new Error('An HTTPS gateway is required.');
    const response = await GM.xmlHttpRequest({
      method:'POST', url:url + path, headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
      data:JSON.stringify(payload), timeout:MAX_WAIT, responseType:'text'
    });
    let body = null;
    try{ body = JSON.parse(response.responseText); }catch{ body = null; }
    if(response.status!==200){
      // Carry the parsed body on the error. A bare "HTTP 409" is what made the
      // two-tab deadlock undiagnosable from the panel (D-017).
      const error = new Error(body && body.error ? `Gateway HTTP ${response.status}: ${body.error}` : `Gateway HTTP ${response.status}`);
      error.status = response.status; error.payload = body;
      throw error;
    }
    if(!body) throw new Error('Gateway returned invalid JSON');
    return body;
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
        // Name the control, not the opaque ref. The operator is the enforcement
        // layer here, so approving "e37" is the security control failing.
        if(!window.confirm(`Allow AI browser agent to click ${preview.summary||a.ref}\n\non ${location.origin}?`))throw new Error('User denied click');
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
  // A target="_blank" link opens a NEW tab, which would strand the paired
  // session in the tab the operator is still looking at and start an unpaired
  // instance elsewhere. Rewrite to _self in the capture phase: the target
  // attribute is read when the default action runs, after dispatch, so this
  // takes effect for the click we are about to make. It is not restored
  // afterwards - the page is navigating away, and keeping the agent's work in
  // the paired tab is the intended behaviour, not a temporary override.
  function keepNavigationInThisTab(event){
    const link = event.target && typeof event.target.closest==='function' ? event.target.closest('a[target]') : null;
    if(!link) return;
    const requested = link.getAttribute('target');
    if(!requested || requested==='_self') return;
    try{
      if(new URL(link.getAttribute('href')||'',document.baseURI).origin!==location.origin) return;
    }catch{ return; }
    link.setAttribute('target','_self');
  }
  function clickInThisTab(ref){
    document.addEventListener('click',keepNavigationInThisTab,true);
    try{ return core.click(ref); }
    finally{ document.removeEventListener('click',keepNavigationInThisTab,true); }
  }
  async function pump(){
    const mine=++loopId; // Retires any older loop; prevents two pumps after a resume.
    while(running && !paused && loopId===mine){
      try {
        const poll={...identity()};
        if(takeoverRequested)poll.takeover=true;
        const p=await request('/device/poll',poll);
        takeoverRequested=false;
        conflict=null;
        if(!running||paused||loopId!==mine) break; // Stop/pause during an in-flight request must prevent execution.
        if(p.command){
          const command=p.command;
          lastCommand=command.action;
          let outcome;
          try{outcome=execute(command);}catch(e){outcome={success:false,error:String(e.message||e)};}
          // Acknowledge before unload for click/navigation. This is a dispatch
          // acknowledgement ONLY, not confirmation that navigation succeeded.
          const a=await request('/device/result',{id:command.id,...identity(),result:outcome});
          if(!a.accepted)throw new Error('Gateway rejected result');
          // Stop while the request was in flight must prevent further local actions.
          // An already-acknowledged navigation/click is still unverified remotely.
          if(!running||paused||loopId!==mine) return;
          if(outcome.success && outcome.dispatched && command.action==='browser_navigate'){
            running=false;
            location.assign(outcome.url);
            return;
          }
          if(outcome.success && outcome.dispatched && command.action==='browser_click'){
            // Re-check element/reference after user's confirmation, then click.
            const result=clickInThisTab(command.args.ref);
            if(result.requiresApproval)throw new Error('Unexpected high-impact control on recheck');
            lastSnapshot=null;
          }
        }
        show(running?`Connected · ${lastCommand||'ready'}`:'Stopped');
      } catch(e){
        if(e.status===409 && e.payload && e.payload.code==='DEVICE_SESSION_CONFLICT')showConflict(e.payload);
        else show(`Connection/action error: ${String(e.message||e)}`);
      }
      if(running && !paused && loopId===mine)await sleep(1200);
    }
  }
  function show(message){ if(status)status.textContent=message; if(takeover)takeover.hidden=!conflict; }
  // Name the tab that actually holds the session and offer a way out. Before
  // this the losing panel showed a bare HTTP error and polled forever (D-017).
  function showConflict(payload){
    conflict=payload;
    const who=payload.sameOrigin
      ? 'Another tab of this same site'
      : `${payload.activeOrigin||'Another site'}`;
    const seconds=Math.ceil((payload.staleAfterMs||0)/1000);
    show(`${who} is connected and owns the device session. Stop it there, or press "Take over" to move the session to this tab. ${seconds>0?`It frees itself in about ${seconds}s if that tab is gone.`:''}`);
  }
  let status=null;
  let takeover=null;
  let conflict=null;
  async function start(){
    if(running)return;
    url=String(await GM.getValue(K_URL,'')).replace(/\/$/,'');
    token=String(await GM.getValue(K_TOKEN,''));
    if(!url.startsWith('https://')||token.length<24)throw Error('Configure HTTPS gateway and 24+ character device token first');
    running=true;
    paused=document.visibilityState!=='visible';
    await GM.setValue(K_SITE,true);
    if(paused){show(PAUSED);return;}
    show('Connecting...');void pump();
  }
  const PAUSED='Paused - tab not visible. Nothing will run until you return to this tab.';
  // Safari throttles background timers well past the gateway's 45s freshness
  // window, so an unhandled hidden tab used to look dead. Pausing explicitly
  // makes the state legible AND tells the gateway, so a queued command fails
  // fast with a clear reason instead of timing out as "outcome uncertain".
  function onVisibilityChange(){
    if(!running)return;
    if(document.visibilityState==='visible'){
      if(!paused)return;
      paused=false;conflict=null;clearTimeout(timer);show('Resuming...');void pump();
      return;
    }
    if(paused)return;
    paused=true;loopId++;clearTimeout(timer);show(PAUSED);
    // Best effort only: tells the gateway this tab is not a safe place to run.
    if(url&&token)void request('/device/poll',identity()).catch(()=>{});
  }
  document.addEventListener('visibilitychange',onVisibilityChange);
  // bfcache/unload: retire the loop so a restored page starts one pump, not two.
  window.addEventListener('pagehide',()=>{if(running&&!paused){paused=true;loopId++;clearTimeout(timer);}});
  window.addEventListener('pageshow',()=>{if(running&&paused&&document.visibilityState==='visible')onVisibilityChange();});
  async function stop(){
    running=false;paused=false;conflict=null;loopId++;clearTimeout(timer);
    // Persist the explicit stop before asking the gateway to revoke this device.
    await GM.setValue(K_SITE,false);
    show('Stopping and revoking queued commands...');
    try {
      if(url && token) await request('/device/disconnect',identity());
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
      <div class="actions"><button id="save" type="button">Save</button><button id="connect" type="button">Connect</button><button id="stop" type="button">Stop</button><button id="takeover" type="button" hidden>Take over</button></div>
      <div class="status" role="status">Disabled on this site</div></section>`;
    shadow.append(style,root);document.documentElement.appendChild(host);
    const panel=root.querySelector('.panel');status=root.querySelector('.status');takeover=root.querySelector('#takeover');
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
    // Takeover is deliberately operator-driven: the gateway will never move a
    // session between tabs on its own, because the moving tab may be one the
    // operator is not looking at.
    takeover.addEventListener('click',async()=>{
      takeoverRequested=true;conflict=null;show('Taking over the device session...');
      if(!running){try{await start()}catch(e){show(String(e.message||e))}}
    });
    void (async()=>{try{
      root.querySelector('#gateway').value=String(await GM.getValue(K_URL,''));
      if(await GM.getValue(K_SITE,false))await start();
    }catch(e){show(String(e.message||e))}})();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
