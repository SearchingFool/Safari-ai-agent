"""Integration test: real Node HTTP MCP gateway -> GM transport shim -> real Chromium DOM.

The execution environment blocks Chromium HTTP(S) page navigation, even when Playwright
intercepts requests. We load HTML with page.set_content and translate the resulting
opaque test-page origin ('null') into the configured example.org origin **inside the
GM test shim only**. The production adapter and gateway are not changed for this.

This tests real MCP HTTP, queueing, authenticated device calls and Chromium DOM actions.
It cannot establish iPad/Userscripts extension behavior or cross-page continuity.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
from urllib import request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://example.org'
CLIENT = 'M' * 48
DEVICE = 'D' * 48

def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def post(url, value, token):
    req=request.Request(url, data=json.dumps(value).encode(), headers={
        'Authorization':f'Bearer {token}', 'Content-Type':'application/json'},method='POST')
    with request.urlopen(req,timeout=30) as resp:
        return json.load(resp)

def decoded(response):
    result=response['result']
    data=json.loads(result['content'][0]['text'])
    return {'isError':result.get('isError',False),**data}


def main():
    chosen_port=port()
    host=f'http://127.0.0.1:{chosen_port}'
    env={**os.environ,'MCP_CLIENT_TOKEN':CLIENT,'DEVICE_TOKEN':DEVICE,
         'SAFARI_ALLOWED_ORIGINS':ORIGIN,'PORT':str(chosen_port)}
    gateway=subprocess.Popen(['node','gateway/server.mjs'],cwd=ROOT,env=env,
                             stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(30):
            try:
                request.urlopen(host+'/health',timeout=.3).close();break
            except Exception:
                time.sleep(.1)
        else: raise RuntimeError('Gateway did not become healthy')

        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
            context=browser.new_context()
            def gm_bridge(_source,details):
                assert details['headers']['Authorization']=='Bearer '+DEVICE
                assert details['url'].startswith('https://gateway.test/device/')
                pathname=details['url'].removeprefix('https://gateway.test')
                args=json.loads(details['data'])
                if args.get('origin')=='null':args['origin']=ORIGIN
                response=post(host+pathname,args,DEVICE)
                if response.get('command'):
                    response['command']['origin']='null'
                return {'status':200,'responseText':json.dumps(response)}
            context.expose_binding('__gmBridge',gm_bridge)
            page=context.new_page()
            page.on('dialog',lambda d:d.accept())
            page.set_content((ROOT/'tests/fixtures/demo.html').read_text())
            page.add_script_tag(content='''
                window.__gmStore={
                    'safari-agent:gateway-url':'https://gateway.test',
                    'safari-agent:device-token':'%s',
                    'safari-agent:enabled:null':true
                };
                window.GM={
                  getValue:(key,def)=>Promise.resolve(window.__gmStore[key]??def),
                  setValue:(key,val)=>{window.__gmStore[key]=val;return Promise.resolve();},
                  xmlHttpRequest:details=>window.__gmBridge(details)
                };
            ''' % DEVICE)
            page.add_script_tag(content=(ROOT/'src/core.js').read_text())
            page.add_script_tag(content=(ROOT/'src/remote.js').read_text())
            with ThreadPoolExecutor(max_workers=2) as pool:
                def rpc(name,args=None,number=1):
                    body={'jsonrpc':'2.0','id':number,'method':'tools/call',
                          'params':{'name':name,'arguments':args or {}}}
                    future=pool.submit(post,host+'/mcp',body,CLIENT)
                    deadline=time.time()+15
                    # Continue processing exposed GM bridge callbacks while Node waits
                    # for the browser to poll and submit its actual action result.
                    while not future.done() and time.time()<deadline:
                        page.wait_for_timeout(90)
                    return decoded(future.result(timeout=1))
                page.wait_for_timeout(400)
                status=rpc('browser_status',number=1)
                assert status['connected'],status
                observed=rpc('browser_inspect',number=2)
                assert observed['success'],observed
                controls={x['label']:x['ref'] for x in observed['data']['elements']}
                assert 'never-share-me' not in json.dumps(observed)
                assert rpc('browser_fill',{'ref':controls['Name'],'value':'Integration Test'},3)['success']
                assert page.locator('#person').input_value()=='Integration Test'
                assert rpc('browser_fill',{'ref':controls['Preferred delivery time'],'value':'14:30'},4)['success']
                assert page.locator('#delivery').input_value()=='14:30'
                bad=rpc('browser_fill',{'ref':controls['Preferred delivery time'],'value':'14:20'},5)
                assert bad['isError'] and page.locator('#delivery').input_value()=='14:30',bad
                denied=rpc('browser_click',{'ref':controls['Submit test form']},6)
                assert denied['isError'] and 'High-impact' in denied['error'],denied
                assert page.locator('#feedback').inner_text()=='No actions yet.'
                clicked=rpc('browser_click',{'ref':controls['Show confirmation']},7)
                assert clicked['dispatched'] and not clicked['verified'],clicked
                page.wait_for_function("document.querySelector('#feedback').textContent==='Button clicked'")
                verified=rpc('browser_verify',{'textIncludes':'Button clicked'},8)
                assert verified['success'],verified
                print('PASS: real MCP HTTP gateway -> authenticated device transport shim -> Chromium DOM -> verify')
            browser.close()
    finally:
        gateway.terminate()
        with suppress(Exception):gateway.wait(timeout=3)

if __name__=='__main__':main()
