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
import {appendFileSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {serveDemo} from './demo-pages.mjs';
import {createDiagnostics} from './diagnostics.mjs';

const MAX_REQUEST_BYTES = 65536;
const PROTOCOL = '2025-11-25'; // Broadly implemented compatibility target.
const METHODS = ['browser_inspect','browser_fill','browser_click','browser_navigate','browser_verify','browser_status','browser_cancel'];
// MCP ToolAnnotations (2025-06-18). The spec's defaults are deliberately
// fail-closed - readOnlyHint false, destructiveHint TRUE, openWorldHint TRUE -
// so an undeclared tool is advertised as maximally dangerous. Declaring these
// lets a client tier its own prompts instead of treating every call alike.
// openWorldHint is true throughout: the target is the open web.
const TOOL_DEFS = [
  {name:'browser_inspect',description:'Inspect visible page content and controls in the paired iPad Safari tab.',inputSchema:{type:'object',properties:{},additionalProperties:false},
   annotations:{title:'Inspect page',readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
  {name:'browser_fill',description:'Fill a referenced text, time, select or editable field. Requires current browser_inspect.',inputSchema:{type:'object',properties:{ref:{type:'string'},value:{type:'string'}},required:['ref','value'],additionalProperties:false},
   annotations:{title:'Fill a field',readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
  // The only tool that can cause an irreversible side effect on the page.
  // This description is read by the MODEL and shapes how it reasons about what
  // is guarded, so a stale safety claim here is worse than a stale comment: it
  // can make a model treat an unguarded action as guarded. It said "Submission
  // is blocked by default" for one release after D-019 narrowed the hard
  // ceilings and that stopped being true (D-034). Keep it matched to
  // src/core.js; tests/gateway.test.mjs pins it against drifting back.
  {name:'browser_click',description:'Click a referenced control. Every click needs explicit operator confirmation in the iPad tab, and is refused outright unless the operator has nominated this site as trusted. Payment, account-deletion and credential or security controls are refused on every site, trusted ones included. A form submit is NOT blocked: on a trusted site it proceeds once the operator confirms it, and it always needs its own confirmation - a standing approval can never cover it.',inputSchema:{type:'object',properties:{ref:{type:'string'}},required:['ref'],additionalProperties:false},
   annotations:{title:'Click a control',readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true}},
  {name:'browser_navigate',description:'Navigate only to an approved same-origin HTTP(S) URL; verify by inspecting after navigation.',inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url'],additionalProperties:false},
   annotations:{title:'Navigate same-origin',readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
  {name:'browser_verify',description:'Verify visible page text or URL contains expected substring.',inputSchema:{type:'object',properties:{textIncludes:{type:'string'},urlIncludes:{type:'string'}},additionalProperties:false},
   annotations:{title:'Verify page state',readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
  // Status reads only gateway state, never the page: closed world.
  {name:'browser_status',description:'Get iPad connection and gateway queue status.',inputSchema:{type:'object',properties:{},additionalProperties:false},
   annotations:{title:'Connection status',readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
  // Cancel only revokes queued commands; it cannot undo an action already run.
  {name:'browser_cancel',description:'Cancel queued browser actions; an action already running may not be reversible.',inputSchema:{type:'object',properties:{},additionalProperties:false},
   annotations:{title:'Cancel queued actions',readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];
// ---------------------------------------------------------------------------
// SITE POLICY (D-020 modes, D-025 gateway-delivered tunable policy)
//
// The gateway owns only the TUNABLE half: which mode each origin runs in. The
// hard ceilings - payment, account deletion, credential and security changes -
// are hardcoded in src/core.js and ship with the bridge, deliberately OUTSIDE
// network reach, so a compromised or spoofed gateway cannot talk the bridge
// into an irreversible action.
//
// These three strings are duplicated rather than imported from src/core.js on
// purpose. The gateway and the bridge validate the mode independently, and a
// DOM engine import would couple a network service to browser code. Both ends
// collapse an unrecognised value to read-only.
const MODES = Object.freeze({READ_ONLY:'read-only', FILL_ONLY:'fill-only', TRUSTED:'trusted'});
const MODE_VALUES = new Set(Object.values(MODES));
// Default for an unlisted origin is the MOST restrictive, not the least. An
// origin being on the connection allowlist says the operator will let the agent
// look at it; it does not say they will let the agent act on it.
function normalizeMode(value){return MODE_VALUES.has(value)?value:MODES.READ_ONLY;}
function parseSitePolicy(raw){
  const out=new Map();
  if(!raw)return out;
  const entries=typeof raw==='string'
    ? raw.split(',').map(part=>part.split('=')).filter(pair=>pair.length===2)
    : Object.entries(raw);
  for(const [origin,mode] of entries){
    const key=String(origin).trim();
    let valid=false;
    try{valid=new URL(key).origin===key&&/^https?:/.test(key);}catch{valid=false;}
    if(!valid)throw Error(`Site policy key must be an exact HTTP(S) origin: ${key}`);
    const value=String(mode).trim();
    if(!MODE_VALUES.has(value))throw Error(`Unknown site mode "${value}" for ${key}; use read-only, fill-only or trusted`);
    out.set(key,value);
  }
  return out;
}
// Which tool each mode may reach. Mirrored by the bridge; neither side relies
// on the other having checked.
const MODE_ALLOWS = Object.freeze({
  [MODES.READ_ONLY]: new Set(['browser_inspect','browser_verify']),
  [MODES.FILL_ONLY]: new Set(['browser_inspect','browser_verify','browser_fill','browser_navigate']),
  [MODES.TRUSTED]:   new Set(['browser_inspect','browser_verify','browser_fill','browser_navigate','browser_click'])
});
const json = (res,code,value) => {res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
// Error bodies carry the request id so a user can quote it and it can be found
// in the diagnostics log without guessing which request they mean.
const fail = (res,code,message)=>json(res,code,{error:message,requestId:res.getHeader('X-Request-Id')||null});
// Demo Basic authentication is distinct from the MCP and device bearer tokens.
const DEMO_USER='safari-demo';
function demoMatches(header,password){
  if(typeof password!=='string'||password.length<24||typeof header!=='string'||
     !header.startsWith('Basic ')||header.length>256)return false;
  const encoded=header.slice(6);
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return false;
  const raw=Buffer.from(encoded,'base64').toString('utf8');
  const cut=raw.indexOf(':');
  if(cut<0||raw.slice(0,cut)!==DEMO_USER)return false;
  const supplied=Buffer.from(raw.slice(cut+1)), expected=Buffer.from(password);
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
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
export function createGateway({clientToken,deviceToken,demoPassword,allowedOrigins,sitePolicy,standingGrants=true,commandTimeoutMs=25000,deviceFreshMs=45000,clock=()=>Date.now(),diagnostics}={}) {
  if(!clientToken||!deviceToken||clientToken===deviceToken||clientToken.length<24||deviceToken.length<24)throw Error('Two distinct random tokens of at least 24 characters required');
  const allowed=new Set(allowedOrigins||[]);
  if(allowed.size===0||[...allowed].some(x=>{try{return new URL(x).origin!==x||!/^https?:/.test(x)}catch{return true}}))throw Error('Provide exact HTTP(S) allowed origins');
  const modes=parseSitePolicy(sitePolicy);
  for(const origin of modes.keys()){
    if(!allowed.has(origin))throw Error(`Site policy names ${origin}, which is not an allowed origin`);
  }
  const modeFor=origin=>normalizeMode(modes.get(origin));
  // Changes to policy must invalidate the grants a bridge made under the old
  // one, so the bridge needs to be able to tell that it changed. The stamp is
  // derived from the configuration, not from a clock, so it is stable across a
  // restart with identical config and differs the moment config differs.
  const policyVersion=[...modes.entries()].sort().map(([o,m])=>`${o}=${m}`).join('|')+`#grants=${standingGrants!==false}`;
  const policyFor=origin=>({mode:modeFor(origin),grants:standingGrants!==false,version:policyVersion});
  // Diagnostics are injectable so tests can capture events without touching disk.
  const diag = diagnostics || createDiagnostics({
    enabled:false,clientTokenLength:clientToken.length,deviceTokenLength:deviceToken.length,
    allowedOrigins:[...allowed]
  });
  // The device session is keyed on {origin, instanceId}, NOT on origin alone.
  // Origin-only keying (D-023) let two tabs of the same site both hold the
  // session, so a queued command was claimed by whichever tab polled first.
  // That is non-deterministic AND unsafe: the approval prompt could appear in
  // a tab the operator cannot see.
  const INSTANCE_ID=/^[A-Za-z0-9_-]{8,64}$/;
  const pending=new Map(); let current=null;let lastPoll=0;let generation=0;
  const sessionFresh=()=>Boolean(current)&&clock()-lastPoll<deviceFreshMs;
  const status=()=>({
    connected:clock()-lastPoll<deviceFreshMs,
    activeOrigin:current?.origin||null,
    activeInstanceId:current?.instanceId||null,
    // Last visibility the paired tab reported. A session can be fresh and still
    // unusable because the tab is backgrounded.
    activeVisibility:current?.visibility||null,
    // Surface the mode so a caller can see WHY a tool will be refused before it
    // spends a round trip finding out, and so the operator can confirm which
    // policy is actually live.
    activeMode:current?modeFor(current.origin):null,
    queueDepth:pending.size,generation});
  function dispose(id){const p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);}
  function cancelAll(reason='Cancelled'){
    for(const [id,p] of pending){p.resolve(toolError(reason));dispose(id);}generation++;
  }
  // Everything a losing tab needs to explain itself and offer a way out. The
  // caller is already device-token authenticated, so naming the owning origin
  // discloses nothing it could not learn by holding the session itself.
  function conflictBody(b){
    return {
      activeOrigin:current?.origin||null,
      activeInstanceId:current?.instanceId||null,
      // The owner's own visibility is the whole reason this request was
      // refused rather than followed (D-033), so the losing panel is told it.
      // It discloses nothing: a same-origin tab could poll for it anyway.
      activeVisibility:current?.visibility||null,
      sameOrigin:current?.origin===b.origin,
      staleAfterMs:Math.max(0,deviceFreshMs-(clock()-lastPoll)),
      canTakeOver:true
    };
  }
  // ---------------------------------------------------------------------------
  // D-033: THE SESSION FOLLOWS THE VISIBLE TAB.
  //
  // The operator expects to configure a site once and have whichever tab they
  // are looking at be the live one. Before this, the gateway granted the
  // session to whichever tab polled first and every other tab sat on a 409
  // until the operator found the "Take over" button.
  //
  // This does NOT reinstate D-023. D-023 was a command being claimed by a tab
  // the operator could not see. The gateway now refuses to deliver a command to
  // a tab reporting anything other than `visible`, and on iPadOS a backgrounded
  // tab is suspended outright (D-029). So the ONLY session this function will
  // move is one held by a tab that is structurally incapable of executing
  // anything. The gate is exactly that signal and nothing else:
  //
  //   - the claimant must itself be VISIBLE - a tab that cannot act must not be
  //     handed the session either, or a background tab could steal it from a
  //     foreground one;
  //   - the incumbent must NOT be visible - a visible, live owner is never
  //     displaced automatically. That stays an explicit operator "Take over",
  //     because two simultaneously visible tabs (Split View, a second window)
  //     is a real conflict and the gateway cannot tell which one the operator
  //     means;
  //   - SAME ORIGIN only - a different allowlisted origin is a genuine
  //     conflict, not a tab switch, and keeps the existing takeover UI.
  //
  // The already-stale case needs no entry here: `sessionFresh()` is false once
  // the owner ages out of deviceFreshMs, so the poll simply succeeds. The
  // same-tab-reconnecting case is likewise already handled by `owns`, because
  // the instance id is sessionStorage-backed and survives same-tab navigation.
  function sessionFollows(b,visibility){
    return visibility==='visible'
        && current?.origin===b.origin
        && current.visibility!=='visible';
  }
  async function call(tool,args){
    if(tool==='browser_status')return toolOK(status());
    if(tool==='browser_cancel'){cancelAll();return toolOK({success:true,cancelled:true});}
    const err=validate(args,tool,allowed);if(err)return toolError(err);
    if(!status().connected)return toolError('No active iPad Safari device. Open the test tab and enable Remote Control.');
    // Fail fast rather than queueing for a tab that is not on screen. Without
    // this the command sits unclaimed for the full commandTimeoutMs and comes
    // back as "outcome may be uncertain" - the one class of failure a caller
    // cannot safely retry. A hidden tab is a known, certain refusal.
    if(current.visibility!=='visible')return toolError('The paired Safari tab is not visible. Bring it to the front, then retry.');
    // D-020 mode gate. The bridge enforces the same rule from the live DOM;
    // this one stops the command ever being queued, so a refusal costs one
    // round trip instead of an approval prompt the operator has to decline.
    const mode=modeFor(current.origin);
    if(!MODE_ALLOWS[mode].has(tool)){
      return toolError(`${tool} is not permitted on ${current.origin} (site mode: ${mode}). The operator must nominate this site for a less restrictive mode.`);
    }
    if(pending.size>=1)return toolError('Only one in-flight action allowed');
    const id=randomUUID();
    return await new Promise(resolve=>{
      const item={id,action:tool,args,origin:current.origin,instanceId:current.instanceId,issuedAt:clock(),expiresAt:clock()+commandTimeoutMs,claimed:false,resolve,timer:null};
      item.timer=setTimeout(()=>{resolve(toolError('Device command timed out; action outcome may be uncertain. Inspect again.'));dispose(id);},commandTimeoutMs);
      pending.set(id,item);
    });
  }
  async function router(req,res){
    const requestId=randomUUID().slice(0,8);
    // Honour a caller-supplied correlation id so one logical operation can be
    // traced across the MCP call and the device round trip it triggers.
    const correlationId=(typeof req.headers['x-correlation-id']==='string'
      && /^[\w.-]{1,64}$/.test(req.headers['x-correlation-id']))
      ? req.headers['x-correlation-id'] : requestId;
    res.setHeader('X-Request-Id',requestId);
    res.setHeader('X-Correlation-Id',correlationId);
    const trace=diag.attach(req,res,requestId,correlationId);
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/health'&&req.method==='GET')return json(res,200,{ok:true});
      if(['/demo','/demo/product'].includes(url.pathname)){
        if(req.method!=='GET'||!demoPassword)return fail(res,404,'Not found');
        if(!demoMatches(req.headers.authorization,demoPassword)){
          // Minimal challenge, no data in the response body or server details.
          res.writeHead(401,{'WWW-Authenticate':'Basic realm="Safari AI Agent Test", charset="UTF-8"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
          return res.end();
        }
        return serveDemo(req,res,url.pathname);
      }
      if(url.pathname==='/mcp'){
        if(req.headers.origin)return fail(res,403,'Browser Origin not accepted for MCP');
        if(!tokenMatches(req.headers.authorization,clientToken)){
          // RFC 6750: a bearer-protected resource must say so on 401. Without this
          // a client cannot distinguish "wrong credential" from "unreachable".
          res.setHeader('WWW-Authenticate','Bearer realm="safari-ai-agent"');
          return fail(res,401,'Unauthorized MCP caller');
        }
        if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(res,405,'POST only');}
        // Enforce the legacy Streamable HTTP version advertised by initialize.
        // No protocol-level session header is issued: each authenticated request is independent.
        const version=req.headers['mcp-protocol-version'];
        if(version && version!==PROTOCOL)return fail(res,400,'Unsupported MCP protocol version');
        const contentType=(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
        if(contentType!=='application/json')return fail(res,415,'Expected application/json');
        const b=await readBody(req);
        if(b.jsonrpc!=='2.0'||typeof b.method!=='string')return fail(res,400,'Invalid JSON-RPC');
        trace.rpcMethod=b.method;
        if(b.method==='tools/call'&&typeof b.params?.name==='string')trace.toolName=b.params.name;
        if(b.method==='notifications/initialized'){res.writeHead(202);return res.end();}
        let out;
        if(b.method==='initialize')out={protocolVersion:PROTOCOL,capabilities:{tools:{}},serverInfo:{name:'safari-ai-agent',version:'0.2.0'}};
        else if(b.method==='tools/list')out={tools:TOOL_DEFS};
        else if(b.method==='ping')out={};
        else if(b.method==='tools/call'){
          const name=b.params?.name;
          if(!METHODS.includes(name))out=toolError('Unknown tool');
          else out=await call(name,b.params?.arguments||{});
          // Record the TOOL-level outcome. HTTP 200 only means the exchange
          // completed; it says nothing about whether the action was refused,
          // denied or timed out. Only the error text is captured, never a
          // success payload, because success payloads contain page content.
          trace.isError=out?.isError===true;
          if(trace.isError){
            try{trace.toolError=String(JSON.parse(out.content[0].text).error||'').slice(0,160);}catch{/* leave unset */}
          }
        }else return json(res,200,{jsonrpc:'2.0',id:b.id??null,error:{code:-32601,message:'Unsupported MCP method'}});
        return json(res,200,{jsonrpc:'2.0',id:b.id,result:out});
      }
      if(url.pathname.startsWith('/device/')){
        if(!tokenMatches(req.headers.authorization,deviceToken))return fail(res,401,'Unauthorized device');
        if(req.method!=='POST')return fail(res,405,'POST only');
        const b=await readBody(req);
        if(typeof b.origin==='string')trace.deviceOrigin=b.origin;
        // Every device call must name the tab it comes from. Omitting it is a
        // client that predates tab-scoped sessions; accepting it would restore
        // the exact ambiguity D-023 describes, so it is refused outright.
        if(typeof b.instanceId!=='string'||!INSTANCE_ID.test(b.instanceId))return fail(res,400,'A per-tab instanceId is required');
        // Record WHICH tab is talking and whether it is on screen. A session
        // handover is otherwise invisible in the log - every poll looks the
        // same - so there is no way to attribute a request to a tab or to time
        // a transfer. tools/analyze-handover.mjs reads exactly these two.
        trace.deviceInstance=b.instanceId;
        trace.deviceVisibility=b.visibility==='visible'?'visible':'hidden';
        const owns=current && current.origin===b.origin && current.instanceId===b.instanceId;
        if(url.pathname==='/device/disconnect'){
          if(typeof b.origin!=='string'||!allowed.has(b.origin))return fail(res,403,'Origin not allowlisted');
          // A tab may only revoke its own session, never another tab's - even
          // one on the same origin. Takeover is an explicit, separate act.
          if(sessionFresh() && !owns)return json(res,409,{error:'A different tab owns the device session',code:'DEVICE_SESSION_CONFLICT',...conflictBody(b),requestId});
          // Stop is a server-side revocation, not just a paused client poller.
          // Cancelling a claimed command invalidates subsequent result submissions.
          current=null;lastPoll=0;cancelAll('Device explicitly disconnected');
          return json(res,200,{disconnected:true,generation});
        }
        if(url.pathname==='/device/poll'){
          if(typeof b.origin!=='string'||!allowed.has(b.origin))return fail(res,403,'Origin not allowlisted');
          const visibility=b.visibility==='visible'?'visible':'hidden';
          if(sessionFresh() && !owns){
            const follows=sessionFollows(b,visibility);
            // The losing tab previously got a bare 409 forever with no way out
            // (D-017). Name the owner so the panel can say WHICH tab holds the
            // session, and accept an explicit operator-driven takeover.
            if(!follows && b.takeover!==true)return json(res,409,{error:'Another tab already owns the device session',code:'DEVICE_SESSION_CONFLICT',...conflictBody(b),requestId});
            // A session move - automatic or explicit - invalidates everything
            // the previous tab might still act on. This is the mechanism that
            // stops two tabs acting on one command: the losing tab's claimed
            // command is disposed here, so its later POST to /device/result is
            // refused 409, and the bridge dispatches a click or navigation only
            // AFTER that result is accepted. A revoked command therefore cannot
            // reach the page. Queued work was also approved, if at all, against
            // a page the operator has stopped looking at.
            cancelAll(follows
              ? 'Device session followed the visible tab'
              : 'Device session taken over by another tab');
          }
          current={origin:b.origin,instanceId:b.instanceId,visibility};lastPoll=clock();
          // Policy rides on EVERY poll, including the idle and paused ones, so
          // revoking trust takes effect within one poll interval rather than at
          // the bridge's next connect. It is always the policy for the origin
          // that is ASKING, so a gateway answer cannot set policy for a site
          // other than the one the bridge is currently on.
          const policy=policyFor(b.origin);
          // SAFETY GATE. A hidden tab is told "nothing to do", not given an
          // error: it is a healthy session that simply must not act. Delivering
          // here would raise window.confirm() in a tab the operator cannot see,
          // so they would either never answer it or approve the visible tab's
          // page while a different page acted.
          if(visibility!=='visible')return json(res,200,{command:null,generation,policy,paused:'hidden'});
          for(const p of pending.values()){
            if(!p.claimed && p.origin===b.origin && p.instanceId===b.instanceId && p.expiresAt>clock()){
              p.claimed=true;
              return json(res,200,{command:{id:p.id,action:p.action,args:p.args,origin:p.origin,expiresAt:p.expiresAt,generation},policy});
            }
          }
          return json(res,200,{command:null,generation,policy});
        }
        if(url.pathname==='/device/result'){
          const p=pending.get(b.id);
          if(!p||!p.claimed||p.expiresAt<=clock())return fail(res,409,'Unknown, expired or duplicate command');
          if(b.origin!==p.origin)return fail(res,403,'Origin mismatch');
          // A result is only accepted from the exact tab the command was issued
          // to, so a sibling tab cannot answer for work it did not perform.
          if(b.instanceId!==p.instanceId)return fail(res,403,'Instance mismatch');
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
  // Diagnostics default ON for the local test launcher: the whole point of this
  // deployment is to find out why a client cannot connect. SAFARI_LOG_REQUESTS=0
  // turns it off. Credential values are never recorded (see diagnostics.mjs).
  const diagEnabled=process.env.SAFARI_LOG_REQUESTS!=='0';
  const logFile=process.env.SAFARI_DIAGNOSTICS_FILE||'logs/gateway-diagnostics.jsonl';
  let appendLine=null;
  if(diagEnabled){
    try{
      mkdirSync(dirname(logFile),{recursive:true});
      appendLine=line=>appendFileSync(logFile,line,{mode:0o600});
    }catch(e){
      console.warn(`Diagnostics file disabled (${e.message}); console output only.`);
    }
  }
  const g=createGateway({
    clientToken:process.env.MCP_CLIENT_TOKEN,deviceToken:process.env.DEVICE_TOKEN,
    demoPassword:process.env.DEMO_PASSWORD,allowedOrigins:origins,
    // SAFARI_SITE_POLICY="https://a.example=trusted,https://b.example=fill-only".
    // Anything not named here is read-only, which is why there is no default.
    sitePolicy:process.env.SAFARI_SITE_POLICY,
    // Lets the operator switch off "Always allow" fleet-wide without editing
    // the bridge. It can only ever REMOVE an option from the local dialog.
    standingGrants:process.env.SAFARI_STANDING_GRANTS!=='0',
    diagnostics:createDiagnostics({
      enabled:diagEnabled,
      clientTokenLength:(process.env.MCP_CLIENT_TOKEN||'').length,
      deviceTokenLength:(process.env.DEVICE_TOKEN||'').length,
      allowedOrigins:origins,
      write:line=>console.log(line),
      append:appendLine
    })
  });
  if(diagEnabled)console.log(`Diagnostics ON -> ${appendLine?logFile:'console only'}  (npm run diagnose for a report)`);
  console.log(`Site policy: ${process.env.SAFARI_SITE_POLICY||'(none - every origin is read-only)'}`);
  const port=Number(process.env.PORT||8787);
  const host=process.env.BIND_ADDRESS||'127.0.0.1';
  if(host!=='127.0.0.1'&&process.env.ALLOW_PROXY_BIND!=='true')throw Error('Nonloopback bind needs explicit ALLOW_PROXY_BIND=true; deploy behind HTTPS proxy');
  g.server.listen(port,host,()=>console.log(`Safari AI Agent gateway bound ${host}:${port} (configure trusted HTTPS ingress for Claude)`));
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>void g.close().then(()=>process.exit(0)));
}
