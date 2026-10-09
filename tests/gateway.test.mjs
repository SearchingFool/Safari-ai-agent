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
  const device=(name,body,token=deviceToken)=>post('/device/'+name,body,token);
  try{return await fn({g,base,post,rpc,device})}finally{await g.close()}
}
const call=(name,args={})=>({name,arguments:args});
const payload=async r=>(await r.json());
const output=x=>JSON.parse(x.result.content[0].text);

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
  const inflight=rpc('tools/call',call('browser_inspect'),2);
  const cmd=(await payload(await device('poll',{origin}))).command;
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
  const waiting=rpc('tools/call',call('browser_inspect'),7);
  const busy=await payload(await rpc('tools/call',call('browser_fill',{ref:'e1',value:'x'}),8));
  assert.match(output(busy).error,/one in-flight/);
  const cmd=(await payload(await device('poll',{origin}))).command;
  await device('result',{id:cmd.id,origin,result:{success:false,error:'User denied'}});
  const done=await payload(await waiting);
  assert.equal(done.result.isError,true);
  assert.match(output(done).error,/denied/);
}));
test('Cancelled commands fail closed and cannot be replayed',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  const started=rpc('tools/call',call('browser_fill',{ref:'e1',value:'test'}),1);
  const cmd=(await payload(await device('poll',{origin}))).command;
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
  const req=rpc('tools/call',call('browser_navigate',{url:origin+'/page2'}),10);
  const cmd=(await payload(await device('poll',{origin}))).command;
  assert.equal(cmd.args.url,origin+'/page2');
  await device('result',{id:cmd.id,origin,result:{success:true,dispatched:true,verified:false}});
  const first=await payload(await req);
  assert.equal(output(first).verified,false);
  const inspect=rpc('tools/call',call('browser_inspect'),11);
  const next=(await payload(await device('poll',{origin}))).command;
  await device('result',{id:next.id,origin,result:{success:true,data:{url:origin+'/page2',title:'Page 2'}}});
  assert.equal(output(await payload(await inspect)).data.url,origin+'/page2');
}));

test('Device disconnect revokes pending commands and rejects old results',()=>testGateway(async({rpc,device})=>{
  await device('poll',{origin});
  const req=rpc('tools/call',call('browser_click',{ref:'e2'}),90);
  const cmd=(await payload(await device('poll',{origin}))).command;
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
  assert.match(catalog,/href='\\/demo\\/product'/);
  assert.match(await (await fetch(base+'/demo/product',{headers:{Authorization:auth}})).text(),/type="time"/);
}));
test('Demo is hidden when demo password is not configured',()=>testGateway(async({base})=>{
  assert.equal((await fetch(base+'/demo')).status,404);
},{demoPassword:undefined}));
