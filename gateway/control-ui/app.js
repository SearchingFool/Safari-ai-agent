'use strict';
const $=id=>document.getElementById(id);
let csrf='',sites=[],dirty=false,working=false;
const modes={ask:'Ask every time','read-only':'Read only','fill-only':'Fill and navigate; no clicks',trusted:'Clicks, fills and navigation'};
function message(text){$('message').textContent=text;}
function renderSites(){
  $('sites').replaceChildren();
  for(const [index,site] of sites.entries()){
    const row=document.createElement('div');row.className='site';
    const name=document.createElement('span');name.textContent=site.url;
    const select=document.createElement('select');select.setAttribute('aria-label','Permission for '+site.url);
    for(const [value,label] of Object.entries(modes)){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
    select.value=site.mode;select.onchange=()=>{site.mode=select.value;dirty=true;message('Permission changed. Save settings to apply it.');};
    const remove=document.createElement('button');remove.className='secondary';remove.textContent='Remove';remove.type='button';
    remove.onclick=()=>{sites.splice(index,1);dirty=true;renderSites();};row.append(name,select,remove);$('sites').append(row);
  }
}
function render(data){
  csrf=data.csrf;
  $('phase').textContent={running:'Running',starting:'Starting',stopping:'Stopping',stopped:'Stopped',external:'Running in Terminal'}[data.phase]||data.phase;
  $('notice').textContent=data.error||(data.phase==='external'?'The current gateway was started elsewhere. Stop its Terminal launcher with Ctrl+C once, then use this panel.':'');
  const b=data.browser;
  $('browser').textContent=data.phase==='external'?'Browser status will appear after this panel starts the gateway.':b?.connected?`Safari ${b.activeVisibility==='visible'?'is ready':'is paused — bring the tab into view'} on ${b.activeOrigin}. Permission: ${modes[b.activeMode]||'Unknown — reconnect'}.`:'Safari is not currently connected. Open a webpage and connect Remote AI.';
  $('start').disabled=working||data.busy||data.phase!=='stopped';$('stop').disabled=working||data.busy||data.phase!=='running';
  $('mcp').value=data.mcpUrl;$('demo').href=data.demoUrl;$('ipad').href=data.controlUrl;
  $('install').href=data.installUrl;
  if(!dirty){sites=data.settings.sites.map(s=>({...s}));$('auto').checked=data.settings.autoStart;renderSites();}
}
async function request(path,data){
  const response=await fetch(path,{cache:'no-store',...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Safari-CSRF':csrf},body:JSON.stringify(data)})});
  if(response.status===401)throw Error('Sign in again with username safari-control and the control password.');
  const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed');return result;
}
async function act(path,data={}){
  working=true;for(const id of ['start','stop','save'])$(id).disabled=true;
  try{const result=await request(path,data);if(path==='/api/settings')dirty=false;working=false;render(result);message(path==='/api/settings'?'Settings saved.':path==='/api/start'?'Gateway started.':'Gateway stopped.');}
  catch(error){message(error.message);}finally{working=false;$('save').disabled=false;await refresh();}
}
async function refresh(){if(working)return;try{render(await request('/api/status'));}catch(error){message(error.message);}}
$('start').onclick=()=>act('/api/start');$('stop').onclick=()=>act('/api/stop');
$('auto').onchange=()=>{dirty=true;};
$('mode').onchange=()=>{$('permission-help').textContent={ask:'Read freely. Ask in Safari before every action. No Always allow.', 'read-only':'Read page content. All actions are blocked.','fill-only':'Fill ordinary fields without asking; navigation asks. All clicks are blocked.',trusted:'Fill ordinary fields without asking; clicks and navigation ask. Routine actions may offer Always allow.'}[$('mode').value];};
$('permission-details').onclick=()=>$('permissions-dialog').showModal();
$('close-permissions').onclick=()=>$('permissions-dialog').close();
$('add').onsubmit=event=>{
  event.preventDefault();try{const address=$('url').value.trim();const url=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(address)||/^file:/i.test(address)?address:($('address-type').value==='local'?'http://':'https://')+address);
    if(url.protocol==='file:')throw Error('Local files are not supported by the remote connector. Serve the page over HTTP and choose Local web server.');
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Enter an HTTP(S) webpage address without credentials.');
    if(sites.some(s=>s.url===url.origin))throw Error('That website is already listed. Change its permission in the list above.');
    sites.push({url:url.origin,mode:$('mode').value});dirty=true;renderSites();$('url').value='';message('Website added to the draft. Save settings to apply it.');
  }catch(error){message(error.message);}
};
$('save').onclick=()=>act('/api/settings',{autoStart:$('auto').checked,sites});
$('copy-mcp').onclick=async()=>{try{await navigator.clipboard.writeText($('mcp').value);message('Connector URL copied.');}catch{ $('mcp').select();message('Select and copy the highlighted URL.');}};
void refresh();setInterval(refresh,3000);
