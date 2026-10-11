"""Rendered-geometry checks for the approval dialog (D-036, D-038).

The other browser suites assert DOM STRUCTURE - that a button exists and sits in
the right container. That proves nothing about whether a human can see it or hit
it, which is the whole of D-036: the escape hatch was present in the DOM the
entire time it was unreachable.

This renders the real dialog at real iPad viewports and measures what came out.
It caught D-038 on the first run: every button in the dialog, including the Deny
the operator had already mis-tapped on hardware, rendered 37px tall against
Apple's 44pt minimum.

Split View is MANDATORY on iPadOS (D-029), so the narrow viewports here are the
normal operating condition, not an edge case.
"""

import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
core = (ROOT / 'src/core.js').read_text()
remote = (ROOT / 'src/remote.js').read_text()

HARNESS = '''
  window.__mockQueue=[]; window.__mockResults=[]; window.__mockPolls=[];
  const attach=Element.prototype.attachShadow;
  Element.prototype.attachShadow=function(init){
    const root=attach.call(this,{...init,mode:'open'});
    if(this.hasAttribute('data-safari-ai-remote-host'))window.__panel=root;
    return root;
  };
  Object.defineProperty(Document.prototype,'visibilityState',
    {configurable:true,get:()=>window.__visibility||'visible'});
  window.__policy={mode:'trusted',grants:true,version:'vis-1'};
  const origin=window.location.origin;
  window.__settings={
    'safari-agent:gateway-url':'https://gateway.test',
    'safari-agent:device-token':'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
    ['safari-agent:enabled:'+origin]:true
  };
  window.GM={
    getValue:(k,d)=>Promise.resolve(window.__settings[k]??d),
    setValue:(k,v)=>{window.__settings[k]=v;return Promise.resolve();},
    xmlHttpRequest:details=>{
      const path=new URL(details.url).pathname;
      const payload=JSON.parse(details.data);
      let body={};
      if(path==='/device/poll'){
        window.__mockPolls.push(payload);
        body={command:window.__mockQueue.shift()||null,policy:window.__policy};
      }
      else if(path==='/device/result'){window.__mockResults.push(payload);body={accepted:true};}
      else if(path==='/device/disconnect')body={disconnected:true};
      return Promise.resolve({status:200,responseText:JSON.stringify(body)});
    }
  };
'''

# Real iPad CSS viewports. Split View is MANDATORY on iPadOS (D-029), so the
# narrow cases are the normal operating condition, not an edge case.
VIEWPORTS = [
    ('iPad 11in portrait, full screen', 834, 1194),
    ('iPad 11in landscape, full screen', 1194, 834),
    ('Split View 1/2', 507, 834),
    ('Split View 1/3 - narrowest supported', 320, 834),
]

# Apple HIG minimum hit target is 44x44pt. Below that is a mis-tap generator.
MIN_TAP = 44.0


