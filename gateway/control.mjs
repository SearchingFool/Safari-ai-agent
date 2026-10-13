/** Authenticated Mac/iPad controller. Separate lifetime and credential from MCP. */
import {createServer} from 'node:http';
import {connect} from 'node:net';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,lstatSync,chmodSync,mkdirSync,appendFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createGateway} from './server.mjs';
import {createDiagnostics} from './diagnostics.mjs';
const run=promisify(execFile);
export const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));

export function privateFile(path,make){
  try{if(!lstatSync(path).isFile())throw Error('Expected a regular private file');}
  catch(e){if(e.code!=='ENOENT')throw e;writeFileSync(path,make(),{flag:'wx',mode:0o600});}
  chmodSync(path,0o600);
  return readFileSync(path,'utf8');
}
export function controlPassword(root=ROOT){
  const password=privateFile(join(root,'.env.gateway-control'),()=>`CONTROL_PASSWORD=${randomBytes(32).toString('hex')}\n`);
  const match=/^CONTROL_PASSWORD=([a-f0-9]{64})\n?$/.exec(password);
  if(!match)throw Error('Invalid .env.gateway-control; expected CONTROL_PASSWORD and 64 hex characters');
  return match[1];
}
export function normalizeSites(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.autoStart!=='boolean'||!Array.isArray(raw.sites)||raw.sites.length>100)throw Error('Invalid settings');
  const sites=[],seen=new Set();
  for(const entry of raw.sites){
    if(!entry||typeof entry.url!=='string'||!['read-only','fill-only','trusted','ask'].includes(entry.mode))throw Error('Invalid website or permission mode');
    const url=new URL(entry.url);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Use an HTTP(S) webpage URL without a username or password');
    if(seen.has(url.origin))throw Error('This website is already in the list');
    seen.add(url.origin);sites.push({url:url.origin,mode:entry.mode});
  }
  return {autoStart:raw.autoStart,sites};
}
export function readSettings(root=ROOT){
  return normalizeSites(JSON.parse(privateFile(join(root,'.gateway-control.json'),()=>JSON.stringify({autoStart:false,sites:[]})+'\n')));
}
export function writeSettings(value,root=ROOT){
  const normalized=normalizeSites(value),path=join(root,'.gateway-control.json');
  privateFile(path,()=>JSON.stringify({autoStart:false,sites:[]})+'\n');
  const temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';
  writeFileSync(temp,JSON.stringify(normalized,null,2)+'\n',{flag:'wx',mode:0o600});
  renameSync(temp,path);return normalized;
}
function occupied(port){
  return new Promise(resolve=>{
    const socket=connect({port,host:'127.0.0.1'});
    let done=false;const finish=value=>{if(done)return;done=true;socket.destroy();resolve(value);};
    socket.setTimeout(500,()=>finish(true));socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));
  });
}
export function portConfigured(config,port){
  if(config?.TCP?.[String(port)])return true;
  return Object.values(config?.Foreground||{}).some(c=>portConfigured(c,port));
}
async function listen(server,port){
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
}
export async function stopChild(child){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  await new Promise((resolve,reject)=>{
    let settled=false,forceTimer;
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(forceTimer);error?reject(error):resolve();};
    const timer=setTimeout(()=>{
      child.kill('SIGKILL');forceTimer=setTimeout(()=>finish(Error('Owned forwarding process did not stop')),1000);
    },4000);
    child.once('exit',()=>finish());child.once('close',()=>finish());
    // A process that failed to spawn emits close, not necessarily exit.
    if(!child.kill('SIGTERM')&&!child.pid)finish();
  });
}
export function createManager({root=ROOT,host,ts,port=8787,makeGateway=createGateway,spawnProcess=spawn,runTs=run}={}){
  let gateway=null,funnel=null,awake=null,phase='stopped',lastError='',busy=false;
  let config=readSettings(root);
  const tsEnv={...process.env,TAILSCALE_BE_CLI:'1'};
  async function tsConfig(){return JSON.parse((await runTs(ts,['serve','status','--json'],{env:tsEnv})).stdout);}
  function readCredentials(){
    // Do not source a secrets file as shell code. The existing launcher owns its creation.
    const text=privateFile(join(root,'.env.mac-tailscale'),()=>{
      return ['MCP_CLIENT_TOKEN','DEVICE_TOKEN','DEMO_PASSWORD'].map(k=>`${k}=${randomBytes(32).toString('hex')}\n`).join('');
    });
    const lines=text.trim().split('\n');const out={};
    if(lines.length!==3)throw Error('Invalid gateway credentials file');
    for(const line of lines){const m=/^(MCP_CLIENT_TOKEN|DEVICE_TOKEN|DEMO_PASSWORD)=([a-f0-9]{64})$/.exec(line);if(!m||out[m[1]])throw Error('Invalid gateway credentials file');out[m[1]]=m[2];}
    if(new Set(Object.values(out)).size!==3)throw Error('Gateway credentials must be distinct');return out;
  }
  async function status(){
    const external=!gateway&&await occupied(port);
    return {phase:external?'external':phase,error:lastError,busy,settings:config,
      localUrl:'http://127.0.0.1:8788',controlUrl:`https://${host}:8443`,
      gatewayUrl:`https://${host}`,mcpUrl:`https://${host}/mcp`,demoUrl:`https://${host}/demo`,installUrl:`https://${host}/install/safari-ai-agent-remote.user.js`,
      browser:gateway?.status()||null,readEverywhere:true};
  }
  async function stopInternal(){
    phase='stopping';
    // End the owned public exposure before stopping its HTTP service. Never reset Tailscale.
    await stopChild(funnel);funnel=null;
    if(gateway){await gateway.close();gateway=null;}
    await stopChild(awake);awake=null;phase='stopped';
  }
  async function startInternal(){
    if(gateway)return;
    if(await occupied(port))throw Error('A gateway is already running in Terminal. Stop that launcher with Ctrl+C first; this panel will not stop a process it did not start.');
    if(portConfigured(await tsConfig(),443))throw Error('Tailscale HTTPS port 443 is already in use. Stop the previous gateway launcher first.');
    phase='starting';lastError='';
    try{
      const credentials=readCredentials(),demoOrigin=`https://${host}`;
      const modes=Object.fromEntries(config.sites.map(s=>[s.url,s.mode]));
      // The harmless demo remains usable; real sites receive only selected rights.
      if(!modes[demoOrigin])modes[demoOrigin]='trusted';
      const allowed=Object.keys(modes);
      mkdirSync(join(root,'logs'),{recursive:true});
      gateway=makeGateway({clientToken:credentials.MCP_CLIENT_TOKEN,deviceToken:credentials.DEVICE_TOKEN,
        demoPassword:credentials.DEMO_PASSWORD,allowedOrigins:allowed,sitePolicy:modes,readAnyOrigin:true,defaultSiteMode:'ask',routineActions:true,
        diagnostics:createDiagnostics({enabled:true,clientTokenLength:64,deviceTokenLength:64,allowedOrigins:allowed,
          append:line=>appendFileSync(join(root,'logs/gateway-diagnostics.jsonl'),line,{mode:0o600})})});
      await listen(gateway.server,port);
      const log=join(root,'logs/gateway-control.log');
      funnel=spawnProcess(ts,['funnel','--https=443',String(port)],{env:tsEnv,stdio:['ignore','pipe','pipe']});
      const child=funnel;
      for(const stream of [child.stdout,child.stderr])stream?.on('data',data=>appendFileSync(log,data,{mode:0o600}));
      // A failed Funnel must not leave the panel claiming the gateway is running.
      child.once('error',e=>{lastError=`Cannot start HTTPS forwarding: ${e.message}`;void stopInternal();});
      child.once('exit',()=>{if(funnel===child&&phase!=='stopping'){lastError='HTTPS forwarding stopped. Start the gateway again.';void stopInternal();}});
      awake=spawnProcess('/usr/bin/caffeinate',['-i'],{stdio:'ignore'});
      awake.once('error',()=>{lastError='Gateway is running, but automatic sleep prevention is unavailable.';});
      phase='running';
    }catch(e){await stopInternal();throw e;}
  }
  async function operation(fn){
    if(busy)throw Error('Another change is in progress. Please wait.');busy=true;
    try{await fn();}catch(e){lastError=e.message;throw e;}finally{busy=false;}
    return status();
  }
  return {status,start:()=>operation(startInternal),stop:()=>operation(stopInternal),
    save:raw=>operation(async()=>{
      const next=normalizeSites(raw);const wasRunning=Boolean(gateway);
      // A restart cancels pending commands and discards old policy/grants.
      writeSettings(next,root);config=next;
      if(wasRunning){await stopInternal();await startInternal();}
    }),autoStart:()=>config.autoStart,close:()=>operation(stopInternal)};
}
const same=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createControl({password,manager,origins,uiRoot=join(ROOT,'gateway/control-ui')}={}){
  if(!/^[a-f0-9]{64}$/.test(password))throw Error('A separate random control password is required');
  const allowed=new Set(origins),csrf=randomBytes(32).toString('hex');
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const hosts=new Set([...allowed].map(o=>new URL(o).host));
    if(!hosts.has(req.headers.host))return json(res,403,{error:'Unrecognised control-panel host'});
    const expected='Basic '+Buffer.from('safari-control:'+password).toString('base64');
    if(!same(req.headers.authorization,expected)){
      res.setHeader('WWW-Authenticate','Basic realm="Safari Gateway Controls", charset="UTF-8"');
      return json(res,401,{error:'Sign in with safari-control and your separate control password'});
    }
    try{
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET'&&path==='/api/status')return json(res,200,{...await manager.status(),csrf});
      if(req.method==='POST'&&['/api/start','/api/stop','/api/settings'].includes(path)){
        if(!allowed.has(req.headers.origin)||new URL(req.headers.origin).host!==req.headers.host||!same(req.headers['x-safari-csrf'],csrf))return json(res,403,{error:'Control-panel origin and confirmation token required'});
        if(req.headers['content-type']!=='application/json')return json(res,415,{error:'Expected JSON'});
        let body='',bytes=0;
        for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)return json(res,413,{error:'Settings too large'});body+=chunk;}
        const data=JSON.parse(body||'{}');
        const result=path==='/api/start'?await manager.start():path==='/api/stop'?await manager.stop():await manager.save(data);
        return json(res,200,{...result,csrf});
      }
      if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){
        const filename=path==='/'?'index.html':path.slice(1);
        const type=path==='/'?'text/html':path==='/app.js'?'text/javascript':'text/css';
        res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});return res.end(readFileSync(join(uiRoot,filename)));
      }
      return json(res,404,{error:'Not found'});
    }catch(e){return json(res,400,{error:e.message});}
  });
  return {server};
}

