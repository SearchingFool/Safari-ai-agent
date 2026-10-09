/**
 * Validates a deployed MCP endpoint without requesting an actual browser action.
 * Run with MCP_ENDPOINT=https://your-server.example/mcp and MCP_CLIENT_TOKEN.
 * Never logs the bearer token or webpage content. Uses built-in Node fetch.
 */
const endpoint=process.env.MCP_ENDPOINT;
const token=process.env.MCP_CLIENT_TOKEN;
if(!endpoint || !token || token.length<24){
  console.error('Set MCP_ENDPOINT and MCP_CLIENT_TOKEN (24+ chars).');
  process.exitCode=2;
}else{
  try{
    const u=new URL(endpoint);
    if(u.protocol!=='https:'||u.pathname!=='/mcp'||u.username||u.password)throw Error('Use a public HTTPS URL ending in /mcp');
    async function rpc(method,params,id){
      const response=await fetch(u.href,{
        method:'POST',signal:AbortSignal.timeout(15000),
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',
          Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},
        body:JSON.stringify({jsonrpc:'2.0',id,method,params})
      });
      if(!response.ok)throw Error(`MCP ${method}: HTTP ${response.status}`);
      const body=await response.json();
      if(body.error)throw Error(`MCP ${method}: ${body.error.message}`);
      return body.result;
    }
    const init=await rpc('initialize',{protocolVersion:'2025-11-25',
      clientInfo:{name:'safari-deployment-check',version:'1.0'},capabilities:{}},1);
    if(init.protocolVersion!=='2025-11-25')throw Error('Unexpected protocol version');
    const tools=await rpc('tools/list',{},2);
    const expected=['browser_inspect','browser_fill','browser_click','browser_navigate',
      'browser_verify','browser_status','browser_cancel'];
    for(const name of expected){if(!tools.tools?.some(t=>t.name===name))throw Error(`Missing ${name}`)}
    const status=await rpc('tools/call',{name:'browser_status',arguments:{}},3);
    const parsed=JSON.parse(status.content?.[0]?.text||'{}');
    console.log(JSON.stringify({transport:'PASS',toolCount:tools.tools.length,
      deviceConnected:parsed.connected===true},null,2));
  }catch(e){console.error(`Deployment check failed: ${e.message}`);process.exitCode=1;}
}