def probe(page, label, width, height, shots):
    page.set_viewport_size({'width': width, 'height': height})
    page.evaluate('''() => { window.__mockQueue.push({
      id:'00000000-0000-4000-8000-0000000000f1', action:'browser_click',
      args:{ref:window.__ref}, origin:window.location.origin,
      expiresAt:Date.now()+600000}); }''')
    try:
        page.wait_for_function("window.__panel.querySelector('.approval').hidden===false", timeout=8000)
    except Exception:
        print('  no dialog. results so far:', page.evaluate('JSON.stringify(window.__mockResults.slice(-3))'))
        print('  status:', page.evaluate("window.__panel.querySelector('.status').textContent"))
        raise
    page.wait_for_timeout(250)

    geom = page.evaluate('''() => {
      const root=window.__panel;
      const box=root.querySelector('.approval');
      const stop=root.querySelector('#approve-stop');
      const deny=root.querySelector('#approve-deny');
      const once=root.querySelector('#approve-once');
      const r=el=>{const b=el.getBoundingClientRect();
                   return {x:b.x,y:b.y,w:b.width,h:b.height,top:b.top,bottom:b.bottom,left:b.left,right:b.right};};
      const cs=getComputedStyle(stop);
      return {
        dialog:r(box), stop:r(stop), deny:r(deny), once:r(once),
        stopBg:cs.backgroundColor, denyBg:getComputedStyle(deny).backgroundColor,
        vw:innerWidth, vh:innerHeight,
        // What does the browser say is ACTUALLY at the button's centre point?
        // This is the real test of "covered by something" - not a z-index read.
        hitId:(()=>{const b=stop.getBoundingClientRect();
          const node=root.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
          return node?(node.id||node.tagName):null;})()
      };
    }''')

    shot = f'/tmp/approval-{label.split(",")[0].replace(" ","-").replace("/","-")}.png'
    page.screenshot(path=shot)
    shots.append(shot)

    problems = []
    # EVERY button, not just the escape. Deny is the one already mis-tapped.
    for name, box in (('Allow once', geom['once']), ('Deny', geom['deny']), ('Stop', geom['stop'])):
        if box['h'] < MIN_TAP:
            problems.append(f"{name} is {box['h']:.0f}px tall, below the {MIN_TAP:.0f}px minimum")
    s = geom['stop']
    if s['h'] < MIN_TAP:
        problems.append(f"tap target {s['h']:.0f}px tall, below the {MIN_TAP:.0f}px minimum")
    if s['w'] < MIN_TAP:
        problems.append(f"tap target {s['w']:.0f}px wide, below the {MIN_TAP:.0f}px minimum")
    if s['top'] < 0 or s['bottom'] > geom['vh']:
        problems.append(f"clipped vertically: top={s['top']:.0f} bottom={s['bottom']:.0f} viewport={geom['vh']}")
    if s['left'] < 0 or s['right'] > geom['vw']:
        problems.append(f"clipped horizontally: left={s['left']:.0f} right={s['right']:.0f} viewport={geom['vw']}")
    if geom['hitId'] != 'approve-stop':
        problems.append(f"something else is on top at its centre: {geom['hitId']}")
    # It must not be adjacent to Deny - separation is the whole anti-mistap point.
    gap = s['top'] - geom['deny']['bottom']
    if gap < 8:
        problems.append(f"only {gap:.0f}px below the Deny button; too easy to mis-tap")
    if geom['stopBg'] == geom['denyBg']:
        problems.append('same background colour as Deny; not visually distinct')

    print(f"\n{label}  ({width}x{height})")
    print(f"  dialog  {geom['dialog']['w']:.0f}x{geom['dialog']['h']:.0f} at y={geom['dialog']['top']:.0f}")
    print(f"  Stop    {s['w']:.0f}x{s['h']:.0f} at y={s['top']:.0f}  gap below Deny: {gap:.0f}px")
    print(f"  colour  stop={geom['stopBg']}  deny={geom['denyBg']}")
    print(f"  hit test at its centre -> {geom['hitId']}")
    print(f"  screenshot: {shot}")
    if problems:
        for p in problems:
            print(f"  FAIL: {p}")
    else:
        print("  OK: visible, unclipped, not covered, big enough, separated, distinct")

    # Clear the dialog without stopping the agent, so the next viewport can run.
    page.evaluate("window.__panel.querySelector('#approve-deny').click()")
    page.wait_for_function("window.__panel.querySelector('.approval').hidden===true", timeout=5000)
    return problems


def main():
    failures = {}
    shots = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=shutil.which('chromium'), args=['--no-sandbox'])
        page = browser.new_page()
        page.on('dialog', lambda d: d.accept())
        page.set_content((ROOT / 'tests/fixtures/demo.html').read_text())
        page.add_script_tag(content=HARNESS)
        page.add_script_tag(content=core)
        page.add_script_tag(content=remote)
        page.wait_for_timeout(2500)
        # Find a real control to be asked about, so the dialog carries realistic text.
        # Refs live in the BRIDGE's own core instance, so they must come from a
        # real inspect through the bridge - a ref minted by a second instance is
        # not in its map and is refused.
        page.evaluate('''() => { window.__mockQueue.push({
          id:'00000000-0000-4000-8000-0000000000aa', action:'browser_inspect',
          args:{}, origin:window.location.origin, expiresAt:Date.now()+600000}); }''')
        page.wait_for_function(
            "window.__mockResults.some(r=>r.id==='00000000-0000-4000-8000-0000000000aa')", timeout=10000)
        page.evaluate('''() => {
          const r=window.__mockResults.find(x=>x.id==='00000000-0000-4000-8000-0000000000aa');
          const els=r.result.data.elements;
          const hit=els.find(e=>/show confirmation/i.test(e.label||''))||els[0];
          window.__ref=hit.ref; window.__label=hit.label;
        }''')
        print('asking about control:', page.evaluate('window.__label'), page.evaluate('window.__ref'))
        for label, w, h in VIEWPORTS:
            problems = probe(page, label, w, h, shots)
            if problems:
                failures[label] = problems
        browser.close()
    print('\n' + '=' * 60)
    if failures:
        print('VISUAL CHECK FAILED')
        for k, v in failures.items():
            print(f'  {k}: {"; ".join(v)}')
    else:
        print('VISUAL CHECK PASSED at every viewport, including Split View 1/3')
    print('screenshots:', ' '.join(shots))
    if failures:
        raise SystemExit(1)
    print('PASS: approval dialog is visible, unclipped, uncovered and tappable at every iPad viewport')


if __name__ == '__main__':
    main()