export async function main(){
  const ts=process.env.TAILSCALE_BIN||'/Applications/Tailscale.app/Contents/MacOS/Tailscale';
  const env={...process.env,TAILSCALE_BE_CLI:'1'};
  const raw=JSON.parse((await run(ts,['status','--json'],{env})).stdout);
  const host=String(raw.Self?.DNSName||'').replace(/\.$/,'');
  if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+\.ts\.net$/.test(host))throw Error('Sign in to Tailscale on this Mac first');
  const manager=createManager({host,ts});
  const control=createControl({password:controlPassword(),manager,origins:['http://127.0.0.1:8788','http://localhost:8788',`https://${host}:8443`]});
  await listen(control.server,8788);
  const config=JSON.parse((await run(ts,['serve','status','--json'],{env})).stdout);
  let remote=null;
  if(process.argv.includes('--local-only'))console.log('Local-only preview: iPad forwarding is disabled.');
  else if(portConfigured(config,8443))console.error('Port 8443 is in use; local controls work, but iPad controls were not started.');
  else{
    remote=spawn(ts,['funnel','--https=8443','8788'],{env,stdio:['ignore','inherit','inherit']});
    remote.on('error',e=>console.error('iPad controls unavailable:',e.message));
    remote.on('exit',()=>console.error('iPad control forwarding ended; reopen the Mac launcher to retry.'));
  }
  console.log(`Mac controls: http://127.0.0.1:8788\niPad controls: https://${host}:8443\nUsername: safari-control\nPassword: .env.gateway-control (not the MCP/device/demo credential)`);
  if(manager.autoStart())await manager.start().catch(e=>console.error(e.message));
  let closing=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{
    if(closing)return;closing=true;await manager.close();await stopChild(remote);
    control.server.close(()=>process.exit(0));
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
