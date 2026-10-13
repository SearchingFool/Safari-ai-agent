import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,lstatSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {createServer,request as httpRequest} from 'node:http';
import {createControl,createManager,normalizeSites,readSettings,writeSettings,controlPassword,portConfigured,stopChild} from '../gateway/control.mjs';
const password='a'.repeat(64);
function fixture(){const root=mkdtempSync(join(tmpdir(),'safari-control-test-'));return {root,close:()=>rmSync(root,{recursive:true,force:true})};}
test('Website settings accept pasted page URLs, preserve least rights, and persist privately',()=>{
  const f=fixture();try{
    assert.deepEqual(readSettings(f.root),{autoStart:false,sites:[]});
    const value=writeSettings({autoStart:true,sites:[{url:'https://example.com/a?q=b',mode:'fill-only'}]},f.root);
    assert.equal(value.sites[0].url,'https://example.com');assert.deepEqual(readSettings(f.root),value);
    assert.equal(lstatSync(join(f.root,'.gateway-control.json')).mode&0o777,0o600);
    for(const sites of [[{url:'javascript:alert(1)',mode:'trusted'}],[{url:'https://u:p@example.com',mode:'trusted'}],
      [{url:'https://a.test',mode:'allow'}],[{url:'https://a.test',mode:'read-only'},{url:'https://a.test/b',mode:'trusted'}]]){
      assert.throws(()=>normalizeSites({autoStart:false,sites}));
    }
    assert.throws(()=>writeSettings({autoStart:'true',sites:[]},f.root));assert.deepEqual(readSettings(f.root),value);
  }finally{f.close();}
});
test('Controller password is separate, persistent, and refuses symlinked private files',()=>{
  const f=fixture();try{
    const first=controlPassword(f.root);assert.match(first,/^[a-f0-9]{64}$/);assert.equal(controlPassword(f.root),first);
    assert.equal(lstatSync(join(f.root,'.env.gateway-control')).mode&0o777,0o600);
    const target=join(f.root,'target');writeFileSync(target,'do not change');
    rmSync(join(f.root,'.env.gateway-control'));
    symlinkSync(target,join(f.root,'.env.gateway-control'));
    assert.throws(()=>controlPassword(f.root));assert.equal(readFileSync(target,'utf8'),'do not change');
  }finally{f.close();}
});
test('Private settings never follow a symlink',()=>{
  const f=fixture();try{const target=join(f.root,'target');writeFileSync(target,'original');symlinkSync(target,join(f.root,'.gateway-control.json'));
    assert.throws(()=>readSettings(f.root));assert.equal(readFileSync(target,'utf8'),'original');
  }finally{f.close();}
});
test('Port conflicts include foreground Tailscale sessions',()=>{
  assert.equal(portConfigured({Foreground:{session:{TCP:{443:{HTTPS:true}}}}},443),true);
  assert.equal(portConfigured({TCP:{8443:{HTTPS:true}}},443),false);
});
test('HTTP controls require separate authentication, same origin and CSRF for every mutation',async()=>{
  let starts=0,stops=0,saves=0;
  const manager={status:async()=>({phase:'stopped',settings:{autoStart:false,sites:[]}}),
    start:async()=>{starts++;return {};},stop:async()=>{stops++;return {};},save:async()=>{saves++;return {};}};
  // Reserve a random loopback port before creating the origin-restricted controller.
  const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));
  const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const base=`http://127.0.0.1:${port}`;
  const control=createControl({password,manager,origins:[base]});await new Promise(r=>control.server.listen(port,'127.0.0.1',r));
  const auth={Authorization:'Basic '+Buffer.from('safari-control:'+password).toString('base64')};
  const post=(path,headers={},body='{}')=>fetch(base+path,{method:'POST',headers:{...auth,'Content-Type':'application/json',...headers},body});
  try{
    assert.equal((await fetch(base+'/')).status,401);
    assert.equal((await fetch(base+'/api/status',{headers:{Authorization:'Bearer '+password}})).status,401);
    const response=await fetch(base+'/',{headers:auth});assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.doesNotMatch(await response.text(),new RegExp(password));
    const state=await (await fetch(base+'/api/status',{headers:auth})).json();
    for(const path of ['/api/start','/api/stop','/api/settings']){
      assert.equal((await post(path)).status,403);
      assert.equal((await post(path,{Origin:'https://evil.test','X-Safari-CSRF':state.csrf})).status,403);
      assert.equal((await post(path,{Origin:base,'X-Safari-CSRF':'wrong'})).status,403);
    }
    const headers={Origin:base,'X-Safari-CSRF':state.csrf};
    assert.equal((await post('/api/start',headers)).status,200);
    assert.equal((await post('/api/stop',headers)).status,200);
    assert.equal((await post('/api/settings',headers)).status,200);
    assert.deepEqual([starts,stops,saves],[1,1,1]);
    assert.equal((await post('/api/settings',headers,'x'.repeat(17000))).status,413);
    assert.equal((await fetch(base+'/../../.env.mac-tailscale',{headers:auth})).status,404);
    // Node fetch rewrites Host; use raw HTTP to actually send the hostile host.
    const hostile=await new Promise((resolve,reject)=>{
      const req=httpRequest(base+'/api/status',{headers:{...auth,Host:'attacker.test'}},res=>{res.resume();resolve(res.statusCode);});
      req.on('error',reject);req.end();
    });
    assert.equal(hostile,403);
  }finally{await new Promise(r=>control.server.close(r));}
});
function fakeChild(){
  const child=new EventEmitter();child.exitCode=null;child.signalCode=null;child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  child.kill=signal=>{child.signalCode=signal;queueMicrotask(()=>child.emit('exit',null,signal));};return child;
}
test('A failed spawn cannot leave Stop waiting forever for an exit event',async()=>{
  const child=new EventEmitter();child.exitCode=null;child.signalCode=null;child.kill=()=>false;
  await stopChild(child);
});
test('Managed gateway start, settings restart, read-everywhere and stop use real HTTP',async()=>{
  const f=fixture(),children=[];
  const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const manager=createManager({root:f.root,host:'mac.tail1234.ts.net',ts:'/fake/tailscale',port,
    runTs:async()=>({stdout:'{}'}),spawnProcess:()=>{const c=fakeChild();children.push(c);return c;}});
  const base=`http://127.0.0.1:${port}`;
  try{
    await manager.start();assert.equal((await manager.status()).phase,'running');
    const creds=Object.fromEntries(readFileSync(join(f.root,'.env.mac-tailscale'),'utf8').trim().split('\n').map(line=>line.split('=')));
    const device=body=>fetch(base+'/device/poll',{method:'POST',headers:{Authorization:'Bearer '+creds.DEVICE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({origin:'https://unlisted.test',instanceId:'test-tab-one',visibility:'visible',...body})});
    const first=await device();assert.equal(first.status,200);assert.equal((await first.json()).policy.mode,'read-only');
    await manager.save({autoStart:true,sites:[{url:'https://unlisted.test/page',mode:'trusted'}]});
    assert.equal(children.length,4);assert.equal(children[0].signalCode,'SIGTERM');
    assert.equal((await (await device()).json()).policy.mode,'trusted');
    await manager.stop();assert.equal((await manager.status()).phase,'stopped');assert.equal(children[2].signalCode,'SIGTERM');
    assert.equal(manager.autoStart(),true);
  }finally{await manager.close();f.close();}
});
test('An existing server is reported but never stopped or replaced by the controller',async()=>{
  const f=fixture(),external=createServer((req,res)=>res.end('external'));
  await new Promise(r=>external.listen(0,'127.0.0.1',r));const port=external.address().port;
  const manager=createManager({root:f.root,host:'mac.tail1234.ts.net',ts:'/fake',port,spawnProcess:()=>{throw Error('Must not spawn');}});
  try{assert.equal((await manager.status()).phase,'external');await assert.rejects(manager.start(),/already running/);
    await manager.stop();assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(),'external');
  }finally{await manager.close();await new Promise(r=>external.close(r));f.close();}
});
