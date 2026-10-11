"""Offline Chromium smoke test for the remote Userscripts bridge.

MCP gateway is tested separately via Node HTTP tests. This test intentionally
mocks only GM privileged APIs, not real Safari or remote networking.
"""
import json
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
core = (ROOT / 'src/core.js').read_text()
remote = (ROOT / 'src/remote.js').read_text()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=shutil.which('chromium'), args=['--no-sandbox'])
        page = browser.new_page()
        page.on('dialog', lambda dialog: dialog.accept())
        page.set_content((ROOT / 'tests/fixtures/demo.html').read_text())
        page.add_script_tag(content='''
          window.__mockQueue=[]; window.__mockResults=[]; window.__mockPolls=[];
          // The panel lives in a CLOSED shadow root so page scripts cannot read
          // typed secrets. The test needs to read the status line and the
          // takeover button, so it forces the root open for THIS run only.
          // Production behaviour is unchanged; nothing below relies on it.
          const attach=Element.prototype.attachShadow;
          Element.prototype.attachShadow=function(init){
            const root=attach.call(this,{...init,mode:'open'});
            if(this.hasAttribute('data-safari-ai-remote-host'))window.__panel=root;
            return root;
          };
          // document.visibilityState cannot be driven from headless Chromium,
          // so it is overridden here. The script under test reads exactly this
          // property and listens for exactly this event.
          Object.defineProperty(Document.prototype,'visibilityState',
            {configurable:true,get:()=>window.__visibility||'visible'});
          window.__conflict=null;
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
              if(path==='/device/poll'){
                window.__mockPolls.push(payload);
                if(window.__conflict)return Promise.resolve({status:409,responseText:JSON.stringify(window.__conflict)});
                body={command:window.__mockQueue.shift()||null};
              }
              else if(path==='/device/result'){window.__mockResults.push(payload);body={accepted:true};}
              else if(path==='/device/disconnect')body={disconnected:true};
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
        # describeControl must identify a control well enough for a human to
        # consent to it. These are exactly the cases a label-only regex misses:
        # icon-only buttons, non-English labels, and aria-pressed toggles.
        described = page.evaluate('''() => {
          const host = document.createElement('div');
          host.innerHTML = `
            <button id="t_icon" aria-label=""><svg></svg></button>
            <button id="t_follow" aria-pressed="false">Suivre</button>
            <form><button id="t_save">Save</button></form>
            <a id="t_pseudo" href="#">Open panel</a>
            <a id="t_ext" href="https://elsewhere.example/x">Elsewhere</a>`;
          document.body.appendChild(host);
          const core = globalThis.SafariAIAgentCore.createAgentCore(document, window);
          const snap = core.inspect();
          const byLabel = {};
          for (const e of snap.elements) byLabel[e.label] = e.ref;
          const out = {};
          for (const [key, label] of [['follow','Suivre'],['save','Save'],
                                      ['pseudo','Open panel'],['ext','Elsewhere']]) {
            if (byLabel[label]) out[key] = core.previewClick(byLabel[label]);
          }
          return out;
        }''')
        # A toggle is recognised structurally, so translation does not defeat it.
        assert described['follow']['control']['isToggle'] is True, described['follow']
        assert described['follow']['control']['togglePressed'] is False
        # A bare <button> inside a <form> is a submit regardless of its label.
        assert described['save']['control']['isSubmit'] is True, described['save']
        assert 'submits a form' in described['save']['summary']
        # href="#" is a scripted action, not navigation.
        assert described['pseudo']['control']['isPseudoLink'] is True, described['pseudo']
        # Off-origin destinations are surfaced in the human summary.
        assert described['ext']['control']['external'] is True
        assert 'elsewhere.example' in described['ext']['summary']

        # --- Tab identity on every device call (D-023) ------------------------
        polls = page.evaluate('window.__mockPolls')
        assert polls, 'the bridge must poll at least once'
        instances = {p.get('instanceId') for p in polls}
        assert len(instances) == 1, f'instance id must be stable within a tab: {instances}'
        instance = instances.pop()
        assert isinstance(instance, str) and 8 <= len(instance) <= 64, instance
        # An opaque test origin denies sessionStorage, so this also proves the
        # memory-only fallback produces a usable id rather than throwing.
        assert all(p.get('visibility') == 'visible' for p in polls), polls
        results = page.evaluate('window.__mockResults')
        assert all(r.get('instanceId') == instance for r in results), results
        print('PASS: every poll and result carries a stable per-tab instance id and visibility')

        # --- target="_blank" stays in the paired tab (D-023 fix 3) ------------
        # The agent clicks a button; the PAGE then opens a target="_blank" link
        # in response. That is the casual real-world route into a second tab,
        # and the fixture page has an opaque origin, where core.click refuses
        # anchors outright ('Unsupported link protocol'), so driving the anchor
        # directly could not exercise this path at all.
        page.evaluate('''() => {
          const a=document.createElement('a');
          a.id='t_newtab'; a.target='_blank'; a.href='#companion';
          a.textContent='companion link';
          const b=document.createElement('button');
          b.id='t_trigger'; b.type='button'; b.textContent='Open companion window';
          b.addEventListener('click',()=>document.getElementById('t_newtab').click());
          document.body.append(a,b);
        }''')
        snap2 = command('browser_inspect')['data']
        refs2 = {item['label']: item['ref'] for item in snap2['elements']}
        assert command('browser_click', {'ref': refs2['Open companion window']})['success']
        # The result is acknowledged to the gateway BEFORE the real click is
        # dispatched (so the ack survives an unload), so wait for the dispatch.
        # Without the rewrite this navigation lands in a NEW tab, orphaning the
        # paired session in the tab the operator is still looking at.
        page.wait_for_function("document.querySelector('#t_newtab').getAttribute('target')==='_self'", timeout=5000)
        print('PASS: a target="_blank" click is retargeted to _self so the session stays in this tab')

        # --- Hidden tab pauses instead of silently dying (D-023 fix 5) --------
        def status_text():
            return page.evaluate("window.__panel.querySelector('.status').textContent")
        def takeover_hidden():
            return page.evaluate("window.__panel.querySelector('#takeover').hidden")
        before = page.evaluate('window.__mockPolls.length')
        page.evaluate("window.__visibility='hidden';document.dispatchEvent(new Event('visibilitychange'))")
        page.wait_for_function("window.__panel.querySelector('.status').textContent.startsWith('Paused')", timeout=5000)
        # One final poll tells the gateway this tab cannot act, so a queued
        # command is refused immediately rather than timing out as uncertain.
        page.wait_for_function('(n)=>window.__mockPolls.length>n', arg=before, timeout=5000)
        assert page.evaluate('window.__mockPolls[window.__mockPolls.length-1].visibility') == 'hidden'
        paused_at = page.evaluate('window.__mockPolls.length')
        page.wait_for_timeout(2600)   # more than two poll intervals
        assert page.evaluate('window.__mockPolls.length') == paused_at, 'a hidden tab must stop polling'
        assert status_text().startswith('Paused')
        page.evaluate("window.__visibility='visible';document.dispatchEvent(new Event('visibilitychange'))")
        page.wait_for_function('(n)=>window.__mockPolls.length>n', arg=paused_at, timeout=5000)
        assert page.evaluate('window.__mockPolls[window.__mockPolls.length-1].visibility') == 'visible'
        print('PASS: a backgrounded tab pauses visibly and resumes on return')

        # --- Session conflict is explained and recoverable (D-017) ------------
        page.evaluate('''() => { window.__conflict={
          error:'Another tab already owns the device session',
          code:'DEVICE_SESSION_CONFLICT', activeOrigin:'https://other.example',
          activeInstanceId:'tab-other', sameOrigin:false, staleAfterMs:30000, canTakeOver:true}; }''')
        page.wait_for_function("window.__panel.querySelector('.status').textContent.includes('other.example')", timeout=8000)
        assert 'Take over' in status_text(), status_text()
        assert takeover_hidden() is False, 'the takeover action must be offered on conflict'
        page.evaluate('window.__conflict=null')
        count = page.evaluate('window.__mockPolls.length')
        page.evaluate("window.__panel.querySelector('#takeover').click()")
        page.wait_for_function('(n)=>window.__mockPolls.length>n', arg=count, timeout=8000)
        assert any(p.get('takeover') is True for p in page.evaluate('window.__mockPolls')), 'takeover must be sent explicitly'
        page.wait_for_function('window.__panel.querySelector("#takeover").hidden', timeout=8000)
        print('PASS: a session conflict names the owning origin and offers an explicit takeover')

        page.evaluate("window.__settings['safari-agent:enabled:null']=false")
        print('PASS: remote script mock-GM inspect/fill/constraints/approval/click/verify')
        print('PASS: describeControl identifies toggles, form submits, pseudo-links and external targets')
        browser.close()

if __name__=='__main__':main()
