"""Run with: python tests/browser_e2e.py
Integration smoke tests using Chromium. These do NOT replace real Safari/iPad tests.
Uses Playwright, in-memory HTML, and the actual bundled userscript.
"""
import json
import pathlib
import shutil

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / 'scripts/safari-ai-agent.user.js').read_text()

def run():
    with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, executable_path=shutil.which('chromium'), args=['--no-sandbox'])
            context = browser.new_context()
            page = context.new_page()
            page.set_content((ROOT / 'tests/fixtures/demo.html').read_text(), wait_until='load')
            page.add_script_tag(content=SCRIPT)
            host = page.locator('[data-safari-ai-agent-host]')
            assert host.count() == 1, 'Userscript did not mount'
            shadow = host.locator('section.panel')
            assert shadow.is_hidden(), 'Panel should start closed'
            host.locator('button.toggle').click()
            assert shadow.is_visible(), 'Panel should open'
            host.locator('[data-do="inspect"]').click()
            snapshot = json.loads(host.locator('pre').inner_text())
            assert snapshot['schema'] == 'safari-ai-agent.snapshot.v1'
            assert not any('never-share-me' in str(x) for x in snapshot['elements'])
            assert 'never-share-me' not in snapshot['textExcerpt']
            assert snapshot['url'] == 'about:blank'
            by_label = {el['label']: el['ref'] for el in snapshot['elements']}
            assert {'Name', 'Email', 'Password (should not be readable or fillable)', 'Category', 'Show confirmation'}.issubset(by_label)
            def select_ref(ref):
                host.locator('#ref').fill(ref)
            select_ref(by_label['Name'])
            host.locator('#value').fill('Example User')
            host.locator('[data-do="fill"]').click()
            assert page.locator('#person').input_value() == 'Example User'
            select_ref(by_label['Category'])
            host.locator('#value').fill('research')
            host.locator('[data-do="fill"]').click()
            assert page.locator('#kind').input_value() == 'research'
            select_ref(by_label['Password (should not be readable or fillable)'])
            host.locator('#value').fill('replaced-password')
            host.locator('[data-do="fill"]').click()
            assert 'Unsupported field' in host.locator('.status').inner_text()
            assert page.locator('#secret').input_value() == 'never-share-me'
            select_ref(by_label['Show confirmation'])
            host.locator('[data-do="click"]').click()
            assert page.locator('#feedback').inner_text() == 'Button clicked'
            select_ref(by_label['Submit test form'])
            page.once('dialog', lambda dialog: dialog.dismiss())
            host.locator('[data-do="click"]').click()
            assert page.locator('#feedback').inner_text() == 'Button clicked', 'Rejected submission still triggered!'
            page.once('dialog', lambda dialog: dialog.accept())
            host.locator('[data-do="click"]').click()
            assert page.locator('#feedback').inner_text() == 'Test form submitted locally'
            # Cross-origin navigation must receive approval; cancel keeps the page intact.
            host.locator('#url').fill('https://example.com/next')
            page.once('dialog', lambda dialog: dialog.dismiss())
            host.locator('[data-do="navigate"]').click()
            assert page.locator('#feedback').inner_text() == 'Test form submitted locally'
            # Exercise the navigation engine using a fake location so no external network is needed.
            assigned = page.evaluate("""() => {
              let captured = null;
              const mock = { location: {href: 'https://example.com/form', origin: 'https://example.com', assign: (target) => captured = target}, getComputedStyle: window.getComputedStyle.bind(window) };
              const core = SafariAIAgentCore.createAgentCore(document, mock);
              const approval = core.navigate('https://other.example/next');
              if (!approval.requiresApproval) throw Error('Cross-origin approval missing');
              const result = core.navigate('https://other.example/next', true);
              if (!result.success) throw Error('Approved navigation failed');
              return captured;
            }""")
            assert assigned == 'https://other.example/next'
            # Simulate a new document; automatic reinjection is Safari/Userscripts acceptance work.
            page.set_content((ROOT / 'tests/fixtures/second.html').read_text(), wait_until='load')
            page.add_script_tag(content=SCRIPT)
            assert page.get_by_text('Navigation succeeded').count() == 1
            assert page.locator('[data-safari-ai-agent-host]').count() == 1
            page.locator('[data-safari-ai-agent-host] button.toggle').click()
            page.locator('[data-safari-ai-agent-host] [data-do="inspect"]').click()
            next_snapshot = json.loads(page.locator('[data-safari-ai-agent-host] pre').inner_text())
            assert next_snapshot['title'] == 'Second test page'
            print('PASS: injection, page inspection, private fields, text/select fill, click, submission approval, navigation validation, simulated remount')
            browser.close()

if __name__ == '__main__':
    run()
