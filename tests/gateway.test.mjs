/** Gateway behavior and negative-security tests. Uses real HTTP on loopback. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGateway} from '../gateway/server.mjs';
const mcpToken = 'M'.repeat(48), deviceToken = 'D'.repeat(48), demoPassword='P'.repeat(48), origin = 'https://example.org';
async function testGateway(fn, options={}) {
  const g=createGateway({clientToken:mcpToken,deviceToken,demoPassword,allowedOrigins:[origin],commandTimeoutMs:500,...options});
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

test('A stale session is replaced without takeover once it ages out',()=>testGateway(async({device,rpc})=>{
  await device('poll',{origin});
  await new Promise(resolve=>setTimeout(resolve,80));
  // No takeover flag. An abandoned or suspended tab must not hold the device
  // for ever; staleness is the automatic release the operator never has to ask for.
  const body=await payload(await device('poll',{origin,instanceId:second}));
  assert.equal(body.command,null);
  assert.equal(output(await payload(await rpc('tools/call',call('browser_status')))).activeInstanceId,second);
},{deviceFreshMs:40}));
