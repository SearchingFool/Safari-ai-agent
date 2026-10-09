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
const shell=(title,body)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px system-ui;max-width:48rem;margin:2rem auto;padding:1rem}label{display:block;margin:1rem 0}input,button,select{font:inherit;padding:.6rem}#results,#feedback{padding:1rem;background:#eef3f9;border-radius:.5rem}</style></head><body>${body}</body></html>`;
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
export function serveDemo(req,res,path){
  if(req.method!=='GET'||!['/demo','/demo/product'].includes(path))return false;
  res.writeHead(200,headers);
  res.end(path==='/demo'?catalog:product);
  return true;
}
