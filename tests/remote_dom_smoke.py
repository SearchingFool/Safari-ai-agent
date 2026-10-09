"""Offline Chromium smoke test for the remote Userscripts bridge.

MCP gateway is tested separately via Node HTTP tests. This test intentionally
mocks only GM privileged APIs, not real Safari or remote networking.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
core = (ROOT / 'src/core.js').read_text()
remote = (ROOT / 'src/remote.js').read_text()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page()
        page.on('dialog', lambda dialog: dialog.accept())
        page.set_content((ROOT / 'tests/fixtures/demo.html').read_text())
        page.add_script_tag(content='''
          window.__mockQueue=[]; window.__mockResults=[];
          const origin=window.location.origin;
          window.__settings={
            'safari-agent:gateway-url':'https://gateway.test',
            'safari-agent:device-token':'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
            ['safari-agent:enabled:'+origin]:true
          };
          window.GM={
            getValue:(key,def)=>Promise.resolve(window.__settings[key]??def),
            setValue:(key,val)=>{window.__settings[key]=val;return Promise.resolve();},
            xmlHttpRequest:details=>{
              const path=new URL(details.url).pathname;
              const payload=JSON.parse(details.data);
              let body={};
              if(path==='/device/poll')body={command:window.__mockQueue.shift()||null};
              else if(path==='/device/result'){window.__mockResults.push(payload);body={accepted:true};}
              return Promise.resolve({status:200,responseText:JSON.stringify(body)});
            }
          };
        ''')
        page.add_script_tag(content=core)
        page.add_script_tag(content=remote)
        assert page.locator('[data-safari-ai-remote-host]').count() == 1
        def command(name, arguments=None):
            last=page.evaluate('window.__mockResults.length')
            obj={'id': '00000000-0000-4000-8000-' + str(last+1).zfill(12),
                 'action':name,'args':arguments or {},'origin':'null',
                 'expiresAt':9999999999999}
            page.evaluate('(c)=>window.__mockQueue.push(c)',obj)
            page.wait_for_function('(n)=>window.__mockResults.length > n',arg=last,timeout=8000)
            return page.evaluate('window.__mockResults[window.__mockResults.length-1].result')
        snap=command('browser_inspect')['data']
        assert snap['title']=='Safari AI Agent Test Page'
        assert 'never-share-me' not in json.dumps(snap)
        refs={item['label']:item['ref'] for item in snap['elements']}
        assert command('browser_fill',{'ref':refs['Name'],'value':'MCP test'})['success']
        assert page.locator('#person').input_value() == 'MCP test'
        assert command('browser_fill',{'ref':refs['Preferred delivery time'],'value':'14:30'})['success']
        assert page.locator('#delivery').input_value() == '14:30'
        assert command('browser_fill',{'ref':refs['Preferred delivery time'],'value':'14:20'})['success'] is False
        assert page.locator('#delivery').input_value() == '14:30'
        blocked=command('browser_click',{'ref':refs['Submit test form']})
        assert not blocked['success'] and 'High-impact' in blocked['error']
        assert page.locator('#feedback').inner_text() == 'No actions yet.'
        safe=command('browser_click',{'ref':refs['Show confirmation']})
        assert safe['success'] and safe['dispatched'] and not safe['verified']
        page.wait_for_function("document.querySelector('#feedback').textContent === 'Button clicked'")
        result=command('browser_verify',{'textIncludes':'Button clicked'})
        assert result['success']
        page.evaluate("window.__settings['safari-agent:enabled:null']=false")
        print('PASS: remote script mock-GM inspect/fill/constraints/approval/click/verify')
        browser.close()

if __name__=='__main__':main()
