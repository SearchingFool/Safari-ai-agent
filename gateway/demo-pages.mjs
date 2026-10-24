/**
 * Read-only, public demonstration website served by the MCP gateway.
 * Every interaction is harmless; the forms intentionally never transmit user data.
 * The demo uses relative URLs, so it works at a public HTTPS gateway origin.
 * Do not enter real names, email addresses, credentials, or personal information.
 */
const headers={
  'Content-Type':'text/html; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"
};
const shell=(title,body)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px system-ui;max-width:48rem;margin:2rem auto;padding:1rem}label{display:block;margin:1rem 0}input,button,select{font:inherit;padding:.6rem}#results,#feedback{padding:1rem;background:#eef3f9;border-radius:.5rem}pre{background:#f4f6f8;padding:.75rem;border-radius:.4rem;overflow-x:auto;font-size:13px}code{background:#f4f6f8;padding:.1rem .3rem;border-radius:.2rem}.warn{background:#fff4e5;border-left:4px solid #d98324;padding:.75rem 1rem;border-radius:.3rem}.lead{font-size:1.05rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d6dde5;padding:.5rem;text-align:left;vertical-align:top}h2{margin-top:2rem;border-top:1px solid #e3e8ee;padding-top:1rem}</style></head><body>${body}</body></html>`;
const catalog=shell('Safari AI Agent Demo Catalog',`
<h1>Demo product catalog</h1>
<p>This is a public testing page. Use invented data only. No form information is stored.</p>
<label for="search">Search products</label><input id="search" type="search" placeholder="Search demo widget" />
<button id="find" type="button">Search catalog</button>
<section id="results" aria-live="polite">Search to display a result.</section>
<script>
  document.getElementById('find').addEventListener('click',()=>{
    const match=document.getElementById('search').value.toLowerCase().includes('widget');
    const result=document.getElementById('results');
    result.textContent='';
    if(match){const a=document.createElement('a');a.href='/demo/product';a.textContent='View Demo Widget';result.append(a);}
    else result.textContent='No matching demo product. Try widget.';
  });
</script>`);
const product=shell('Safari AI Agent Demo Product',`
<h1>Demo Widget</h1><p>This is an inert form for testing browser automation. Use fictional data.</p>
<form id="demo-form" onsubmit="event.preventDefault();document.getElementById('feedback').textContent='Submit blocked on demonstration site';">
<label for="name">Contact name</label><input id="name" type="text" autocomplete="off" />
<label for="time">Delivery time</label><input id="time" type="time" min="11:00" max="21:00" step="900" />
<label for="choice">Option</label><select id="choice"><option value="">Choose</option><option value="basic">Basic</option><option value="extended">Extended</option></select>
<button id="preview" type="button">Preview selection</button>
<button type="submit">Submit demo form</button>
</form><p id="feedback" role="status">Not previewed</p>
<script>document.getElementById('preview').addEventListener('click',()=>{document.getElementById('feedback').textContent='Preview ready';});</script>
<p><a href="/demo">Back to demo catalog</a></p>`);
// D-048. Setup instructions served by the gateway itself, so the operator can
// follow them on the device being set up instead of reading a file on the Mac.
//
// DELIBERATELY UNAUTHENTICATED. The instructions are needed BEFORE the demo
// password has been transferred, so gating them behind that password would make
// them unavailable at the exact moment they are needed.
//
// DELIBERATELY CONTAINS NO CREDENTIAL VALUES, and must not be changed to.
// docs/TARGET-ARCHITECTURE.md rejects a gateway-served page that reveals the
// device token: it would let the demo password alone yield the device token,
// collapsing two independent secrets into one. This page names the secrets and
// says where to copy them FROM. It never prints one.
const helpBody=(base)=>`
<h1>Setting up Safari AI Agent</h1>
<p class="lead">Follow these in order. Each step says <b>where</b> you do it.</p>

<p class="warn"><b>Credentials never appear on this page, by design.</b> Copy each one from the Mac
with Universal Clipboard or AirDrop. Never type one into a chat, an email or a message
&mdash; including into Claude.</p>

<h2>Before anything: close old tabs</h2>
<p class="warn"><b>If the passwords were just changed, every tab opened before the change is now
stale.</b> A stale tab keeps retrying once a second and fails, and it reports the problem only in
its own panel &mdash; the tab you are not looking at. <b>Close every tab of this page except one.</b></p>

<h2>On the Mac &mdash; start the gateway</h2>
<pre>cd &lt;your Safari-ai-agent folder&gt;
bash tools/start-mac-tailscale-test.sh</pre>
<p>Leave that Terminal window open; closing it stops everything. It prints this gateway's address
and creates the credentials if they do not exist.</p>

<h2>In a browser &mdash; connect Claude</h2>
<ol>
<li>On the Mac, copy the MCP token:<br>
<pre>printf 'Bearer %s' "$(awk -F= '/^MCP_CLIENT_TOKEN=/{printf "%s",$2}' .env.mac-tailscale)" | pbcopy</pre></li>
<li>Go to <b>claude.ai &rarr; your name &rarr; Settings &rarr; Connectors</b></li>
<li><b>Delete any existing "Safari AI Agent" connector</b> and add a new one. A saved
authentication value often cannot be edited, and a silently-failed edit is the usual cause of
"couldn't reach".</li>
<li><b>URL:</b> <code>${base}/mcp</code></li>
<li><b>Authentication:</b> custom request header &mdash; name <code>Authorization</code>,
value <b>pasted</b> (71 characters). Do not type the word Bearer; it is already included.</li>
</ol>

<h2>On the iPad &mdash; connect the browser</h2>
<ol>
<li>Install the Userscripts extension, then install the script from
<code>${base}/install/safari-ai-agent-remote.user.js</code> (asks for the demo password).</li>
<li><b>Open the site you want to work on.</b> Any site &mdash; the script runs on all of them.
You do not need the bundled demo pages; they exist as the automated test fixture, not as a
place you are expected to practise.</li>
<li>Tap <b>Remote AI</b> on that page. The panel appears on every site.</li>
<li><b>Base URL:</b> <code>${base}</code> &mdash; <b>nothing after it.</b> No <code>/mcp</code>,
no <code>/demo</code>, no trailing slash.</li>
<li><b>Device token:</b> paste the <b>device token</b> &mdash; a <i>different</i> secret from
Claude's. Check the field is not empty <b>before</b> you press Save.</li>
<li><b>Save.</b> The field going blank afterwards is correct and deliberate. You should see
"Configuration saved". If you see "HTTPS URL and long device token required", the paste did not
land &mdash; try again.</li>
<li><b>Connect.</b> The status should read <b>Connected</b>.</li>
</ol>

<h2>Choosing a site, and its permission</h2>
<p>Add the site in the control panel and pick what the agent may do there. <b>Nothing is trusted
automatically.</b></p>
<table>
<tr><th>Mode</th><th>What the agent may do</th></tr>
<tr><td>Read only</td><td>Look at the page. No actions at all. <b>Start here on a real site.</b></td></tr>
<tr><td>Fill and navigate</td><td>Type into fields and follow links. No clicking buttons.</td></tr>
<tr><td>Ask every time</td><td>Everything, but you confirm each action individually.</td></tr>
<tr><td>Full permission</td><td>Routine actions run automatically. Form submissions still ask, and
payment, account-deletion and credential controls are refused on every site including this one.</td></tr>
</table>
<p class="warn"><b>On a site you are logged into, the agent acts as you.</b> The website cannot tell
the difference and its audit log will show your name. Start read-only and raise the permission only
once you have watched it behave.</p>

<h2>Split View is required, not advice</h2>
<p class="warn">iPadOS suspends a Safari tab as soon as you switch apps. Keep this tab visible in
Split View while the agent works. If it is not in front the agent pauses deliberately, and the
gateway refuses commands rather than raising an approval prompt where you cannot see it.</p>

<h2>If something fails</h2>
<table>
<tr><th>What you see</th><th>What it means</th></tr>
<tr><td>Claude says "couldn't reach"</td><td>Usually the <b>wrong or stale MCP token</b>, not a
network problem. Delete the connector and recreate it.</td></tr>
<tr><td>Panel says the device token does not match</td><td>This tab is stale. Paste the current
device token and Save, or close the tab.</td></tr>
<tr><td>"Another tab is failing to authenticate"</td><td>A tab left open from before a credential
change. Find and close it.</td></tr>
<tr><td>Panel says "Paused &mdash; tab not visible"</td><td>Working as intended. Bring the tab
forward.</td></tr>
<tr><td>Another tab holds the session</td><td>Use <b>Take over</b>, or press Stop in that tab.</td></tr>
</table>
<p>On the Mac, <code>npm run diagnose</code> prints what the gateway actually saw. It
distinguishes a wrong password from an unreachable server, which the error messages alone cannot.</p>
`;

export function serveHelp(req,res,path,base){
  if(req.method!=='GET'||path!=='/help')return false;
  res.writeHead(200,headers);
  res.end(shell('Safari AI Agent - setup',helpBody(base)));
  return true;
}

export function serveDemo(req,res,path){
  if(req.method!=='GET'||!['/demo','/demo/product'].includes(path))return false;
  res.writeHead(200,headers);
  res.end(path==='/demo'?catalog:product);
  return true;
}
