"""Real Chromium DOM + mocked Userscripts GM extension + real HTTP MCP gateway.

This validates our browser bridge and its server, but not Apple's Userscripts
content-script isolation, Safari lifecycle or a real Claude account.
Run: python tests/remote_browser_e2e.py
"""
from __future__ import annotations
import contextlib
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import threading
import time
from urllib import request, error
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MCP_TOKEN = 'M' * 48
DEVICE_TOKEN = 'D' * 48


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def post(url, payload, token):
    data = json.dumps(payload).encode()
    req = request.Request(url, data, headers={
        'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}, method='POST')
    with request.urlopen(req, timeout=35) as response:
        return json.load(response)


def call(gateway, name, args=None, request_id=1):
    return post(gateway + '/mcp', {
        'jsonrpc': '2.0', 'method': 'tools/call', 'id': request_id,
        'params': {'name': name, 'arguments': args or {}}}, MCP_TOKEN)['result']


def parse(result):
    return json.loads(result['content'][0]['text'])


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *unused):
        pass


def run():
    gateway_port = free_port()
    origin = 'https://safari-test.example'
    gateway = f'http://127.0.0.1:{gateway_port}'
    env = dict(os.environ, MCP_CLIENT_TOKEN=MCP_TOKEN, DEVICE_TOKEN=DEVICE_TOKEN,
               SAFARI_ALLOWED_ORIGINS=origin, PORT=str(gateway_port), BIND_ADDRESS='127.0.0.1')
    proc = subprocess.Popen(['node', 'gateway/server.mjs'], cwd=ROOT, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for _ in range(50):
            try:
                request.urlopen(gateway + '/health', timeout=0.5).close()
                break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError('MCP gateway did not start')

        core = (ROOT / 'src/core.js').read_text()
        remote = (ROOT / 'src/remote.js').read_text()
        gm_storage = {
            'safari-agent:gateway-url': 'https://test.gateway.example',
            'safari-agent:device-token': DEVICE_TOKEN,
            f'safari-agent:enabled:{origin}': True,
        }

        def gm_bridge(source, details):
            assert details['url'].startswith('https://test.gateway.example/device/')
            assert details['headers']['Authorization'] == 'Bearer ' + DEVICE_TOKEN
            response = post(gateway + details['url'].split('example', 1)[1],
                            json.loads(details['data']), DEVICE_TOKEN)
            return {'status': 200, 'responseText': json.dumps(response)}

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True,
                        executable_path=shutil.which('chromium'), args=['--no-sandbox'])
            context = browser.new_context()
            # Intercept the simulated public HTTPS website entirely within Chromium.
            # This avoids environments that prohibit loopback browser navigation.
            def fixture_route(route):
                name = route.request.url.rsplit('/', 1)[-1]
                if name not in ('demo.html', 'second.html'):
                    return route.fulfill(status=404, body='Not Found')
                return route.fulfill(status=200, content_type='text/html',
                  body=(ROOT / 'tests' / 'fixtures' / name).read_text())
            context.route(origin + '/**', fixture_route)
            context.expose_binding('__gmBridge', gm_bridge)
            preamble = '''window.GM={
               getValue:(key,def)=>Promise.resolve(window.__settings[key]??def),
               setValue:(key,v)=>{window.__settings[key]=v;return Promise.resolve();},
               xmlHttpRequest:details=>window.__gmBridge(details)
            };
            window.__settings=__TEST_GM_SETTINGS__;
            '''.replace('__TEST_GM_SETTINGS__', json.dumps(gm_storage))
            context.add_init_script(script=preamble + '\n' + core + '\n' + remote)
            page = context.new_page()
            page.on('dialog', lambda dialog: dialog.accept())
            page.goto(origin + '/demo.html')
            # Agent's MCP calls are synchronous; the background browser pump runs independently.
            ready = False
            for _ in range(45):
                if parse(call(gateway, 'browser_status'))['connected']:
                    ready = True
                    break
                time.sleep(0.2)
            assert ready, 'Userscript failed to connect to gateway'

            # Observe current webpage from a remote MCP tool call.
            observed = parse(call(gateway, 'browser_inspect', request_id=10))
            assert observed['success']
            snapshot = observed['data']
            assert snapshot['title'] == 'Safari AI Agent Test Page'
            assert 'never-share-me' not in json.dumps(snapshot)
            refs = {element['label']: element['ref'] for element in snapshot['elements']}
            assert 'Name' in refs and 'Submit test form' in refs

            # Real browser DOM mutations performed via remotely issued MCP tool calls.
            fill = parse(call(gateway, 'browser_fill', {'ref': refs['Name'], 'value': 'Browser Agent'}, request_id=11))
            assert fill['success']
            assert page.locator('#person').input_value() == 'Browser Agent'
            assert parse(call(gateway, 'browser_verify', {'textIncludes': 'Safari AI Agent Test Page'}, request_id=12))['success']
            # After verify re-inspection, old refs can be reused only if stable.
            # A consequential submit button must be blocked even if a local confirmation would accept.
            blocked = call(gateway, 'browser_click', {'ref': refs['Submit test form']}, request_id=13)
            assert blocked['isError']
            assert 'High-impact' in parse(blocked)['error']
            assert page.locator('#feedback').inner_text() == 'No actions yet.'

            # Explicitly navigate to next page. Response is only dispatch acknowledgement.
            ack = parse(call(gateway, 'browser_navigate', {'url': origin + '/second.html'}, request_id=14))
            assert ack['dispatched'] and not ack['verified']
            page.wait_for_url('**/second.html', timeout=10000)
            assert page.locator('body').inner_text().find('Navigation succeeded') >= 0
            # Auto-resume across navigation: re-injected Userscripts reads GM storage.
            next_page = parse(call(gateway, 'browser_inspect', request_id=15))
            assert next_page['data']['title'] == 'Second test page'
            verified = parse(call(gateway, 'browser_verify', {'textIncludes': 'Navigation succeeded'}, request_id=16))
            assert verified['success']
            print('PASS: MCP -> authenticated gateway -> mocked GM isolated bridge -> Chromium DOM -> navigation -> auto-resume -> verify')
            browser.close()
    finally:
        proc.terminate()
        with contextlib.suppress(Exception):
            proc.wait(timeout=3)


if __name__ == '__main__':
    run()
