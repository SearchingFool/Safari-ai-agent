/** Gateway behavior and negative-security tests. Uses real HTTP on loopback. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGateway} from '../gateway/server.mjs';
const mcpToken = 'M'.repeat(48), deviceToken = 'D'.repeat(48), demoPassword='P'.repeat(48), origin = 'https://example.org';
// D-020: an unlisted origin is read-only, so a test that exercises fill, click
// or navigate must say so explicitly. Most existing tests drive an acting tool,
// so the helper nominates the test origin as trusted and the tests that care
// about the RESTRICTIVE defaults override `sitePolicy` themselves. Opting in is
// the point: nothing acts on a site the operator did not nominate.
async function testGateway(fn, options={}) {
  const g=createGateway({clientToken:mcpToken,deviceToken,demoPassword,allowedOrigins:[origin],
    sitePolicy:{[origin]:'trusted'},commandTimeoutMs:500,...options});
  await new Promise(resolve=>g.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${g.server.address().port}`;
  const post=(path,body,token=mcpToken,headers={})=>fetch(base+path,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const rpc=(method,params={},id=1)=>post('/mcp',{jsonrpc:'2.0',id,method,params});
  // Every device call now carries tab identity and visibility. The helper
  // supplies the common case so each test states only what it is varying;
  // tests that exercise a second tab or a hidden tab pass them explicitly.
  const device=(name,body,token=deviceToken)=>post('/device/'+name,{instanceId:'tab-primary-1',visibility:'visible',...body},token);
  try{return await fn({g,base,post,rpc,device})}finally{await g.close()}
}
const call=(name,args={})=>({name,arguments:args});
const payload=async r=>(await r.json());
const output=x=>JSON.parse(x.result.content[0].text);

// `/device/poll` answers immediately with `command:null` when the queue is
// empty; it is not a long poll. A tools/call started but not awaited has
// therefore not necessarily registered its pending item by the time the next
// poll reaches the server, so a single poll races the queueing and sees null
// roughly half the time. The real bridge re-polls every 1200ms (src/remote.js)
// and treats an empty answer as the ordinary idle case, so the tests do the
// same with a tighter interval instead of assuming the first poll wins.
async function awaitCommand(device,origin,{attempts=100,intervalMs=5,...body}={}){
  for(let i=0;i<attempts;i++){
    const {command}=await payload(await device('poll',{origin,...body}));
    if(command)return command;
    await new Promise(resolve=>setTimeout(resolve,intervalMs));
  }
  throw new Error(`Gateway never queued a command for ${origin}`);
}
// An un-awaited tools/call rejects once the gateway is torn down. If an
// assertion fails first, that rejection would surface as an unhandledRejection
// and mask the real failure, so register a no-op handler while still returning
// the original promise for the test to await.
const inFlight=promise=>{promise.catch(()=>{});return promise;};

test('Reject unsafe or missing setup secrets and origins',()=>{
  assert.throws(()=>createGateway({clientToken:'short',deviceToken:'short',allowedOrigins:[origin]}));
  assert.throws(()=>createGateway({clientToken:mcpToken,deviceToken:deviceToken,allowedOrigins:['javascript:alert(1)']}));
  assert.throws(()=>createGateway({clientToken:mcpToken,deviceToken:deviceToken,allowedOrigins:[]}));
});
test('Reject MCP without correct token, with browser Origin, and with non-POST method',()=>testGateway(async({base,post})=>{
  assert.equal((await post('/mcp',{jsonrpc:'2.0',id:1,method:'ping'},'no')).status,401);
  assert.equal((await post('/mcp',{jsonrpc:'2.0',id:1,method:'ping'},mcpToken,{Origin:'https://evil.example'})).status,403);
  assert.equal((await fetch(base+'/mcp',{headers:{Authorization:`Bearer ${mcpToken}`}})).status,405);
}));
test('MCP handshake, available browser tools, notification and unknown method',()=>testGateway(async({rpc,post})=>{
  const init=await payload(await rpc('initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'test',version:'1'},capabilities:{}}));
  assert.equal(init.result.protocolVersion,'2025-11-25');
  assert.ok(init.result.capabilities.tools);
  const list=await payload(await rpc('tools/list'));
  assert.deepEqual(list.result.tools.map(t=>t.name),['browser_inspect','browser_fill','browser_click','browser_navigate','browser_verify','browser_status','browser_cancel']);
  // D-034. The click description is the only prose the MODEL reads about what
  // is and is not guarded, and it stayed wrong for a release after D-019
  // narrowed the hard ceilings, which made a model report a false defect on
  // device. The truth of English cannot be asserted, but drift back to the
  // specific false claim can be, and so can the three facts that replaced it.
  const click=list.result.tools.find(t=>t.name==='browser_click');
  assert.doesNotMatch(click.description,/submission is blocked/i,
    'browser_click must not claim submits are blocked; since D-019 a submit is ELEVATED, not ceilinged');
  assert.match(click.description,/trusted/i);
  for(const ceiling of ['ayment','ccount-deletion','redential'])assert.match(click.description,new RegExp(ceiling));
  assert.equal(click.annotations.destructiveHint,true);
  const notice=await post('/mcp',{jsonrpc:'2.0',method:'notifications/initialized'});
  assert.equal(notice.status,202);
  assert.equal((await payload(await rpc('unrecognized'))).error.code,-32601);
}));
test('Device origin, token, result id, and replay protection',()=>testGateway(async({rpc,device})=>{
  assert.equal((await device('poll',{origin},'wrong')).status,401);
  assert.equal((await device('poll',{origin:'https://attacker.test'})).status,403);
  let status=await payload(await rpc('tools/call',call('browser_status')));
  assert.equal(output(status).connected,false);
  await device('poll',{origin});
  status=await payload(await rpc('tools/call',call('browser_status')));
  assert.equal(output(status).connected,true);
  const inflight=inFlight(rpc('tools/call',call('browser_inspect'),2));
  const cmd=await awaitCommand(device,origin);
  assert.equal(cmd.action,'browser_inspect');
  assert.equal((await device('result',{id:cmd.id,origin:'https://wrong.test',result:{success:true}})).status,403);
  assert.equal((await device('result',{id:cmd.id,origin,result:{success:true,data:{url:origin+'/forms'}}})).status,200);
  assert.equal(output(await payload(await inflight)).data.url,origin+'/forms');
  assert.equal((await device('result',{id:cmd.id,origin,result:{success:true}})).status,409);
}));
test('Allowed action schema, origin scope, stale device and concurrency',()=>testGateway(async({rpc,device})=>{
  let err=await payload(await rpc('tools/call',call('browser_navigate',{url:'https://evil.example'})));
  assert.equal(err.result.isError,true);
  assert.match(output(err).error,/not allowed|No active/);
  err=await payload(await rpc('tools/call',call('browser_fill',{ref:'e9999',value:'hello'})));
  assert.equal(err.result.isError,true);
  await device('poll',{origin});
  const waiting=inFlight(rpc('tools/call',call('browser_inspect'),7));
  const cmd=await awaitCommand(device,origin);
  const busy=await payload(await rpc('tools/call',call('browser_fill',{ref:'e1',value:'x'}),8));
  assert.match(output(busy).error,/one in-flight/);
  await device('result',{id:cmd.id,origin,result:{success:false,error:'User denied'}});
  const done=await payload(await waiting);
  assert.equal(done.result.isError,true);
  assert.match(output(done).error,/denied/);
}));
test('Cancelled commands fail closed and cannot be replayed',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  const started=inFlight(rpc('tools/call',call('browser_fill',{ref:'e1',value:'test'}),1));
  const cmd=await awaitCommand(device,origin);
  assert.ok(cmd.id);
  const cancelled=await payload(await rpc('tools/call',call('browser_cancel'),3));
  assert.equal(output(cancelled).cancelled,true);
  assert.match(output(await payload(await started)).error,/Cancelled/);
  assert.equal((await device('result',{id:cmd.id,origin,result:{success:true}})).status,409);
}));
test('Device command timeout returns uncertain failure, not false success',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  const request=await payload(await rpc('tools/call',call('browser_inspect')));
  assert.equal(request.result.isError,true);
  assert.match(output(request).error,/timed out/);
},{commandTimeoutMs:35}));
test('Allowed navigation and inspect round trip do not require a model or API billing',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  const req=inFlight(rpc('tools/call',call('browser_navigate',{url:origin+'/page2'}),10));
  const cmd=await awaitCommand(device,origin);
  assert.equal(cmd.args.url,origin+'/page2');
  await device('result',{id:cmd.id,origin,result:{success:true,dispatched:true,verified:false}});
  const first=await payload(await req);
  assert.equal(output(first).verified,false);
  const inspect=inFlight(rpc('tools/call',call('browser_inspect'),11));
  const next=await awaitCommand(device,origin);
  await device('result',{id:next.id,origin,result:{success:true,data:{url:origin+'/page2',title:'Page 2'}}});
  assert.equal(output(await payload(await inspect)).data.url,origin+'/page2');
}));

test('Device disconnect revokes pending commands and rejects old results',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  const req=inFlight(rpc('tools/call',call('browser_click',{ref:'e2'}),90));
  const cmd=await awaitCommand(device,origin);
  assert.ok(cmd.id);
  const revoked=await payload(await device('disconnect',{origin}));
  assert.equal(revoked.disconnected,true);
  assert.match(output(await payload(await req)).error,/explicitly disconnected/);
  assert.equal((await device('result',{id:cmd.id,origin,result:{success:true}})).status,409);
  assert.equal(output(await payload(await rpc('tools/call',call('browser_status')))).connected,false);
  assert.equal((await device('disconnect',{origin:'https://evil.test'})).status,403);
}));

test('MCP protocol and content-type validation fail closed',()=>testGateway(async({post})=>{
  const ping={jsonrpc:'2.0',id:1,method:'ping'};
  assert.equal((await post('/mcp',ping,mcpToken,{'MCP-Protocol-Version':'2099-01-01'})).status,400);
  assert.equal((await post('/mcp',ping,mcpToken,{'Content-Type':'text/plain'})).status,415);
  const acceptable=await post('/mcp',ping,mcpToken,{'MCP-Protocol-Version':'2025-11-25'});
  assert.equal(acceptable.status,200);
  assert.deepEqual((await acceptable.json()).result,{});
}));

test('Demo endpoints challenge unauthenticated callers without leaking page content',()=>testGateway(async({base})=>{
  const auth='Basic '+Buffer.from('safari-demo:'+demoPassword).toString('base64');
  for(const path of ['/demo','/demo/product']){
    const publicReply=await fetch(base+path);
    assert.equal(publicReply.status,401);
    assert.equal((await publicReply.text()).length,0);
    assert.match(publicReply.headers.get('www-authenticate'),/^Basic /);
    for(const credential of ['Bearer '+mcpToken,'Bearer '+deviceToken,'Basic '+Buffer.from('safari-demo:wrong').toString('base64')]){
      assert.equal((await fetch(base+path,{headers:{Authorization:credential}})).status,401);
    }
    const good=await fetch(base+path,{headers:{Authorization:auth}});
    assert.equal(good.status,200);
    assert.match(good.headers.get('content-security-policy'),/form-action 'none'/);
    assert.match(await good.text(),/Demo|demo/);
  }
  const catalog=await (await fetch(base+'/demo',{headers:{Authorization:auth}})).text();
  assert.ok(catalog.includes("href='/demo/product'"));
  assert.match(await (await fetch(base+'/demo/product',{headers:{Authorization:auth}})).text(),/type="time"/);
}));
test('Demo is hidden when demo password is not configured',()=>testGateway(async({base})=>{
  assert.equal((await fetch(base+'/demo')).status,404);
},{demoPassword:undefined}));

// --- Tab-scoped device sessions (D-017, D-023) --------------------------------
// The session used to be keyed on origin alone, so two tabs of one site both
// held it and either could claim a queued command. These tests pin the three
// properties that fix depends on: identity is required, a command reaches only
// the tab it was issued to, and a hidden tab is never given work.
const second='tab-second-2';

test('Device calls without a per-tab instanceId are refused',()=>testGateway(async({post})=>{
  const raw=(name,body)=>post('/device/'+name,body,deviceToken);
  assert.equal((await raw('poll',{origin})).status,400);
  assert.equal((await raw('disconnect',{origin})).status,400);
  assert.equal((await raw('result',{id:'x',origin,result:{success:true}})).status,400);
  // A syntactically impossible id is refused as firmly as a missing one.
  assert.equal((await raw('poll',{origin,instanceId:'short'})).status,400);
  assert.equal((await raw('poll',{origin,instanceId:'bad id with spaces'})).status,400);
}));

test('Same-origin second tab is refused, told who owns the session, and cannot claim the command',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  const inflight=inFlight(rpc('tools/call',call('browser_inspect'),20));
  const rejected=await device('poll',{origin,instanceId:second});
  assert.equal(rejected.status,409);
  const body=await payload(rejected);
  // D-017: the losing panel must be able to name the owner and see a way out.
  assert.equal(body.code,'DEVICE_SESSION_CONFLICT');
  assert.equal(body.activeOrigin,origin);
  assert.equal(body.activeInstanceId,'tab-primary-1');
  assert.equal(body.sameOrigin,true);
  assert.equal(body.canTakeOver,true);
  assert.ok(body.staleAfterMs>0);
  // D-023: the command belongs to the tab it was issued to, not to whichever
  // tab polls first. The rival tab cannot claim it even by racing.
  const cmd=await awaitCommand(device,origin);
  assert.equal(cmd.action,'browser_inspect');
  assert.equal((await device('result',{id:cmd.id,origin,instanceId:second,result:{success:true}})).status,403);
  assert.equal((await device('result',{id:cmd.id,origin,result:{success:true,data:{ok:true}}})).status,200);
  assert.equal(output(await payload(await inflight)).data.ok,true);
}));

test('Conflicting different-origin tab is named so the user can find it',()=>testGateway(async({device})=>{
  await device('poll',{origin});
  const body=await payload(await device('poll',{origin:'https://other.example',instanceId:second}));
  assert.equal(body.activeOrigin,origin);
  assert.equal(body.sameOrigin,false);
},{allowedOrigins:[origin,'https://other.example']}));

test('Explicit takeover moves the session and revokes the previous tab work',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  const abandoned=inFlight(rpc('tools/call',call('browser_click',{ref:'e1'}),21));
  const cmd=await awaitCommand(device,origin);
  // Takeover is operator-driven and explicit; an ordinary poll still conflicts.
  assert.equal((await device('poll',{origin,instanceId:second})).status,409);
  const taken=await payload(await device('poll',{origin,instanceId:second,takeover:true}));
  assert.equal(taken.command,null);
  // Work queued for the tab the operator walked away from must not survive the
  // handover - it was approved, if at all, against a page they are not seeing.
  assert.match(output(await payload(await abandoned)).error,/taken over/);
  assert.equal((await device('result',{id:cmd.id,origin,instanceId:second,result:{success:true}})).status,409);
  const status=output(await payload(await rpc('tools/call',call('browser_status'),22)));
  assert.equal(status.activeInstanceId,second);
  // Roles are now reversed: the original tab is the one that must take over.
  assert.equal((await device('poll',{origin})).status,409);
}));

test('A hidden tab is never given a command and the caller fails fast',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  const idle=await payload(await device('poll',{origin,visibility:'hidden'}));
  // command:null, not an error: the session is healthy, it just must not act.
  assert.equal(idle.command,null);
  assert.equal(idle.paused,'hidden');
  assert.equal(output(await payload(await rpc('tools/call',call('browser_status'),30))).connected,true);
  // SAFETY: approval must never be requested in a tab the operator cannot see,
  // so the call is refused outright rather than queued to time out as
  // "outcome may be uncertain" - the one failure class that cannot be retried.
  const refused=await payload(await rpc('tools/call',call('browser_click',{ref:'e1'}),31));
  assert.equal(refused.result.isError,true);
  assert.match(output(refused).error,/not visible/);
  // Returning to the tab restores normal operation immediately.
  await device('poll',{origin});
  const inflight=inFlight(rpc('tools/call',call('browser_inspect'),32));
  const cmd=await awaitCommand(device,origin);
  assert.equal(cmd.action,'browser_inspect');
  await device('result',{id:cmd.id,origin,result:{success:true,data:{ok:true}}});
  assert.equal(output(await payload(await inflight)).data.ok,true);
}));

test('A command already queued is withheld while the tab is hidden, then delivered on return',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  const waiting=inFlight(rpc('tools/call',call('browser_inspect'),40));
  // Poll repeatedly as hidden: the queued command must stay unclaimed however
  // many times a backgrounded tab asks for it.
  for(let i=0;i<5;i++){
    const idle=await payload(await device('poll',{origin,visibility:'hidden'}));
    assert.equal(idle.command,null,'hidden tab must never receive a command');
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  const cmd=await awaitCommand(device,origin);
  assert.equal(cmd.action,'browser_inspect');
  await device('result',{id:cmd.id,origin,result:{success:true,data:{ok:true}}});
  assert.equal(output(await payload(await waiting)).data.ok,true);
},{commandTimeoutMs:5000}));

test('One tab cannot disconnect another tab session',()=>testGateway(async({device,rpc})=>{
  await device('poll',{origin});
  const foreign=await device('disconnect',{origin,instanceId:second});
  assert.equal(foreign.status,409);
  assert.equal((await payload(foreign)).activeInstanceId,'tab-primary-1');
  assert.equal(output(await payload(await rpc('tools/call',call('browser_status')))).connected,true);
  assert.equal((await payload(await device('disconnect',{origin}))).disconnected,true);
}));

// --- Per-origin capability modes and gateway-delivered policy (D-020, D-025) --
// The gateway owns only the TUNABLE half of policy. These tests pin three
// properties: an unlisted origin is read-only, each mode gates exactly the
// tools it should, and the policy the bridge acts on actually reaches it.
const other='https://other.example';

test('An origin with no site policy is read-only, not permissive',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  // Observation is still allowed: read-only is about ACTING, not about the
  // page-text disclosure, which is what allowlisting the origin consented to.
  const inflight=inFlight(rpc('tools/call',call('browser_inspect'),50));
  const cmd=await awaitCommand(device,origin);
  await device('result',{id:cmd.id,origin,result:{success:true,data:{ok:true}}});
  assert.equal(output(await payload(await inflight)).data.ok,true);
  for(const [tool,args] of [['browser_fill',{ref:'e1',value:'x'}],['browser_click',{ref:'e1'}],
                            ['browser_navigate',{url:origin+'/p'}]]){
    const refused=await payload(await rpc('tools/call',call(tool,args),51));
    assert.equal(refused.result.isError,true,tool);
    assert.match(output(refused).error,/not permitted|site mode: read-only/,tool);
  }
},{sitePolicy:undefined}));

test('fill-only permits fills and navigation but never a click',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  const filling=inFlight(rpc('tools/call',call('browser_fill',{ref:'e1',value:'hello'}),52));
  const cmd=await awaitCommand(device,origin);
  assert.equal(cmd.action,'browser_fill');
  await device('result',{id:cmd.id,origin,result:{success:true,data:{action:'fill'}}});
  assert.equal(output(await payload(await filling)).data.action,'fill');
  const refused=await payload(await rpc('tools/call',call('browser_click',{ref:'e1'}),53));
  assert.equal(refused.result.isError,true);
  assert.match(output(refused).error,/site mode: fill-only/);
},{sitePolicy:{[origin]:'fill-only'}}));

test('trusted is the only mode that unlocks clicking, and it is per-origin',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin:other});
  // other.example is allowlisted for connection but NOT nominated as trusted.
  const refused=await payload(await rpc('tools/call',call('browser_click',{ref:'e1'}),54));
  assert.match(output(refused).error,/site mode: read-only/);
  const status=output(await payload(await rpc('tools/call',call('browser_status'),55)));
  assert.equal(status.activeMode,'read-only');
  // Same gateway, same device session, a different origin: trusted.
  await device('poll',{origin,takeover:true});
  const clicking=inFlight(rpc('tools/call',call('browser_click',{ref:'e1'}),56));
  const cmd=await awaitCommand(device,origin);
  assert.equal(cmd.action,'browser_click');
  await device('result',{id:cmd.id,origin,result:{success:true,dispatched:true,verified:false}});
  assert.equal(output(await payload(await clicking)).dispatched,true);
},{allowedOrigins:[origin,other],sitePolicy:{[origin]:'trusted'}}));

test('Every poll carries the policy for the ASKING origin, including idle and hidden ones',()=>testGateway(async({device})=>{
  const idle=await payload(await device('poll',{origin}));
  assert.equal(idle.command,null);
  assert.equal(idle.policy.mode,'trusted');
  assert.equal(idle.policy.grants,true);
  assert.ok(idle.policy.version,'policy must be versioned so the bridge can drop grants on change');
  // A hidden tab still gets policy: revoking trust must take effect within one
  // poll interval even while the tab is backgrounded.
  const hidden=await payload(await device('poll',{origin,visibility:'hidden'}));
  assert.equal(hidden.paused,'hidden');
  assert.equal(hidden.policy.mode,'trusted');
  // A poll is only ever answered with policy for the origin that asked, so a
  // response to this tab cannot set a different site's mode.
  const elsewhere=await payload(await device('poll',{origin:other,instanceId:second,takeover:true}));
  assert.equal(elsewhere.policy.mode,'read-only');
},{allowedOrigins:[origin,other],sitePolicy:{[origin]:'trusted'}}));

test('Standing grants can be switched off centrally but never switched on',()=>testGateway(async({device})=>{
  const idle=await payload(await device('poll',{origin}));
  // `grants:false` can only REMOVE the "Always allow" option from the local
  // dialog. There is no field by which the gateway creates a grant itself:
  // the wire format carries a boolean, never a list of granted classes.
  assert.equal(idle.policy.grants,false);
  assert.deepEqual(Object.keys(idle.policy).sort(),['grants','mode','version']);
},{standingGrants:false}));

test('Site policy configuration is validated and must not exceed the origin allowlist',()=>{
  const base={clientToken:mcpToken,deviceToken,allowedOrigins:[origin]};
  assert.throws(()=>createGateway({...base,sitePolicy:{'https://unlisted.example':'trusted'}}),/not an allowed origin/);
  assert.throws(()=>createGateway({...base,sitePolicy:{[origin]:'full-access'}}),/Unknown site mode/);
  assert.throws(()=>createGateway({...base,sitePolicy:{'https://example.org/path':'trusted'}}),/exact HTTP\(S\) origin/);
  // The string form is what the launcher passes through from the environment.
  assert.ok(createGateway({...base,sitePolicy:`${origin}=fill-only`}));
});

test('A stale session is replaced without takeover once it ages out',()=>testGateway(async({device,rpc})=>{
  await device('poll',{origin});
  await new Promise(resolve=>setTimeout(resolve,80));
  // No takeover flag. An abandoned or suspended tab must not hold the device
  // for ever; staleness is the automatic release the operator never has to ask for.
  const body=await payload(await device('poll',{origin,instanceId:second}));
  assert.equal(body.command,null);
  assert.equal(output(await payload(await rpc('tools/call',call('browser_status')))).activeInstanceId,second);
},{deviceFreshMs:40}));

// --- The session follows the visible tab (D-033) -----------------------------
// The operator's expectation is "configure the site once, then whichever tab I
// am looking at is the live one". These tests pin BOTH halves of that: the
// transfer that must happen, and - more importantly - the four cases where it
// must not, because each one of those is a route back to the D-023 defect of a
// command being claimed by a tab the operator cannot see.
const third='tab-third-3';
const activeInstance=async rpc=>output(await payload(await rpc('tools/call',call('browser_status')))).activeInstanceId;

test('The session follows a visible tab when the owner has gone hidden (D-033)',()=>testGateway(async({device,rpc})=>{
  await device('poll',{origin});
  // The owner reports itself hidden. This is the poll src/remote.js fires from
  // visibilitychange; it is what makes the handover immediate instead of
  // waiting out the 45s freshness window.
  assert.equal((await payload(await device('poll',{origin,visibility:'hidden'}))).paused,'hidden');
  // No takeover flag, no operator action: the second tab simply polls.
  const followed=await payload(await device('poll',{origin,instanceId:second}));
  assert.equal(followed.command,null);
  assert.equal(followed.policy.mode,'trusted');
  assert.equal(await activeInstance(rpc),second);
  // And it keeps working: the new owner can be given a command straight away.
  const inflight=inFlight(rpc('tools/call',call('browser_inspect'),60));
  const cmd=await awaitCommand(device,origin,{instanceId:second});
  await device('result',{id:cmd.id,origin,instanceId:second,result:{success:true,data:{ok:true}}});
  assert.equal(output(await payload(await inflight)).data.ok,true);
}));

test('A VISIBLE owner is never displaced automatically; that still needs Take over',()=>testGateway(async({device,rpc})=>{
  await device('poll',{origin});
  // Two tabs on screen at once (Split View, or a second window) is a genuine
  // conflict: the gateway cannot tell which one the operator means, so it must
  // not guess. This is the single most important negative case in D-033.
  const refused=await device('poll',{origin,instanceId:second});
  assert.equal(refused.status,409);
  const body=await payload(refused);
  assert.equal(body.sameOrigin,true);
  assert.equal(body.activeVisibility,'visible');
  assert.equal(body.canTakeOver,true);
  assert.equal(await activeInstance(rpc),'tab-primary-1');
  // The explicit operator action still works, unchanged.
  assert.equal((await payload(await device('poll',{origin,instanceId:second,takeover:true}))).command,null);
  assert.equal(await activeInstance(rpc),second);
}));

// D-035. Found on an iPad 2026-10-11, once in eight visibility transitions,
// with the two requests a millisecond apart. visibility is read when a poll is
// BUILT, so a poll built while visible can still be in flight when the tab goes
// hidden; it then races the out-of-band hidden notification. Arrival order is
// not send order, and the tab stops polling once hidden, so a stale arrival
// would pin the gateway's view at 'visible' for the whole freshness window -
// blocking sessionFollows and forcing a manual Take over.
//
// Headless browsers do not suspend tabs, so the race cannot be reproduced in
// the browser suites. These tests pin the GATEWAY's ordering rule instead,
// which is where the guarantee actually lives.
const activeVisibility=async rpc=>output(await payload(await rpc('tools/call',call('browser_status')))).activeVisibility;

test('A stale poll cannot rewrite a tab visibility that a newer poll already set',()=>testGateway(async({device,rpc})=>{
  assert.equal((await device('poll',{origin,visibility:'visible',seq:4})).status,200);
  // The tab goes hidden and says so.
  assert.equal((await device('poll',{origin,visibility:'hidden',seq:5})).status,200);
  assert.equal(await activeVisibility(rpc),'hidden');
  // Now the overtaken request lands. It is a legitimate request - merely older.
  const late=await device('poll',{origin,visibility:'visible',seq:4});
  assert.equal(late.status,200,'a stale poll is still a valid request and must be answered');
  assert.equal(await activeVisibility(rpc),'hidden','a lower sequence must not resurrect "visible"');
  // And the safety gate must follow the same truth: a stale 'visible' poll is
  // told there is nothing to do, exactly as the hidden tab it really comes from
  // would be. Without this the gate would hand work to a tab now off screen.
  assert.equal((await payload(await device('poll',{origin,visibility:'visible',seq:3}))).paused,'hidden');
  // Once the tab genuinely returns - a NEWER sequence - everything resumes.
  await device('poll',{origin,visibility:'visible',seq:6});
  assert.equal(await activeVisibility(rpc),'visible');
  const inflight=inFlight(rpc('tools/call',call('browser_inspect'),9));
  const cmd=await awaitCommand(device,origin,{visibility:'visible',seq:7});
  assert.equal(cmd.action,'browser_inspect');
  await device('result',{id:cmd.id,origin,result:{success:true,data:{url:origin}}});
  await inflight;
}));

test('Sequence ordering is per tab, and a bridge that sends none still works',()=>testGateway(async({device,rpc})=>{
  await device('poll',{origin,visibility:'visible',seq:9});
  await device('poll',{origin,visibility:'hidden',seq:10});
  // A DIFFERENT tab's counter means nothing here: counters are per tab, so a
  // low number from a new claimant must not read as stale and be ignored.
  assert.equal((await device('poll',{origin,instanceId:second,visibility:'visible',seq:1})).status,200);
  assert.equal(await activeInstance(rpc),second);
  assert.equal(await activeVisibility(rpc),'visible');
  // An older bridge sends no counter at all. It gets the previous
  // last-writer-wins behaviour rather than being frozen out entirely.
  await device('poll',{origin,instanceId:second,visibility:'hidden'});
  assert.equal(await activeVisibility(rpc),'hidden');
  await device('poll',{origin,instanceId:second,visibility:'visible'});
  assert.equal(await activeVisibility(rpc),'visible');
  // A malformed counter is ignored rather than trusted, and cannot freeze the
  // record: these must still update, not be treated as stale.
  for(const bad of [0,-1,1.5,'7',null,{}]){
    await device('poll',{origin,instanceId:second,visibility:'hidden',seq:bad});
    assert.equal(await activeVisibility(rpc),'hidden',`seq ${JSON.stringify(bad)} must not be trusted as ordering`);
    await device('poll',{origin,instanceId:second,visibility:'visible',seq:bad});
    assert.equal(await activeVisibility(rpc),'visible',`seq ${JSON.stringify(bad)} must not freeze the record`);
  }
}));

test('A stale poll still proves the tab is alive',()=>testGateway(async({device,rpc})=>{
  // Liveness and visibility are different claims. A stale request cannot say
  // where the tab is NOW, but it does prove it was alive when it was sent, so
  // it must still refresh the session rather than let it age out.
  await device('poll',{origin,visibility:'visible',seq:2});
  await device('poll',{origin,visibility:'visible',seq:3});
  assert.equal(output(await payload(await rpc('tools/call',call('browser_status')))).connected,true);
  assert.equal((await device('poll',{origin,visibility:'visible',seq:2})).status,200);
  assert.equal(output(await payload(await rpc('tools/call',call('browser_status')))).connected,true);
}));

test('A hidden tab never takes the session, even from another hidden tab',()=>testGateway(async({device,rpc})=>{
  await device('poll',{origin});
  await device('poll',{origin,visibility:'hidden'});
  // The claimant cannot execute anything either, so handing it the session
  // would only move the problem. Only a tab that can act may become live.
  const refused=await device('poll',{origin,instanceId:second,visibility:'hidden'});
  assert.equal(refused.status,409);
  assert.equal((await payload(refused)).activeVisibility,'hidden');
  assert.equal(await activeInstance(rpc),'tab-primary-1');
  // Becoming visible is the whole and only qualification.
  await device('poll',{origin,instanceId:second});
  assert.equal(await activeInstance(rpc),second);
}));

test('A different origin is still a real conflict and never follows',()=>testGateway(async({device,rpc})=>{
  await device('poll',{origin});
  await device('poll',{origin,visibility:'hidden'});
  // Switching to a different allowlisted site is not "the same tab switch" -
  // it changes which site mode applies, so it stays an explicit decision.
  const refused=await device('poll',{origin:other,instanceId:second});
  assert.equal(refused.status,409);
  assert.equal((await payload(refused)).sameOrigin,false);
  assert.equal(await activeInstance(rpc),'tab-primary-1');
},{allowedOrigins:[origin,other],sitePolicy:{[origin]:'trusted'}}));

test('A command claimed by the losing tab cannot be completed after the session follows',()=>testGateway(async({device,rpc})=>{
  await device('poll',{origin});
  const abandoned=inFlight(rpc('tools/call',call('browser_click',{ref:'e1'}),61));
  const cmd=await awaitCommand(device,origin);
  // The tab backgrounds while holding a CLAIMED command - the operator walked
  // away mid-approval. The session follows to the tab now on screen.
  await device('poll',{origin,visibility:'hidden'});
  await device('poll',{origin,instanceId:second});
  assert.equal(await activeInstance(rpc),second);
  // The MCP caller is told, rather than being left to time out.
  assert.match(output(await payload(await abandoned)).error,/followed the visible tab/);
  // THE LOAD-BEARING ASSERTION. The losing tab posts the result it was about to
  // produce and is refused. src/remote.js dispatches a click or a navigation
  // only AFTER /device/result is accepted, so a revoked command can never reach
  // the page - which is what keeps two tabs from acting on one command.
  assert.equal((await device('result',{id:cmd.id,origin,result:{success:true,dispatched:true}})).status,409);
  // The new owner cannot answer for work it did not do either.
  assert.equal((await device('result',{id:cmd.id,origin,instanceId:second,result:{success:true}})).status,409);
}));

test('Rapid tab switching hands the session back and forth without stranding it',()=>testGateway(async({device,rpc})=>{
  await device('poll',{origin});
  // Six switches. Each one must leave exactly the visible tab live, and none
  // may leave the session held by a tab that reported itself hidden.
  for(const [leaving,arriving] of [['tab-primary-1',second],[second,third],[third,'tab-primary-1'],
                                   ['tab-primary-1',second],[second,third],[third,'tab-primary-1']]){
    await device('poll',{origin,instanceId:leaving,visibility:'hidden'});
    await device('poll',{origin,instanceId:arriving});
    assert.equal(await activeInstance(rpc),arriving,`${leaving} -> ${arriving}`);
  }
  // Still a usable session at the end, not a wedged one.
  const inflight=inFlight(rpc('tools/call',call('browser_inspect'),62));
  const cmd=await awaitCommand(device,origin);
  await device('result',{id:cmd.id,origin,result:{success:true,data:{ok:true}}});
  assert.equal(output(await payload(await inflight)).data.ok,true);
}));

test('A followed session is still refused work while the new owner is hidden',()=>testGateway(async({device,rpc})=>{
  await device('poll',{origin});
  await device('poll',{origin,visibility:'hidden'});
  await device('poll',{origin,instanceId:second});
  // Following must not be a back door around the visibility gate: the new owner
  // is subject to exactly the same refusal the old one was.
  await device('poll',{origin,instanceId:second,visibility:'hidden'});
  const refused=await payload(await rpc('tools/call',call('browser_click',{ref:'e1'}),63));
  assert.equal(refused.result.isError,true);
  assert.match(output(refused).error,/not visible/);
  assert.equal(await activeInstance(rpc),second);
}));
