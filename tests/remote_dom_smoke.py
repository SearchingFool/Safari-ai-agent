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
          // The gateway delivers only the TUNABLE half of policy. The test
          // drives it directly so each mode can be exercised, and so the
          // "malicious gateway" cases can send values no real gateway would.
          window.__policy={mode:'trusted',grants:true,version:'test-1'};
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
                body={command:window.__mockQueue.shift()||null,policy:window.__policy};
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
        # window.confirm cannot express allow-once / allow-always / deny, so the
        # prompt is now a three-way dialog inside the panel's closed shadow
        # root. This stands in for the operator: it answers whatever
        # window.__answer says, and records what it was actually offered so the
        # test can assert that "Always allow" is NOT offered above ROUTINE.
        page.evaluate('''() => {
          window.__answer='once';
          window.__offered=[];
          window.__dialogSeen=0;
          setInterval(()=>{
            const box=window.__panel && window.__panel.querySelector('.approval');
            if(!box || box.hidden) return;
            window.__dialogSeen++;
            window.__offered=[...box.querySelectorAll('button')].map(b=>b.id);
            window.__lastDialog=box.textContent;
            const button=box.querySelector('#approve-'+window.__answer);
            (button||box.querySelector('#approve-deny')).click();
          },20);
        }''')
        def set_answer(value):
            page.evaluate('(v)=>{window.__answer=v;window.__offered=[];window.__dialogSeen=0;}', value)
        def set_policy(policy):
            """Change the gateway-delivered policy and wait for the bridge to apply it."""
            before = page.evaluate('window.__mockPolls.length')
            page.evaluate('(p)=>{window.__policy=p;}', policy)
            page.wait_for_function('(n)=>window.__mockPolls.length>n+1', arg=before, timeout=8000)
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
        # HARD CEILING. This form carries a password field, so its submit is a
        # credential submission: refused structurally, with no text matching at
        # all, and refused even though the site mode is `trusted`. The operator
        # cannot grant past it and neither can the gateway.
        set_answer('always')
        blocked=command('browser_click',{'ref':refs['Submit test form']})
        assert not blocked['success'], blocked
        assert 'never permitted' in blocked['error'], blocked
        assert 'credentials-security' in blocked['error'], blocked
        assert page.evaluate('window.__dialogSeen') == 0, 'a hard ceiling must never even prompt'
        assert page.locator('#feedback').inner_text() == 'No actions yet.'
        set_answer('once')
        safe=command('browser_click',{'ref':refs['Show confirmation']})
        assert safe['success'] and safe['dispatched'] and not safe['verified']
        assert safe['approval'] == 'once', safe
        # An ELEVATED control is one-off only: "Always allow" is never offered.
        assert 'approve-always' not in page.evaluate('window.__offered'), page.evaluate('window.__offered')
        assert 'approve-once' in page.evaluate('window.__offered')
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

        # --- Fail-closed tiering (D-019) --------------------------------------
        # The old classifier returned null for anything unmatched, so an
        # unrecognised control read as an ordinary click. These cases are
        # exactly the ones a keyword list gets wrong, and none of them may be
        # ROUTINE.
        page.evaluate('''() => {
          const host = document.createElement('div');
          host.innerHTML = `
            <button id="z_icon" aria-label=""><svg></svg></button>
            <button id="z_follow" aria-pressed="false">Suivre</button>
            <button id="z_mystery" type="button">Zzyzx</button>
            <button id="z_disclose" type="button" aria-expanded="false">Show details</button>
            <button id="z_tab" role="tab">Results</button>
            <a id="z_link" href="/page-two">Next page</a>
            <a id="z_pseudo" href="#">Open panel</a>
            <a id="z_away" href="https://elsewhere.example/x">Elsewhere</a>
            <button id="z_pay" type="button">Jetzt kaufen</button>
            <button id="z_wipe" type="button">Delete my account</button>
            <button id="z_2fa" type="button">Disable two-factor</button>
            <button id="z_cn" type="button">结账</button>
            <button id="z_quiet" type="button" aria-label="" data-testid="delete-account"></button>
            <form id="z_cardform"><input autocomplete="cc-number" />
              <button id="z_cardgo" aria-label=""><svg></svg></button></form>`;
          document.body.appendChild(host);
        }''')
        # inspect() hands back opaque refs, so classification is probed through
        # the bridge's own entry point rather than by reaching into internals.
        verdicts = page.evaluate('''() => {
          const core = globalThis.SafariAIAgentCore.createAgentCore(document, window);
          const snap = core.inspect();
          const out = {};
          for (const e of snap.elements) {
            const c = core.classify(e.ref);
            out[e.ref] = {tier: c.tier, category: c.category, label: e.label,
                          id: (c.control.name || '') };
          }
          return {snap: snap.elements, verdicts: out};
        }''')
        # Build id -> verdict by matching on the labels we injected.
        by_label = {}
        for ref, v in verdicts['verdicts'].items():
            by_label.setdefault(v['label'], v)

        def tier_of(label):
            assert label in by_label, f'{label} not inspected: {sorted(by_label)}'
            return by_label[label]

        # BLOCKED: hard ceilings. Never grantable, on any site.
        for label, category in [('Jetzt kaufen', 'payment'),            # German
                                ('结账', 'payment'),                     # Chinese
                                ('Delete my account', 'account-deletion'),
                                ('Disable two-factor', 'credentials-security')]:
            v = tier_of(label)
            assert v['tier'] == 'blocked', (label, v)
            assert v['category'] == category, (label, v)
        # The card form's submit has NO accessible name at all and no matching
        # text in any language - it is blocked purely on the structure of the
        # form it belongs to.
        card = [v for v in verdicts['verdicts'].values()
                if v['tier'] == 'blocked' and v['category'] == 'payment' and not v['label']]
        assert card, verdicts['verdicts']
        # ELEVATED: the fail-closed default. Every one of these used to be an
        # ordinary click because no keyword matched.
        for label in ['Suivre', 'Zzyzx', 'Open panel', 'Elsewhere']:
            v = tier_of(label)
            assert v['tier'] == 'elevated', (label, v)
        # An empty accessible name ELEVATES; it must never exempt.
        unnamed = [v for v in verdicts['verdicts'].values() if not v['label']]
        assert unnamed, 'the icon-only button must still appear in the snapshot'
        assert all(v['tier'] in ('elevated', 'blocked') for v in unnamed), unnamed
        # ROUTINE: the short, explicitly enumerated inert set.
        assert tier_of('Show details')['tier'] == 'routine'
        assert tier_of('Show details')['category'] == 'disclosure'
        assert tier_of('Results')['tier'] == 'routine'
        assert tier_of('Next page')['tier'] == 'routine'
        print('PASS: tiering is fail-closed - unknown, unnamed and non-English controls all elevate')

        # --- A hard ceiling is not reachable by any policy (D-025) ------------
        # The gateway is on the network. These are the values a hostile one
        # would send; none of them may widen anything.
        hostile = page.evaluate('''() => {
          const core = globalThis.SafariAIAgentCore.createAgentCore(document, window);
          const snap = core.inspect();
          const out = {blocked: [], unknownMode: null, grantAttempt: null};
          for (const e of snap.elements) {
            const c = core.classify(e.ref);
            if (c.tier !== 'blocked') continue;
            for (const policy of [{mode:'trusted',grants:true},
                                  {mode:'trusted',grants:true,allowBlocked:true},
                                  {mode:'god-mode'},
                                  {mode:'trusted',ceilings:[]},
                                  null, 'trusted', ['trusted']]) {
              out.blocked.push(core.decideClick(c, policy).decision);
            }
            // A blocked classification is never grantable, so there is no class
            // name a standing grant could even be keyed on.
            out.grantAttempt = c.grantable;
            break;
          }
          out.unknownMode = globalThis.SafariAIAgentCore.normalizePolicy({mode:'god-mode'}).mode;
          out.missing = globalThis.SafariAIAgentCore.normalizePolicy(undefined).mode;
          out.arrayMode = globalThis.SafariAIAgentCore.normalizePolicy({mode:['trusted']}).mode;
          return out;
        }''')
        assert hostile['blocked'], 'expected at least one blocked control to probe'
        assert set(hostile['blocked']) == {'refuse'}, hostile['blocked']
        assert hostile['grantAttempt'] is False
        # Every unrecognised policy shape collapses to the most restrictive mode.
        assert hostile['unknownMode'] == 'read-only'
        assert hostile['missing'] == 'read-only'
        assert hostile['arrayMode'] == 'read-only'
        print('PASS: no gateway-supplied policy value reaches past a hard ceiling')

        # --- Site modes gate the bridge independently (D-020) -----------------
        set_policy({'mode': 'read-only', 'grants': True, 'version': 'test-ro'})
        snap3 = command('browser_inspect')['data']          # still allowed
        refs3 = {item['label']: item['ref'] for item in snap3['elements']}
        denied = command('browser_fill', {'ref': refs3['Name'], 'value': 'nope'})
        assert not denied['success'] and 'read-only' in denied['error'], denied
        denied = command('browser_click', {'ref': refs3['Show confirmation']})
        assert not denied['success'] and 'read-only' in denied['error'], denied
        set_policy({'mode': 'fill-only', 'grants': True, 'version': 'test-fo'})
        assert command('browser_fill', {'ref': refs3['Name'], 'value': 'fill only'})['success']
        denied = command('browser_click', {'ref': refs3['Show confirmation']})
        assert not denied['success'] and 'fill-only' in denied['error'], denied
        # A bridge that cannot hear a policy at all must not act either.
        set_policy({'mode': 'nonsense-from-a-bad-gateway'})
        denied = command('browser_click', {'ref': refs3['Show confirmation']})
        assert not denied['success'] and 'read-only' in denied['error'], denied
        print('PASS: read-only and fill-only gate the bridge, and an unparseable policy fails closed')

        # --- Standing grants: operator-set, class-scoped, revocable (D-021) ---
        page.evaluate('''() => {
          const b=document.createElement('button');
          b.id='t_grantable'; b.type='button'; b.setAttribute('aria-expanded','false');
          b.textContent='Toggle details section';
          b.addEventListener('click',()=>{document.querySelector('#feedback').textContent='Disclosure toggled';});
          document.body.appendChild(b);
        }''')
        set_policy({'mode': 'trusted', 'grants': True, 'version': 'test-1'})
        snap4 = command('browser_inspect')['data']
        refs4 = {item['label']: item['ref'] for item in snap4['elements']}
        set_answer('always')
        first = command('browser_click', {'ref': refs4['Toggle details section']})
        assert first['success'] and first['approval'] == 'always', first
        assert page.evaluate('window.__dialogSeen') >= 1
        assert 'approve-always' in page.evaluate('window.__offered')
        # The grant now covers this ACTION CLASS on this origin. The operator is
        # not asked again - proven by arming the stand-in to DENY anything it is
        # shown, so a second dialog would fail the call.
        set_answer('deny')
        command('browser_inspect')
        second = command('browser_click', {'ref': refs4['Toggle details section']})
        assert second['success'] and second['approval'] == 'standing-grant', second
        assert page.evaluate('window.__dialogSeen') == 0, 'a standing grant must not re-prompt'
        # It is scoped to the class, not the element: an ELEVATED control is
        # still prompted (and here denied) while the grant is live.
        command('browser_inspect')
        elevated = command('browser_click', {'ref': refs4['Show confirmation']})
        assert not elevated['success'] and 'denied' in elevated['error'], elevated
        # Listed and individually revocable in the panel, during the session.
        assert 'standing approval' in page.evaluate("window.__panel.querySelector('.grants').textContent")
        assert page.evaluate("window.__panel.querySelector('.grants').textContent").find('disclosure') >= 0
        page.evaluate("window.__panel.querySelector('#revoke-all').click()")
        assert 'No standing approvals' in page.evaluate("window.__panel.querySelector('.grants').textContent")
        command('browser_inspect')
        revoked = command('browser_click', {'ref': refs4['Toggle details section']})
        assert not revoked['success'] and 'denied' in revoked['error'], revoked
        print('PASS: a standing grant is class-scoped, suppresses re-prompting, and is revocable mid-session')

        # --- D-026 (C): completion is possible on a trusted site --------------
        # A plain Save on a form with no password and no card fields. This is
        # the thing the operator asked for: the agent finishes the job.
        page.evaluate('''() => {
          const form=document.createElement('form');
          form.id='t_profile';
          form.innerHTML='<input id="t_city" name="city" type="text" />'+
                         '<button id="t_save2" type="submit">Save changes</button>';
          form.addEventListener('submit',e=>{e.preventDefault();
            document.querySelector('#feedback').textContent='Profile saved';});
          document.body.appendChild(form);
        }''')
        set_answer('once')
        snap5 = command('browser_inspect')['data']
        refs5 = {item['label']: item['ref'] for item in snap5['elements']}
        assert command('browser_fill', {'ref': refs5['Name'], 'value': 'Completed by agent'})['success']
        saved = command('browser_click', {'ref': refs5['Save changes']})
        assert saved['success'] and saved['approval'] == 'once', saved
        page.wait_for_function("document.querySelector('#feedback').textContent === 'Profile saved'", timeout=5000)
        # ...but a form submit is ELEVATED, so it is one approval every time and
        # can never become a standing grant.
        assert 'approve-always' not in page.evaluate('window.__offered'), page.evaluate('window.__offered')
        # And the same Save is refused outright the moment the site is no longer
        # nominated as trusted - everywhere else the conservative behaviour stands.
        set_policy({'mode': 'fill-only', 'grants': True, 'version': 'test-fo2'})
        command('browser_inspect')
        refused = command('browser_click', {'ref': refs5['Save changes']})
        assert not refused['success'] and 'fill-only' in refused['error'], refused
        set_policy({'mode': 'trusted', 'grants': True, 'version': 'test-1'})
        print('PASS: D-026 (C) - a trusted site can be completed, and only a trusted site')

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
