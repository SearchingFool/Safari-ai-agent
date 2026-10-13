'use strict';
const $=id=>document.getElementById(id);
let csrf='',sites=[],dirty=false,working=false;
const modes={'read-only':'Read only','fill-only':'Fill fields and navigate',trusted:'Allow clicks, fills and navigation'};
function message(text){$('message').textContent=text;}
function renderSites(){
  $('sites').replaceChildren();
  for(const [index,site] of sites.entries()){
    const row=document.createElement('div');row.className='site';
    const name=document.createElement('span');name.textContent=site.url+' — '+modes[site.mode];
    const remove=document.createElement('button');remove.className='secondary';remove.textContent='Remove';remove.type='button';
    remove.onclick=()=>{sites.splice(index,1);dirty=true;renderSites();};row.append(name,remove);$('sites').append(row);
  }
}
function render(data){
  csrf=data.csrf;
  $('phase').textContent={running:'Running',starting:'Starting',stopping:'Stopping',stopped:'Stopped',external:'Running in Terminal'}[data.phase]||data.phase;
  $('notice').textContent=data.error||(data.phase==='external'?'The current gateway was started elsewhere. Stop its Terminal launcher with Ctrl+C once, then use this panel.':'');
  const b=data.browser;
  $('browser').textContent=data.phase==='external'?'Browser status will appear after this panel starts the gateway.':b?.connected?`Safari ${b.activeVisibility==='visible'?'is ready':'is paused — bring the tab into view'} on ${b.activeOrigin}`:'Safari is not currently connected. Open a webpage and connect Remote AI.';
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
$('mode').onchange=()=>{$('permission-help').textContent={'read-only':'Read page content. No filling, navigation or clicks.','fill-only':'Allow filling ordinary fields and navigating. Clicks remain refused.',trusted:'Allow clicks and form submission after local approval, as well as filling and navigation.'}[$('mode').value];};
$('add').onsubmit=event=>{
  event.preventDefault();try{const url=new URL($('url').value);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Enter an HTTP(S) webpage address without credentials.');
    if(sites.some(s=>s.url===url.origin))throw Error('That website is already listed. Remove its entry to change the permission.');
    sites.push({url:url.origin,mode:$('mode').value});dirty=true;renderSites();$('url').value='';message('Website added to the draft. Save settings to apply it.');
  }catch(error){message(error.message);}
};
$('save').onclick=()=>act('/api/settings',{autoStart:$('auto').checked,sites});
$('copy-mcp').onclick=async()=>{try{await navigator.clipboard.writeText($('mcp').value);message('Connector URL copied.');}catch{ $('mcp').select();message('Select and copy the highlighted URL.');}};
void refresh();setInterval(refresh,3000);
