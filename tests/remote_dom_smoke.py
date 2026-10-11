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
          // Kept on window so the D-033 test can switch the stand-in operator
          // off and leave a dialog genuinely unanswered.
          window.__autoAnswer=setInterval(()=>{
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

        # --- ELEVATED is never grantable (D-031) ------------------------------
        # elevatedCategory() is coarse: ANYTHING with a form owner is
        # `form-submit`, so a type="button" preview and the real submit beside
        # it share one action class. Standing grants key on origin + class, so
        # that would be exploitable - one "Always allow" on a harmless preview
        # would cover the submit - EXCEPT that a grant is only ever offered for
        # ROUTINE. That invariant is the only thing holding the shared class
        # safe, and nothing else in the codebase states it, so it is pinned
        # here over a RANGE of controls rather than a single case.
        page.evaluate('''() => {
          const host = document.createElement('div');
          // The first two reproduce the exact /demo/product pair the model
          // raised on the iPad. The rest spread across every elevated category
          // elevatedCategory() can return, plus the routine controls that are
          // the deliberate exception.
          host.innerHTML = `
            <form id="g_form">
              <input name="qty" />
              <button id="g_preview" type="button">Preview selection</button>
              <button id="g_submit" type="submit">Submit demo form</button>
              <a id="g_informlink" href="/terms">Read the terms</a>
            </form>
            <button id="g_toggle" aria-pressed="false">Follow</button>
            <button id="g_mystery" type="button">Flurb</button>
            <button id="g_blank" type="button" aria-label=""><svg></svg></button>
            <a id="g_offsite" href="https://elsewhere.example/x">Elsewhere</a>
            <a id="g_js" href="#">Open panel</a>
            <button id="g_expand" type="button" aria-expanded="false">More detail</button>
            <button id="g_tabctl" role="tab">Second tab</button>
            <a id="g_next" href="/page-three">Page three</a>`;
          document.body.appendChild(host);
        }''')
        invariant = page.evaluate('''() => {
          const core = globalThis.SafariAIAgentCore.createAgentCore(document, window);
          const snap = core.inspect();
          // The most permissive policy any gateway could ever send. If the
          // invariant holds here it holds everywhere, because decideClick can
          // only ever narrow from this.
          const permissive = {mode: 'trusted', grants: true, version: 'x'};
          const rows = [];
          for (const e of snap.elements) {
            const c = core.classify(e.ref);
            rows.push({label: e.label, tier: c.tier, category: c.category,
                       classifyGrantable: c.grantable,
                       decideGrantable: core.decideClick(c, permissive).grantable === true});
          }
          return rows;
        }''')
        assert invariant, 'nothing was inspected, so the invariant was not exercised'
        elevated = [r for r in invariant if r['tier'] == 'elevated']
        assert len(elevated) >= 6, f'too few elevated controls to call this a range: {elevated}'
        for row in invariant:
            if row['tier'] != 'routine':
                # THE INVARIANT. Holds for BLOCKED too; relaxing it for either
                # is what would make the shared form-submit class exploitable.
                assert row['classifyGrantable'] is False, row
                assert row['decideGrantable'] is False, row
            else:
                # Stated as an equality, not a one-way check, so this test also
                # fails if someone makes ROUTINE un-grantable and quietly moves
                # the grant path somewhere this assertion does not watch.
                assert row['decideGrantable'] is True, row
        by_name = {r['label']: r for r in invariant}
        preview, submit = by_name['Preview selection'], by_name['Submit demo form']
        # The defect this guards is precisely that these two are indistinguishable
        # by class. Assert the shared class explicitly, so a future change that
        # splits them makes this line fail loudly and get re-read rather than
        # leaving a stale comment behind.
        assert preview['category'] == submit['category'] == 'form-submit', (preview, submit)
        assert preview['tier'] == submit['tier'] == 'elevated', (preview, submit)
        assert not preview['decideGrantable'] and not submit['decideGrantable'], (preview, submit)
        # The class is broader still than the Preview/Submit pair: an ordinary
        # same-origin link is ROUTINE anywhere else on the page, but inside a
        # form it is `form-submit` too, because inertCategory() refuses to call
        # ANY control with a form owner inert. That is the fail-closed choice
        # and it is correct - but it widens what a single grant on this class
        # would have covered, which is the reason the invariant has to hold
        # rather than merely being likely to.
        assert by_name['Read the terms']['tier'] == 'elevated', by_name['Read the terms']
        assert by_name['Read the terms']['category'] == 'form-submit', by_name['Read the terms']
        assert by_name['Read the terms']['decideGrantable'] is False, by_name['Read the terms']
        # The identical link OUTSIDE a form is routine, so this is form
        # membership doing the work and not a broken link classifier.
        assert by_name['Page three']['tier'] == 'routine', by_name['Page three']
        print('PASS: ELEVATED is never grantable, so Preview and Submit cannot share a standing grant (D-031)')

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
        # The status line is prefixed with a live/idle marker (D-033), so match on
        # the word rather than the start of the string.
        page.wait_for_function("window.__panel.querySelector('.status').textContent.includes('Paused')", timeout=5000)
        # One final poll tells the gateway this tab cannot act, so a queued
        # command is refused immediately rather than timing out as uncertain.
        page.wait_for_function('(n)=>window.__mockPolls.length>n', arg=before, timeout=5000)
        assert page.evaluate('window.__mockPolls[window.__mockPolls.length-1].visibility') == 'hidden'
        paused_at = page.evaluate('window.__mockPolls.length')
        page.wait_for_timeout(2600)   # more than two poll intervals
        assert page.evaluate('window.__mockPolls.length') == paused_at, 'a hidden tab must stop polling'
        assert 'Paused' in status_text()
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

        # --- The panel says which tab is live (D-033) -------------------------
        # With the session following the visible tab, several tabs of one site
        # are normal and only one of them is live. A panel reading "Connected"
        # in all of them would be wrong in all but one.
        page.wait_for_function(
            "window.__panel.querySelector('.status').textContent.includes('Live in this tab')", timeout=8000)
        # A SAME-ORIGIN conflict is the tab-switch case, not a fault. The gateway
        # hands the session over automatically the moment the other tab stops
        # being visible, so the panel must say "you are next" rather than
        # presenting a bare error - while still offering Take over for the one
        # case the gateway cannot decide: two tabs visible at once.
        page.evaluate('''() => { window.__conflict={
          error:'Another tab already owns the device session',
          code:'DEVICE_SESSION_CONFLICT', activeOrigin:window.location.origin,
          activeInstanceId:'tab-sibling', activeVisibility:'visible',
          sameOrigin:true, staleAfterMs:30000, canTakeOver:true}; }''')
        page.wait_for_function(
            "window.__panel.querySelector('.status').textContent.includes('Standing by')", timeout=8000)
        assert 'automatically' in status_text(), status_text()
        assert 'Live in this tab' not in status_text(), status_text()
        assert takeover_hidden() is False, 'Take over must stay available when both tabs are on screen'
        page.evaluate('window.__conflict=null')
        page.wait_for_function(
            "window.__panel.querySelector('.status').textContent.includes('Live in this tab')", timeout=8000)
        print('PASS: the panel distinguishes the live tab from one standing by (D-033)')

        # --- An open approval cannot be answered after the tab goes hidden ----
        # This is the "two tabs acting on one command" case restated. If the
        # dialog survived backgrounding, the operator could switch away, let the
        # session follow to another tab, come back and approve a command this
        # tab no longer holds. Denying on hide is the only fail-closed answer:
        # consent given to an off-screen page is not consent.
        set_policy({'mode': 'trusted', 'grants': True, 'version': 'd033'})
        live_refs = {item['label']: item['ref'] for item in command('browser_inspect')['data']['elements']}
        # Switch the stand-in operator off so the dialog is left genuinely open,
        # the way a real one is while the human is reading it.
        page.evaluate('clearInterval(window.__autoAnswer)')
        page.evaluate('''(ref) => { window.__mockQueue.push({
          id:'00000000-0000-4000-8000-00000000d033', action:'browser_click',
          args:{ref}, origin:'null', expiresAt:Date.now()+60000}); }''',
                      live_refs['Show confirmation'])
        page.wait_for_function(
            "window.__panel.querySelector('.approval').hidden===false", timeout=8000)
        page.evaluate("window.__visibility='hidden';document.dispatchEvent(new Event('visibilitychange'))")
        page.wait_for_function(
            "window.__panel.querySelector('.approval').hidden===true", timeout=5000)
        denied = page.evaluate(
            "window.__mockResults.filter(r=>r.id==='00000000-0000-4000-8000-00000000d033')")
        assert denied and denied[0]['result']['success'] is False, denied
        assert 'denied' in denied[0]['result']['error'], denied
        # And the click never reached the page: the feedback element is whatever
        # the earlier approved click left, not a second dispatch.
        page.evaluate("window.__visibility='visible';document.dispatchEvent(new Event('visibilitychange'))")
        print('PASS: an approval left open in a tab that backgrounds is denied, never answerable later')

        # --- D-032: field values are opt-in, trusted-only, and bounded --------
        # The snapshot used to omit every field value, which made UPDATING a
        # form blind. Values can now be reported, but only on a trusted origin
        # the operator opted in, and never for the categories below whatever
        # policy says. Every secret planted here is a distinct marker so a leak
        # names itself.
        page.evaluate('''() => {
          const host=document.createElement('div');
          host.innerHTML = `
            <form id="v_plain">
              <input id="v_city" aria-label="City field" value="Praha" />
              <textarea id="v_note" aria-label="Note field">existing note</textarea>
              <select id="v_kind" aria-label="Kind field">
                <option value="alpha">Alpha</option>
                <option value="beta" selected>Beta</option></select>
              <div id="v_rich" contenteditable="true" aria-label="Rich field">rich existing text</div>
              <input id="v_empty" aria-label="Empty field" value="" />
              <input id="v_long" aria-label="Long field" value="${'L'.repeat(400)}" />
              <input id="v_colour" type="color" aria-label="Colour field" value="#123456" />
              <!-- Sensitive autofill tokens, in a form that is otherwise ordinary,
                   so ONLY the token check can be what excludes them. The second
                   is a token LIST and does not match the cc- prefix selector. -->
              <input id="v_otp" autocomplete="one-time-code" aria-label="Code field" value="OTPSECRET9" />
              <input id="v_csc" autocomplete="shipping cc-csc" aria-label="Csc field" value="CSCSECRET9" />
              <input id="v_newpw" autocomplete="new-password" aria-label="Newpw field" value="NEWPWSECRET9" />
              <input id="v_hidden" type="hidden" name="csrf" value="HIDDENSECRET9" />
            </form>
            <!-- Deliberately OUTSIDE any form, so no form-level rule can be what
                 excludes these and each element-level guard is on its own.
                 "transaction-amount" matches the CC_AUTOFILL selector but is
                 neither a cc- prefix nor a sensitive token, so it isolates the
                 selector; the lone password isolates the type check. -->
            <input id="v_loose" autocomplete="cc-number" aria-label="Loose card field" value="LOOSESECRET9" />
            <input id="v_amount" autocomplete="transaction-amount" aria-label="Amount field" value="AMOUNTSECRET9" />
            <input id="v_lonepw" type="password" aria-label="Lone pass field" value="LONEPASSSECRET9" />
            <form id="v_pwform">
              <input id="v_user" aria-label="Account field" value="USERSECRET9" />
              <input id="v_pass" type="password" aria-label="Pass field" value="PASSSECRET9" />
            </form>
            <form id="v_ccform">
              <input id="v_ccname" aria-label="Cardholder field" value="HOLDERSECRET9" />
              <input id="v_ccnum" autocomplete="cc-number" aria-label="Cardnum field" value="CCNUMSECRET9" />
            </form>`;
          document.body.appendChild(host);
        }''')
        SECRETS = ['PASSSECRET9', 'USERSECRET9', 'HOLDERSECRET9', 'CCNUMSECRET9',
                   'OTPSECRET9', 'CSCSECRET9', 'NEWPWSECRET9', 'HIDDENSECRET9',
                   'LOOSESECRET9', 'AMOUNTSECRET9', 'LONEPASSSECRET9']

        def values_by_label(policy):
            """Snapshot through core directly so a policy shape no gateway would
            ever send can still be tried."""
            return page.evaluate('''(policy) => {
              const core = globalThis.SafariAIAgentCore.createAgentCore(document, window);
              const snap = core.inspect(policy);
              const out = {fieldValues: snap.fieldValues === true, raw: JSON.stringify(snap),
                           hidden: snap.elements.filter(e => e.type === 'hidden').length, byLabel: {}};
              for (const e of snap.elements) {
                out.byLabel[e.label] = Object.hasOwn(e, 'value')
                  ? {value: e.value, truncated: e.valueTruncated === true} : null;
              }
              return out;
            }''', policy)

        on = {'mode': 'trusted', 'grants': True, 'values': True, 'version': 'd032-on'}
        got = values_by_label(on)
        assert got['fieldValues'] is True, got['fieldValues']
        # Ordinary text, textarea, select and contenteditable all read back.
        assert got['byLabel']['City field']['value'] == 'Praha', got['byLabel']['City field']
        assert got['byLabel']['Note field']['value'] == 'existing note'
        assert got['byLabel']['Kind field']['value'] == 'beta'
        assert got['byLabel']['Rich field']['value'] == 'rich existing text'
        # An empty field reports "" rather than nothing. `value` absent and
        # `value: ""` mean different things and the agent must be able to tell
        # "nobody filled this in" from "this was not disclosed".
        assert got['byLabel']['Empty field'] == {'value': '', 'truncated': False}, got['byLabel']['Empty field']
        # Bounded, and it says so, so a caller comparing a fill against the
        # readback can tell a truncation from a mismatch.
        assert len(got['byLabel']['Long field']['value']) == 200, got['byLabel']['Long field']
        assert got['byLabel']['Long field']['truncated'] is True
        # Value reporting is ALLOWLISTED by control kind: an input type nobody
        # enumerated reports nothing even with values fully on.
        assert got['byLabel']['Colour field'] is None, got['byLabel']['Colour field']
        # Snapshot size stays bounded: 100 elements x 200 chars is the ceiling.
        assert len(got['raw']) < 50000, len(got['raw'])
        # EVERY hard exclusion, each pinned on its own label so a broken guard
        # names itself rather than failing as one anonymous blob.
        for label in ['Pass field',        # input[type=password]
                      'Account field',     # sibling of a password in one form
                      'Cardholder field',  # sibling of a cc-* field in one form
                      'Cardnum field',     # matches CC_AUTOFILL itself
                      'Loose card field',  # matches CC_AUTOFILL with no form at all
                      'Amount field',      # CC_AUTOFILL selector only, no cc- token
                      'Lone pass field',   # a password field with no form at all
                      'Code field',        # autocomplete=one-time-code
                      'Csc field',         # "shipping cc-csc" - a token LIST
                      'Newpw field']:      # autocomplete=new-password
            assert got['byLabel'].get(label) is None, (label, got['byLabel'].get(label))
        for secret in SECRETS:
            assert secret not in got['raw'], secret
        # The hidden input is excluded twice over: inspect() drops type=hidden
        # before describe() runs, and valueExcluded refuses it again. Only the
        # first of those two is observable from outside, so this pins the
        # OUTCOME (no hidden field, with or without its value, ever appears).
        assert got['hidden'] == 0, got['hidden']
        print('PASS: D-032 values report ordinary fields, bounded, with every hard exclusion silent')

        # Opt-in means opt-in. `trusted` on its own discloses nothing new, which
        # is the property that makes this a FLAG and not a fourth mode.
        for policy in [{'mode': 'trusted', 'grants': True, 'version': 'd032-off'},
                       {'mode': 'trusted', 'grants': True, 'values': False, 'version': 'x'},
                       {'mode': 'fill-only', 'grants': True, 'values': True, 'version': 'x'},
                       {'mode': 'read-only', 'grants': True, 'values': True, 'version': 'x'},
                       # An origin absent from the gateway's policy map arrives
                       # as nothing at all and normalises to read-only.
                       None, {}, {'values': True}]:
            quiet = values_by_label(policy)
            assert quiet['fieldValues'] is False, (policy, quiet['fieldValues'])
            assert 'Praha' not in quiet['raw'], policy
            assert all(v is None for v in quiet['byLabel'].values()), (policy, quiet['byLabel'])
        print('PASS: no value is reported without opt-in, and never on a read-only or fill-only origin')

        # --- A hostile gateway cannot reach a value exclusion (D-032/D-025) ---
        # The same discipline as the hard-ceiling probe above: these are the
        # values a compromised or confused gateway would send. None of them may
        # widen anything, and several are the obvious shapes of an attempt to
        # name a field or switch an exclusion off.
        hostile_values = page.evaluate('''(secrets) => {
          const core = globalThis.SafariAIAgentCore.createAgentCore(document, window);
          const shapes = [
            {mode:'trusted',values:true,includePasswords:true},
            {mode:'trusted',values:true,exclusions:[]},
            {mode:'trusted',values:true,fields:['v_pass','v_user','v_ccnum']},
            {mode:'trusted',values:'all'},
            {mode:'trusted',values:1},
            {mode:'trusted',values:['everything']},
            {mode:'trusted',values:{all:true}},
            {mode:'god-mode',values:true},
            {mode:'trusted',values:true,maxValue:100000},
            {mode:'read-only',values:true,trustMe:true},
            {mode:'fill-only',values:true},
            {values:true},
            'trusted', ['trusted'], true, 42, null, undefined
          ];
          // A <select>'s option list has always carried option VALUES, so a
          // substring search for "value" matches every snapshot. Count the
          // field-value property itself instead.
          const reports = snap => snap.elements.some(e => Object.hasOwn(e, 'value'));
          const leaks = [];
          let reported = 0;
          for (const shape of shapes) {
            const snap = core.inspect(shape);
            const raw = JSON.stringify(snap);
            for (const secret of secrets) if (raw.includes(secret)) leaks.push([JSON.stringify(shape), secret]);
            if (reports(snap)) reported++;
          }
          // Four of these ARE legitimate opt-ins carrying extra junk keys
          // (includePasswords, exclusions, fields, maxValue). They are in the
          // list precisely because the junk must change nothing: the shape is
          // read for mode and a strictly-true `values` and for nothing else.
          const legitimate = shapes.filter(s => s && s.mode === 'trusted' && s.values === true).length;
          return {leaks, reported, legitimate, shapes: shapes.length,
                  // A truthy-but-not-true `values` must read as OFF, so these
                  // are a proper subset of "reported nothing".
                  truthy: reports(core.inspect({mode:'trusted',values:'yes'}))};
        }''', SECRETS)
        assert hostile_values['leaks'] == [], hostile_values['leaks']
        # Only the legitimate opt-ins report anything at all, and the count is
        # derived from the shapes rather than hardcoded, so adding a hostile
        # shape to the list cannot quietly raise the bar it is measured against.
        assert hostile_values['legitimate'] == 4, hostile_values
        assert hostile_values['reported'] == hostile_values['legitimate'], hostile_values
        assert hostile_values['truthy'] is False, hostile_values
        print('PASS: no gateway-supplied policy value reports an excluded field, or opts in by accident')

        # --- End to end through the bridge, not just through core -------------
        # core.inspect() is where the rule lives, but the path that matters is
        # the one a command actually travels: gateway policy -> applyPolicy ->
        # execute('browser_inspect').
        set_policy({'mode': 'trusted', 'grants': True, 'values': True, 'version': 'd032-live'})
        live = command('browser_inspect')['data']
        live_by_label = {e['label']: e for e in live['elements']}
        assert live.get('fieldValues') is True, live.get('fieldValues')
        assert live_by_label['City field']['value'] == 'Praha'
        assert 'never-share-me' not in json.dumps(live), 'the fixture password must never be reported'
        for secret in SECRETS:
            assert secret not in json.dumps(live), secret
        # The demo fixture's whole form carries a password field, so every field
        # in it - Name, Email, Category, delivery, Note - is excluded with it.
        assert 'value' not in live_by_label['Name'], live_by_label['Name']
        # The panel says so in the tab where the disclosure happens.
        assert 'FIELD VALUES' in page.evaluate("window.__panel.querySelector('.mode').textContent")
        set_policy({'mode': 'trusted', 'grants': True, 'version': 'd032-live-off'})
        off_live = command('browser_inspect')['data']
        assert 'fieldValues' not in off_live, off_live.get('fieldValues')
        assert all('value' not in e for e in off_live['elements']), off_live['elements']
        assert 'FIELD VALUES' not in page.evaluate("window.__panel.querySelector('.mode').textContent")
        print('PASS: D-032 opt-in travels gateway -> bridge -> snapshot, and switching it off is immediate')

        page.evaluate("window.__settings['safari-agent:enabled:null']=false")
        print('PASS: remote script mock-GM inspect/fill/constraints/approval/click/verify')
        print('PASS: describeControl identifies toggles, form submits, pseudo-links and external targets')
        browser.close()

if __name__=='__main__':main()
