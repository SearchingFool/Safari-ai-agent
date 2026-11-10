// File: app/browser-host/Tests/GatewayHTTPSFixture.mjs
// Description: Loopback HTTPS gateway and MCP-call driver for Swift host integration tests.
// Author: Libor Ballaty, with Codex (swift-alternate seat, 2026-11-10)
// Created: 2026-11-10

import {createReadStream, readFileSync} from 'node:fs';
import {createServer as createHTTPServer, request as httpRequest} from 'node:http';
import {createServer as createHTTPSServer} from 'node:https';
import {createGateway} from '../../../gateway/server.mjs';

const tlsPort = Number(process.env.SWIFT_TEST_TLS_PORT || 4049);
const gatewayPort = Number(process.env.SWIFT_TEST_GATEWAY_PORT || 4048);
const origin = process.env.SWIFT_TEST_GATEWAY_ORIGIN || `https://127.0.0.1:${tlsPort}`;
const {hostname, port} = new URL(origin);
if (hostname !== '127.0.0.1' || Number(port) !== tlsPort) throw new Error('Fixture must bind its declared IPv4 loopback origin.');
if (!process.env.SWIFT_TEST_CERT || !process.env.SWIFT_TEST_KEY || !process.env.SWIFT_TEST_PAGE) {
  throw new Error('SWIFT_TEST_CERT, SWIFT_TEST_KEY and SWIFT_TEST_PAGE must point to temporary fixture files.');
}

const clientToken = 'f'.repeat(48);
const deviceToken = 'a'.repeat(48);
const gateway = createGateway({
  clientToken,
  deviceToken,
  allowedOrigins: [origin],
  defaultSiteMode: 'ask',
  commandTimeoutMs: 25_000,
  auditLog: false
});

function sendJSON(response, status, value) {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  response.end(JSON.stringify(value));
}

async function readJSON(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new Error('Fixture request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const controlServer = createHTTPServer(async (request, response) => {
  const url = new URL(request.url || '/', origin);
  if (url.pathname === '/health') return sendJSON(response, 200, {ok: true, suite: 'safari-ai-agent-swift-bridge-test', version: 1});
  if (url.pathname === '/page' && request.method === 'GET') {
    response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    return createReadStream(process.env.SWIFT_TEST_PAGE).pipe(response);
  }
  if (url.pathname === '/__fixture/call' && request.method === 'POST') {
    try {
      const body = await readJSON(request);
      const permitted = new Set(['browser_inspect', 'browser_verify', 'browser_fill', 'browser_click']);
      if (!permitted.has(body.name) || !body.arguments || typeof body.arguments !== 'object' || Array.isArray(body.arguments)) {
        return sendJSON(response, 400, {error: 'Unsupported fixture call.'});
      }
      const result = await gateway.call(body.name, body.arguments);
      return sendJSON(response, 200, result);
    } catch (error) {
      return sendJSON(response, 500, {error: error instanceof Error ? error.message : 'Fixture call failed.'});
    }
  }

  const upstream = httpRequest({
    hostname: '127.0.0.1',
    port: gatewayPort,
    path: url.pathname + url.search,
    method: request.method,
    headers: {...request.headers, host: `127.0.0.1:${gatewayPort}`}
  }, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', error => sendJSON(response, 502, {error: error.message}));
  request.pipe(upstream);
});

const gatewayServer = gateway.server;
const httpsServer = createHTTPSServer({
  key: readFileSync(process.env.SWIFT_TEST_KEY),
  cert: readFileSync(process.env.SWIFT_TEST_CERT)
}, (request, response) => {
  const proxyRequest = httpRequest({
    hostname: '127.0.0.1',
    port: 4047,
    path: request.url,
    method: request.method,
    headers: request.headers
  }, proxyResponse => {
    response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
    proxyResponse.pipe(response);
  });
  proxyRequest.on('error', error => sendJSON(response, 502, {error: error.message}));
  request.pipe(proxyRequest);
});

// The loopback HTTP gateway is deliberately isolated from the public app and
// reachable only through the temporary TLS listener used by this test.
gatewayServer.listen(gatewayPort, '127.0.0.1', () => {
  controlServer.listen(4047, '127.0.0.1', () => {
    httpsServer.listen(tlsPort, '127.0.0.1', () => {
      console.log(`Swift HTTPS fixture ready at ${origin}`);
    });
  });
});

async function stop() {
  await Promise.all([
    new Promise(resolve => httpsServer.close(resolve)),
    new Promise(resolve => controlServer.close(resolve)),
    gateway.close()
  ]);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void stop().finally(() => process.exit(0)));
