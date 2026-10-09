/**
 * Safari AI Agent MCP gateway. Node 22+, no third-party dependencies.
 * Provides a single-device browser tool bridge using MCP Streamable HTTP.
 * Deployment MUST terminate TLS before reaching this process; on the local machine
 * it binds to loopback. No webpage or model-provided code is ever evaluated.
 *
 * This is a development reference implementation, not an exposed multi-user service.
 */
import {createServer} from 'node:http';
import {randomUUID, timingSafeEqual} from 'node:crypto';
import {serveDemo} from './demo-pages.mjs';

const MAX_REQUEST_BYTES = 65536;
const PROTOCOL = '2025-11-25'; // Broadly implemented compatibility target.
const METHODS = ['browser_inspect','browser_fill','browser_click','browser_navigate','browser_verify','browser_status','browser_cancel'];
const TOOL_DEFS = [
  {name:'browser_inspect',description:'Inspect visible page content and controls in the paired iPad Safari tab.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'browser_fill',description:'Fill a referenced text, time, select or editable field. Requires current browser_inspect.',inputSchema:{type:'object',properties:{ref:{type:'string'},value:{type:'string'}},required:['ref','value'],additionalProperties:false}},
  {name:'browser_click',description:'Click a referenced control; requires explicit local confirmation on iPad. Submission is blocked by default.',inputSchema:{type:'object',properties:{ref:{type:'string'}},required:['ref'],additionalProperties:false}},
  {name:'browser_navigate',description:'Navigate only to an approved same-origin HTTP(S) URL; verify by inspecting after navigation.',inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url'],additionalProperties:false}},
  {name:'browser_verify',description:'Verify visible page text or URL contains expected substring.',inputSchema:{type:'object',properties:{textIncludes:{type:'string'},urlIncludes:{type:'string'}},additionalProperties:false}},
  {name:'browser_status',description:'Get iPad connection and gateway queue status.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'browser_cancel',description:'Cancel queued browser actions; an action already running may not be reversible.',inputSchema:{type:'object',properties:{},additionalProperties:false}}
];
const json = (res,code,value) => {res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
const fail = (res,code,message)=>json(res,code,{error:message});
function tokenMatches(header, expected){
  if (!expected || typeof header!=='string'||!header.startsWith('Bearer '))return false;
  const a=Buffer.from(header.slice(7));const b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}
async function readBody(req){
  const chunks=[];let size=0;
  for await (const chunk of req){size+=chunk.length;if(size>MAX_REQUEST_BYTES)throw new Error('Request too large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function toolError(message){return {isError:true,content:[{type:'text',text:JSON.stringify({success:false,error:message})}]};}
function toolOK(value){return {content:[{type:'text',text:JSON.stringify(value)}]};}
function validate(args,tool,allowed){
  if(!args||typeof args!=='object'||Array.isArray(args))return 'Arguments must be an object';
  const def=TOOL_DEFS.find(t=>t.name===tool);if(!def)return 'Unknown tool';
  if(Object.keys(args).some(k=>!Object.hasOwn(def.inputSchema.properties,k)))return 'Unknown argument';
  if((def.inputSchema.required||[]).some(k=>typeof args[k]!=='string'))return 'Missing required string argument';
  if(Object.values(args).some(v=>typeof v!=='string'||v.length>10000))return 'Invalid argument';
  if(args.ref && !/^e\d{1,3}$/.test(args.ref))return 'Invalid element reference';
  if(tool==='browser_navigate'){
    try{const u=new URL(args.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!allowed.has(u.origin))return 'Destination not allowed';}
    catch{return 'Invalid navigation URL';}
  }
  if(tool==='browser_verify' && !args.textIncludes && !args.urlIncludes)return 'Specify textIncludes or urlIncludes';
  return null;
}
export function createGateway({clientToken,deviceToken,allowedOrigins,commandTimeoutMs=25000,deviceFreshMs=45000,clock=()=>Date.now()}={}) {
  if(!clientToken||!deviceToken||clientToken===deviceToken||clientToken.length<24||deviceToken.length<24)throw Error('Two distinct random tokens of at least 24 characters required');
  const allowed=new Set(allowedOrigins||[]);
  if(allowed.size===0||[...allowed].some(x=>{try{return new URL(x).origin!==x||!/^https?:/.test(x)}catch{return true}}))throw Error('Provide exact HTTP(S) allowed origins');
  const pending=new Map(); let current=null;let lastPoll=0;let generation=0;
  const status=()=>({connected:clock()-lastPoll<deviceFreshMs,activeOrigin:current?.origin||null,queueDepth:pending.size,generation});
  function dispose(id){const p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);}
  function cancelAll(reason='Cancelled'){
    for(const [id,p] of pending){p.resolve(toolError(reason));dispose(id);}generation++;
  }
  async function call(tool,args){
    if(tool==='browser_status')return toolOK(status());
    if(tool==='browser_cancel'){cancelAll();return toolOK({success:true,cancelled:true});}
    const err=validate(args,tool,allowed);if(err)return toolError(err);
    if(!status().connected)return toolError('No active iPad Safari device. Open the test tab and enable Remote Control.');
    if(pending.size>=1)return toolError('Only one in-flight action allowed');
    const id=randomUUID();
    return await new Promise(resolve=>{
      const item={id,action:tool,args,origin:current.origin,issuedAt:clock(),expiresAt:clock()+commandTimeoutMs,claimed:false,resolve,timer:null};
      item.timer=setTimeout(()=>{resolve(toolError('Device command timed out; action outcome may be uncertain. Inspect again.'));dispose(id);},commandTimeoutMs);
      pending.set(id,item);
    });
  }
  async function router(req,res){
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/health'&&req.method==='GET')return json(res,200,{ok:true});
      if(serveDemo(req,res,url.pathname))return;
      if(url.pathname==='/mcp'){
        if(req.headers.origin)return fail(res,403,'Browser Origin not accepted for MCP');
        if(!tokenMatches(req.headers.authorization,clientToken))return fail(res,401,'Unauthorized MCP caller');
        if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(res,405,'POST only');}
        // Enforce the legacy Streamable HTTP version advertised by initialize.
        // No protocol-level session header is issued: each authenticated request is independent.
        const version=req.headers['mcp-protocol-version'];
        if(version && version!==PROTOCOL)return fail(res,400,'Unsupported MCP protocol version');
        const contentType=(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
        if(contentType!=='application/json')return fail(res,415,'Expected application/json');
        const b=await readBody(req);
        if(b.jsonrpc!=='2.0'||typeof b.method!=='string')return fail(res,400,'Invalid JSON-RPC');
        if(b.method==='notifications/initialized'){res.writeHead(202);return res.end();}
        let out;
        if(b.method==='initialize')out={protocolVersion:PROTOCOL,capabilities:{tools:{}},serverInfo:{name:'safari-ai-agent',version:'0.2.0'}};
        else if(b.method==='tools/list')out={tools:TOOL_DEFS};
        else if(b.method==='ping')out={};
        else if(b.method==='tools/call'){
          const name=b.params?.name;
          if(!METHODS.includes(name))out=toolError('Unknown tool');
          else out=await call(name,b.params?.arguments||{});
        }else return json(res,200,{jsonrpc:'2.0',id:b.id??null,error:{code:-32601,message:'Unsupported MCP method'}});
        return json(res,200,{jsonrpc:'2.0',id:b.id,result:out});
      }
      if(url.pathname.startsWith('/device/')){
        if(!tokenMatches(req.headers.authorization,deviceToken))return fail(res,401,'Unauthorized device');
        if(req.method!=='POST')return fail(res,405,'POST only');
        const b=await readBody(req);
        if(url.pathname==='/device/disconnect'){
          if(typeof b.origin!=='string'||!allowed.has(b.origin))return fail(res,403,'Origin not allowlisted');
          if(current && current.origin!==b.origin)return fail(res,409,'Different active origin');
          // Stop is a server-side revocation, not just a paused client poller.
          // Cancelling a claimed command invalidates subsequent result submissions.
          current=null;lastPoll=0;cancelAll('Device explicitly disconnected');
          return json(res,200,{disconnected:true,generation});
        }
        if(url.pathname==='/device/poll'){
          if(typeof b.origin!=='string'||!allowed.has(b.origin))return fail(res,403,'Origin not allowlisted');
          if(current && current.origin!==b.origin && clock()-lastPoll<deviceFreshMs)return fail(res,409,'Another site already owns the device session');
          current={origin:b.origin};lastPoll=clock();
          for(const p of pending.values()){
            if(!p.claimed && p.origin===b.origin && p.expiresAt>clock()){
              p.claimed=true;
              return json(res,200,{command:{id:p.id,action:p.action,args:p.args,origin:p.origin,expiresAt:p.expiresAt,generation}});
            }
          }
          return json(res,200,{command:null,generation});
        }
        if(url.pathname==='/device/result'){
          const p=pending.get(b.id);
          if(!p||!p.claimed||p.expiresAt<=clock())return fail(res,409,'Unknown, expired or duplicate command');
          if(b.origin!==p.origin)return fail(res,403,'Origin mismatch');
          const response=b.result;
          if(!response||typeof response!=='object'||Array.isArray(response)||JSON.stringify(response).length>50000)return fail(res,400,'Invalid result');
          if(response.requiresApproval && !response.approved)return fail(res,400,'Approval not granted');
          p.resolve(response.success===false?toolError(response.error||'Browser action failed'):toolOK(response));dispose(p.id);
          return json(res,200,{accepted:true});
        }
        return fail(res,404,'Unknown device endpoint');
      }
      return fail(res,404,'Not found');
    }catch(e){return fail(res,400,e.message||'Invalid request');}
  }
  const server=createServer((req,res)=>void router(req,res));
  return {server,status,call,cancelAll,close:()=>{cancelAll('Server shutting down');return new Promise(r=>server.close(r));},tools:TOOL_DEFS};
}

if(process.argv[1]&&process.argv[1].endsWith('/gateway/server.mjs')){
  const origins=(process.env.SAFARI_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const g=createGateway({clientToken:process.env.MCP_CLIENT_TOKEN,deviceToken:process.env.DEVICE_TOKEN,allowedOrigins:origins});
  const port=Number(process.env.PORT||8787);
  const host=process.env.BIND_ADDRESS||'127.0.0.1';
  if(host!=='127.0.0.1'&&process.env.ALLOW_PROXY_BIND!=='true')throw Error('Nonloopback bind needs explicit ALLOW_PROXY_BIND=true; deploy behind HTTPS proxy');
  g.server.listen(port,host,()=>console.log(`Safari AI Agent gateway bound ${host}:${port} (configure trusted HTTPS ingress for Claude)`));
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>void g.close().then(()=>process.exit(0)));
}
