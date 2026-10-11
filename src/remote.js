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
  const K_SEQ = 'safari-agent:seq';
  const INSTANCE_ID = /^[A-Za-z0-9_-]{8,64}$/;
  const MAX_WAIT = 8000;
  let running = false;
  let paused = false;
  let timer = null;
  let loopId = 0;
  let lastCommand = '';
  let lastSnapshot = null;
  let takeoverRequested = false;
  const SAFARI_CORE = globalThis.SafariAIAgentCore;
  const core = SAFARI_CORE.createAgentCore(document, window);
  let url = '';
  let token = '';

  // ---------------------------------------------------------------------------
  // POLICY (D-025) and STANDING GRANTS (D-021)
  //
  // `policy` is the TUNABLE half, delivered by the gateway on every poll and
  // re-normalised here every time. Until a poll answers, and whenever the
  // answer is missing or malformed, it is read-only: the bridge fails closed on
  // a gateway it cannot hear from, not open.
  //
  // `grants` is the LOCAL half. It is a session-scoped, in-memory map that only
  // the operator can add to - by pressing "Always allow" in the panel dialog.
  // The gateway cannot create one, the model cannot request one, and nothing in
  // the page can cause one, which is what stops prompt injection from turning
  // into privilege escalation. Grants key on origin + action CLASS, never on an
  // element ref: refs are reassigned on every inspect, so a ref-scoped grant
  // would silently transfer to an unrelated control.
  // ---------------------------------------------------------------------------
  let policy = SAFARI_CORE.normalizePolicy(null);
  const grants = new Map();          // `${origin} | ${category}` -> {origin, category, at}
  const grantKey = (origin, category) => `${origin} | ${category}`;
  function hasGrant(category) { return grants.has(grantKey(location.origin, category)); }
  function addGrant(category) {
    grants.set(grantKey(location.origin, category), {origin: location.origin, category, at: Date.now()});
    renderGrants();
  }
  function revokeGrant(key) { grants.delete(key); renderGrants(); }
  function revokeAllGrants() { grants.clear(); renderGrants(); }
  // A policy change invalidates every grant made under the previous one: the
  // operator consented in a context that no longer exists.
  function applyPolicy(raw) {
    const next = SAFARI_CORE.normalizePolicy(raw);
    if (next.mode !== policy.mode || next.version !== policy.version) revokeAllGrants();
    policy = next;
    renderGrants();
  }

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

  // Monotonic per-tab request counter (D-035). visibilityState is read when a
  // request is BUILT, but the request is then awaited, so a poll built while
  // visible can still be in flight when the tab goes hidden. It then races the
  // out-of-band "I am hidden" notification fired by visibilitychange, and if
  // the stale one lands second the gateway - last-writer-wins - records a
  // suspended tab as visible. Nothing corrects it, because the tab has stopped
  // polling. That blocks sessionFollows (D-033) for the full 45s freshness
  // window and forces a manual Take over.
  //
  // Observed on an iPad 2026-10-11: once in eight visibility transitions, with
  // the two requests one millisecond apart. It cannot be reproduced off-device
  // because headless browsers do not suspend tabs, so the gateway-side ordering
  // rule is what the tests pin.
  //
  // The counter lives in sessionStorage beside the instance id deliberately:
  // the two must share a lifetime. A reload keeps the instance id, so a
  // counter that reset on reload would make every subsequent poll look stale
  // and freeze the gateway's view of this tab permanently - a worse bug than
  // the one being fixed.
  let seq = (() => {
    try { return Math.max(0, parseInt(window.sessionStorage.getItem(K_SEQ) || '0', 10) || 0); }
    catch { return 0; }
  })();
  function nextSeq() {
    seq += 1;
    try { window.sessionStorage.setItem(K_SEQ, String(seq)); } catch { /* memory-only, still monotonic in-tab */ }
    return seq;
  }

  // Identity sent on every device call. visibilityState is part of it because
  // the gateway refuses to hand a command to a tab the operator cannot see.
  const identity = () => ({origin: location.origin, instanceId, visibility: document.visibilityState, seq: nextSeq()});

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
  async function execute(command){
    if(!command || typeof command!=='object' || command.origin!==location.origin) throw new Error('Wrong session origin');
    if(!/^[0-9a-f-]{36}$/.test(command.id)|| Date.now()>=command.expiresAt)throw new Error('Expired/invalid command');
    const a=command.args||{};
    if(a.ref && !/^e\d{1,3}$/.test(a.ref))throw new Error('Invalid element reference');
    switch(command.action){
      // Inspect and verify are permitted in every mode including read-only.
      // They still disclose rendered page text to the model, which is why
      // read-only is a site-trust decision and not "harmless".
      case 'browser_inspect': lastSnapshot=core.inspect(); return {success:true,data:lastSnapshot};
      case 'browser_fill': {
        const verdict=core.decideFill(policy);
        if(verdict.decision!=='allow')throw new Error(`Refused: ${verdict.reason}`);
        if(!lastSnapshot?.elements.some(x=>x.ref===a.ref))throw new Error('Inspect before filling a field');
        return {success:true,data:core.fill(a.ref,a.value)};
      }
      case 'browser_verify': {
        const snap=core.inspect(); lastSnapshot=snap;
        const pass=(!a.textIncludes || snap.textExcerpt.includes(a.textIncludes)) && (!a.urlIncludes || snap.url.includes(a.urlIncludes));
        return {success:pass,data:{match:pass,url:snap.url,title:snap.title},error:pass?undefined:'Expected condition was not observed'};
      }
      case 'browser_click': {
        if(!lastSnapshot?.elements.some(x=>x.ref===a.ref))throw new Error('Inspect before clicking an element');
        const preview=core.previewClick(a.ref);
        // Classification happens in the bridge, from the live DOM. The verdict
        // then applies policy; a hard ceiling is refused inside decideClick
        // before the policy mode is even read.
        const verdict=core.decideClick(preview,policy);
        if(verdict.decision!=='prompt')throw new Error(`Refused: ${verdict.reason}`);
        if(preview.href && new URL(preview.href).origin!==location.origin)throw new Error('Cross-site link blocked');
        // A standing grant covers only the ROUTINE class the operator granted,
        // on this origin. It is checked AFTER the tier and mode gates, so it can
        // never reach an elevated or blocked control.
        if(verdict.grantable && hasGrant(preview.category)){
          return {success:true,dispatched:true,verified:false,action:'click',approval:'standing-grant',category:preview.category};
        }
        // Name the control, not the opaque ref. The operator is the enforcement
        // layer here, so approving "e37" is the security control failing.
        const answer=await requestApproval({
          verb:'click', target:preview.summary||a.ref, tier:preview.tier,
          category:preview.category, reasons:preview.reasons,
          grantable:verdict.grantable, expiresAt:command.expiresAt
        });
        if(answer==='deny')throw new Error('User denied click');
        if(answer==='always')addGrant(preview.category);
        // Links may cause a page unload. Caller must inspect again to verify.
        return {success:true,dispatched:true,verified:false,action:'click',approval:answer,category:preview.category};
      }
      case 'browser_navigate': {
        const dest = new URL(a.url);
        if(!['http:','https:'].includes(dest.protocol)||dest.origin!==location.origin)throw new Error('Only same-site navigation allowed');
        const verdict=core.decideNavigate(policy);
        if(verdict.decision!=='prompt')throw new Error(`Refused: ${verdict.reason}`);
        if(verdict.grantable && hasGrant(NAV_CLASS))return {success:true,dispatched:true,verified:false,url:dest.href,approval:'standing-grant'};
        const answer=await requestApproval({
          verb:'navigate to', target:dest.href, tier:'routine', category:NAV_CLASS,
          reasons:['same-origin navigation, reversible with the back button'],
          grantable:verdict.grantable, expiresAt:command.expiresAt
        });
        if(answer==='deny')throw new Error('User denied navigation');
        if(answer==='always')addGrant(NAV_CLASS);
        return {success:true,dispatched:true,verified:false,url:dest.href,approval:answer};
      }
      default:throw new Error('Unsupported tool action');
    }
  }
  const NAV_CLASS='same-origin-navigation';
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
  // `approved` is true because the gate already ran in execute(): the operator
  // answered the dialog, or a standing grant covered this ROUTINE class. A hard
  // ceiling still throws inside core.click() regardless of this flag, so the
  // re-check on dispatch is a genuine second evaluation of the live DOM and not
  // a formality - if the page swapped the control under us between approval and
  // dispatch, a now-blocked control is refused here.
  function clickInThisTab(ref){
    document.addEventListener('click',keepNavigationInThisTab,true);
    try{ return core.click(ref,true); }
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
        // Policy is re-read on EVERY poll, so revoking trust at the gateway
        // takes effect within one poll interval rather than at next connect.
        // A response with no policy field normalises to read-only.
        applyPolicy(p.policy);
        if(!running||paused||loopId!==mine) break; // Stop/pause during an in-flight request must prevent execution.
        if(p.command){
          const command=p.command;
          lastCommand=command.action;
          let outcome;
          try{outcome=await execute(command);}catch(e){outcome={success:false,error:String(e.message||e)};}
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
        // A successful poll means the gateway considers THIS tab the owner, so
        // the panel can say so without guessing. With the session now following
        // the visible tab (D-033) the operator may have several tabs of one
        // site open, and "Connected" in all of them would be a lie in all but
        // one - so the live tab says "LIVE in this tab" and every other tab
        // says standing by or paused.
        show(running?`${LIVE} Live in this tab · ${lastCommand||'ready'}`:'Stopped');
      } catch(e){
        if(e.status===409 && e.payload && e.payload.code==='DEVICE_SESSION_CONFLICT')showConflict(e.payload);
        else show(`Connection/action error: ${String(e.message||e)}`);
      }
      if(running && !paused && loopId===mine)await sleep(1200);
    }
  }
  const LIVE='●';   // filled dot: this tab holds the session
  const IDLE='○';   // hollow dot: this tab is connected but not the live one
  function show(message){ if(status)status.textContent=message; if(takeover)takeover.hidden=!conflict; }
  // Name the tab that actually holds the session and offer a way out. Before
  // this the losing panel showed a bare HTTP error and polled forever (D-017).
  function showConflict(payload){
    conflict=payload;
    const seconds=Math.ceil((payload.staleAfterMs||0)/1000);
    if(payload.sameOrigin){
      // Same origin is the D-033 case. A 409 here means the other tab is
      // currently VISIBLE, because the gateway hands the session over
      // automatically as soon as it is not - so the honest message is "you are
      // next", not "something is broken". Take over stays available for the
      // genuinely ambiguous case of two tabs visible at once (Split View or a
      // second window), which is the one thing the gateway cannot decide.
      show(`${IDLE} Standing by — another tab of this site is live. This tab becomes live automatically as soon as it is the one you are looking at. Press "Take over" only if both tabs are on screen at once.`);
      return;
    }
    show(`${IDLE} ${payload.activeOrigin||'Another site'} is connected and owns the device session. Stop it there, or press "Take over" to move the session to this tab. ${seconds>0?`It frees itself in about ${seconds}s if that tab is gone.`:''}`);
  }
  let status=null;
  let takeover=null;
  let conflict=null;
  let approvalBox=null;
  let grantList=null;
  let modeLine=null;
  let pendingApproval=null;

  // window.confirm is binary and cannot express allow-once / allow-always /
  // deny, and a native modal also blocks the bridge's own event loop. This is a
  // three-way dialog rendered inside the SAME closed shadow root as the panel,
  // so a page script can neither read it nor synthesise a click on it.
  //
  // Everything page-derived (the control's accessible name) is inserted with
  // textContent, never innerHTML: the summary is attacker-influenced text and
  // the one place it is displayed must not be able to build markup.
  function el(tag,text,className){
    const node=document.createElement(tag);
    if(text!==undefined&&text!==null)node.textContent=String(text);
    if(className)node.className=className;
    return node;
  }
  function requestApproval(request){
    // No UI means no way to obtain consent, so the answer is no. Failing closed
    // here matters: a headless or stripped environment must not become a path
    // to unattended action.
    if(!approvalBox)return Promise.resolve('deny');
    if(pendingApproval)pendingApproval('deny');
    return new Promise(resolve=>{
      let done=false;
      const settle=answer=>{
        if(done)return;
        done=true;
        clearTimeout(timer2);
        pendingApproval=null;
        approvalBox.textContent='';
        approvalBox.hidden=true;
        resolve(answer);
      };
      pendingApproval=settle;
      // The gateway abandons the command at expiresAt. Auto-DENY before that so
      // an unattended tab yields a clean refusal instead of "outcome may be
      // uncertain" - the one failure class a caller cannot safely retry.
      const remaining=(Number(request.expiresAt)||0)-Date.now()-1500;
      const timer2=setTimeout(()=>settle('deny'),Math.max(1000,Math.min(120000,remaining)));
      approvalBox.textContent='';
      approvalBox.append(el('b',`Approve ${request.verb}?`));
      approvalBox.append(el('p',request.target,'target'));
      approvalBox.append(el('p',`on ${location.origin}`,'where'));
      const why=el('p',`${request.tier.toUpperCase()} · ${request.category}`,'why');
      approvalBox.append(why);
      for(const reason of request.reasons||[])approvalBox.append(el('p',`· ${reason}`,'why'));
      const row=el('div',null,'actions');
      const once=el('button','Allow once');once.id='approve-once';once.type='button';
      once.addEventListener('click',()=>settle('once'));
      row.append(once);
      if(request.grantable){
        const always=el('button',`Always allow "${request.category}" here`);
        always.id='approve-always';always.type='button';
        always.addEventListener('click',()=>settle('always'));
        row.append(always);
      }
      const deny=el('button','Deny');deny.id='approve-deny';deny.type='button';
      deny.addEventListener('click',()=>settle('deny'));
      row.append(deny);
      approvalBox.append(row);
      approvalBox.hidden=false;
      once.focus();
    });
  }

  // Standing grants must be visible and individually revocable DURING a
  // session, not only clearable by Stop. Michael & Roesner found that only 6 of
  // 21 surveyed permission systems allow post-hoc modification at all; that gap
  // is the whole reason this list exists.
  function renderGrants(){
    if(modeLine)modeLine.textContent=`Site mode: ${policy.mode}${policy.grantsOffered?'':' (standing approvals disabled by gateway)'}`;
    if(!grantList)return;
    grantList.textContent='';
    if(grants.size===0){
      grantList.append(el('p','No standing approvals.','muted'));
      return;
    }
    grantList.append(el('p',`${grants.size} standing approval${grants.size===1?'':'s'} - review:`,'muted'));
    for(const [key,grant] of grants){
      const row=el('div',null,'grant');
      row.append(el('span',`${grant.category} on ${grant.origin}`));
      const button=el('button','Revoke');button.type='button';
      button.addEventListener('click',()=>revokeGrant(key));
      row.append(button);
      grantList.append(row);
    }
    const all=el('button','Revoke all');all.type='button';all.id='revoke-all';
    all.addEventListener('click',revokeAllGrants);
    grantList.append(all);
  }
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
  const PAUSED=`${IDLE} Paused - tab not visible. Nothing will run until you return to this tab.`;
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
    paused=true;loopId++;clearTimeout(timer);
    // An approval dialog left open in a tab that just went off screen must not
    // be answerable later. Without this the operator could switch away, let the
    // session follow to another tab (D-033), come back minutes afterwards and
    // approve a prompt for a command this tab no longer holds - which is the
    // "two tabs acting on one command" case restated. Denying is also the only
    // fail-closed answer: consent given to an off-screen page is not consent.
    if(pendingApproval)pendingApproval('deny');
    show(PAUSED);
    // Best effort only: tells the gateway this tab is not a safe place to run.
    // Load-bearing for D-033 as well as for the pause itself - it is what lets
    // the next visible tab take the session immediately instead of waiting out
    // the 45s freshness window.
    if(url&&token)void request('/device/poll',identity()).catch(()=>{});
  }
  document.addEventListener('visibilitychange',onVisibilityChange);
  // bfcache/unload: retire the loop so a restored page starts one pump, not two.
  window.addEventListener('pagehide',()=>{if(running&&!paused){paused=true;loopId++;clearTimeout(timer);}});
  window.addEventListener('pageshow',()=>{if(running&&paused&&document.visibilityState==='visible')onVisibilityChange();});
  async function stop(){
    running=false;paused=false;conflict=null;loopId++;clearTimeout(timer);
    // Stop is the revocation of everything: an open dialog is answered "deny",
    // every standing grant is dropped, and policy returns to read-only so a
    // reconnect cannot inherit trust from the session being ended (D-021).
    if(pendingApproval)pendingApproval('deny');
    revokeAllGrants();
    policy=SAFARI_CORE.normalizePolicy(null);
    renderGrants();
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
      .actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}.status{padding-top:9px;line-height:1.3;word-break:break-word}
      .approval{position:fixed;bottom:112px;right:12px;width:min(360px,calc(100vw - 24px));background:#fffdf5;color:#17283e;border:2px solid #b8761a;z-index:2147483647;padding:12px;box-sizing:border-box;border-radius:10px;font:13px system-ui;box-shadow:0 4px 24px #0006}
      .approval[hidden]{display:none}
      .approval .target{font-weight:700;word-break:break-word;margin:6px 0}
      .approval .where,.approval .why{color:#4b5a6e;font-size:12px;margin:2px 0;word-break:break-word}
      .mode{font-size:12px;color:#4b5a6e;padding-top:6px}
      .grants{border-top:1px solid #dde3ea;margin-top:9px;padding-top:7px;font-size:12px}
      .grants .muted{color:#4b5a6e;margin:0 0 5px}
      .grant{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:4px 0}
      .grants button{padding:4px 8px;font-size:12px}
    `;
    const root=document.createElement('div');root.innerHTML=`
      <button class="toggle" type="button">Remote AI</button><section class="panel" hidden>
      <b>Safari AI Agent Remote</b><p>This page can be read by a connected AI. For testing, use only a non-sensitive website. Payment, account-deletion and credential controls are refused on every site, including trusted ones.</p>
      <label>Gateway HTTPS URL</label><input id="gateway" autocomplete="off" placeholder="https://your-domain.example" />
      <label>Device token (never share with an AI)</label><input id="secret" type="password" autocomplete="off" />
      <div class="actions"><button id="save" type="button">Save</button><button id="connect" type="button">Connect</button><button id="stop" type="button">Stop</button><button id="takeover" type="button" hidden>Take over</button></div>
      <div class="mode">Site mode: read-only</div>
      <div class="status" role="status">Disabled on this site</div>
      <div class="grants"></div></section>
      <section class="approval" role="alertdialog" aria-modal="true" aria-label="Browser agent approval" hidden></section>`;
    shadow.append(style,root);document.documentElement.appendChild(host);
    const panel=root.querySelector('.panel');status=root.querySelector('.status');takeover=root.querySelector('#takeover');
    approvalBox=root.querySelector('.approval');grantList=root.querySelector('.grants');modeLine=root.querySelector('.mode');
    renderGrants();
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
      // A takeover starts a new session context. Grants were consented to for
      // the session being displaced, so they do not survive it.
      takeoverRequested=true;conflict=null;revokeAllGrants();show('Taking over the device session...');
      if(!running){try{await start()}catch(e){show(String(e.message||e))}}
    });
    void (async()=>{try{
      root.querySelector('#gateway').value=String(await GM.getValue(K_URL,''));
      if(await GM.getValue(K_SITE,false))await start();
    }catch(e){show(String(e.message||e))}})();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
