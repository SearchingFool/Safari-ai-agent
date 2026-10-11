/**
 * File: gateway/diagnostics.mjs
 * Description: Comprehensive request diagnostics for the Safari AI Agent MCP gateway.
 *   Classifies every request into a named outcome with likely causes and concrete
 *   next actions, so a failing client (Claude connector, iPad Userscripts bridge)
 *   can be debugged from evidence instead of guesswork.
 * Author: Claude Code (Opus 5)
 * Created: 2026-10-11
 *
 * SECURITY: this module never records credential VALUES, webpage text, or tool
 * payloads. It records credential SHAPE only (scheme, length, whether the length
 * matches what the server expects), which is what actually distinguishes a
 * truncated paste from a wrong token from a missing header.
 *
 * Two surfaces, per the project observability contract (docs/DIAGNOSTICS.md):
 *   1. durable JSONL event log  -> machine-queryable history
 *   2. human console narrative  -> readable live during a device test
 * Both carry requestId and correlationId; the same requestId is returned to the
 * caller in the X-Request-Id header and in error response bodies.
 */

export const SEVERITY = {OK: 'ok', INFO: 'info', WARN: 'warn', ERROR: 'error'};

/**
 * Pure classifier. Takes an observation of a finished request and returns a
 * diagnosis. No I/O, no clock, no randomness -> fully unit-testable.
 *
 * @param {object} o
 * @param {string} o.method           HTTP method
 * @param {string} o.path             URL pathname
 * @param {number} o.status           response status code
 * @param {string|null} o.authScheme  e.g. 'Bearer', 'Basic', or null
 * @param {number} o.authLength       total length of the Authorization header
 * @param {number} o.expectedMcpAuthLength     'Bearer '.length + client token length
 * @param {number} o.expectedDeviceAuthLength  'Bearer '.length + device token length
 * @param {string|null} o.contentType
 * @param {string|null} o.protocolVersion
 * @param {string|null} o.origin
 * @param {string|null} o.rpcMethod   JSON-RPC method when known
 * @param {string|null} o.deviceOrigin   origin field in a /device/* body
 * @param {string[]} o.allowedOrigins
 */
export function classify(o) {
  const d = (code, severity, summary, likelyCauses = [], suggestedActions = []) =>
    ({code, severity, summary, likelyCauses, suggestedActions});

  const RECOPY = 'Re-copy the token on the Mac: awk -F= \'/^MCP_CLIENT_TOKEN=/{printf "%s",$2}\' .env.mac-tailscale | pbcopy';

  // ---- Discovery / probe paths -------------------------------------------
  // These are the highest-value signals when a connector "cannot reach" a server:
  // they reveal what transport or auth scheme the client actually expected.
  if (o.path.startsWith('/.well-known/')) {
    return d('PROBE_OAUTH_DISCOVERY', SEVERITY.WARN,
      `Client probed ${o.path} — it is attempting OAuth/metadata discovery, not static bearer auth.`,
      ['The client expects an OAuth-protected MCP server and is looking for authorization-server metadata.',
       'This gateway uses a single static bearer token and publishes no OAuth metadata, so the probe 404s.',
       'Some clients treat a failed discovery probe as "server unreachable" rather than "auth not supported".'],
      ['If an authenticated POST /mcp follows shortly after, this probe is harmless — ignore it.',
       'If NO authenticated request follows, the client requires OAuth and static-header auth will not work. Record this as the B1 capability answer and choose an alternative rather than disabling auth.']);
  }
  if (o.path === '/sse' || o.path === '/message' || o.path === '/messages') {
    return d('PROBE_LEGACY_SSE_TRANSPORT', SEVERITY.WARN,
      `Client probed ${o.path} — it expects the deprecated HTTP+SSE MCP transport.`,
      ['The client is trying the older two-endpoint SSE transport instead of Streamable HTTP.',
       'This gateway implements Streamable HTTP only, on a single /mcp endpoint.'],
      ['Confirm the connector URL ends in /mcp.',
       'If the client only speaks HTTP+SSE, that is a transport incompatibility, not a misconfiguration.']);
  }

  // ---- MCP endpoint -------------------------------------------------------
  if (o.path === '/mcp') {
    if (o.status === 403 && o.origin) {
      return d('MCP_BROWSER_ORIGIN_REJECTED', SEVERITY.WARN,
        `Rejected an MCP request carrying a browser Origin header (${o.origin}).`,
        ['A web page or browser extension tried to call /mcp directly.',
         'MCP callers are server-side and must not send Origin.'],
        ['Only Claude\'s connector should call /mcp. The iPad bridge must use /device/* with DEVICE_TOKEN, not the MCP endpoint.']);
    }
    if (o.status === 401) {
      if (o.authLength === 0) {
        return d('MCP_NO_CREDENTIAL', SEVERITY.ERROR,
          'MCP caller sent NO Authorization header.',
          ['The connector was saved without the custom header, or the header is not being applied to outbound calls.',
           'Or this is an unauthenticated pre-flight probe and an authenticated request will follow within a second.'],
          ['In the Claude connector settings confirm a custom header: Authorization = Bearer <MCP_CLIENT_TOKEN>.',
           'Watch for a second log line: if one arrives with a Bearer credential, this probe was benign.',
           'If every request looks like this, the client is not sending your configured header at all.']);
      }
      if (o.authScheme && o.authScheme !== 'Bearer') {
        return d('MCP_WRONG_AUTH_SCHEME', SEVERITY.ERROR,
          `MCP caller used "${o.authScheme}" authentication; this endpoint requires "Bearer".`,
          ['The header value was entered without the "Bearer " prefix, or a username/password form was used.'],
          ['Set the header value to exactly: Bearer <token> (one space, capital B).']);
      }
      if (o.expectedMcpAuthLength && o.authLength !== o.expectedMcpAuthLength) {
        const delta = o.authLength - o.expectedMcpAuthLength;
        return d('MCP_TOKEN_LENGTH_MISMATCH', SEVERITY.ERROR,
          `Bearer credential is the wrong length (got ${o.authLength}, expected ${o.expectedMcpAuthLength}; ${delta > 0 ? delta + ' too long' : Math.abs(delta) + ' too short'}).`,
          delta > 0
            ? ['The word "Bearer" may have been pasted twice, or trailing whitespace/newline was included.',
               'The field may contain the whole "Authorization: Bearer x" line rather than just the value.']
            : ['The token was truncated during copy/paste.',
               'The DEVICE_TOKEN or DEMO_PASSWORD may have been pasted instead of MCP_CLIENT_TOKEN.'],
          [RECOPY,
           'Paste the value as exactly "Bearer " + 64 hex characters, with no quotes and no trailing newline.']);
      }
      return d('MCP_TOKEN_MISMATCH', SEVERITY.ERROR,
        'Bearer credential has the correct shape but does not match this gateway\'s MCP_CLIENT_TOKEN.',
        ['The wrong one of the three secrets was used (DEVICE_TOKEN or DEMO_PASSWORD instead of MCP_CLIENT_TOKEN).',
         'The credentials file was regenerated after the connector was configured, rotating the token.'],
        [RECOPY,
         'Update the connector header with the freshly copied value, then retry.']);
    }
    if (o.status === 405) {
      return d('MCP_NON_POST_METHOD', SEVERITY.WARN,
        `Client used ${o.method} on /mcp; this gateway accepts POST only.`,
        ['Streamable HTTP clients may open GET /mcp to listen for a server-initiated SSE stream.',
         'This gateway does not implement the optional server->client stream; tool calls still work over POST.'],
        ['Harmless if POST requests are also arriving and succeeding.',
         'If the client REQUIRES the GET stream before it will call tools, that is a transport gap to record, not a credential problem.']);
    }
    if (o.status === 400 && o.protocolVersion) {
      return d('MCP_PROTOCOL_VERSION_MISMATCH', SEVERITY.ERROR,
        `Client requested MCP protocol "${o.protocolVersion}", which this gateway does not implement.`,
        ['The client negotiated a newer or older Streamable HTTP revision than the gateway\'s compatibility target.'],
        ['Check the PROTOCOL constant in gateway/server.mjs against the version the client advertises.',
         'This is a real interoperability finding — record it rather than loosening validation blindly.']);
    }
    if (o.status === 415) {
      return d('MCP_WRONG_CONTENT_TYPE', SEVERITY.ERROR,
        `Client sent Content-Type "${o.contentType || '(none)'}"; application/json is required.`,
        ['A proxy rewrote the content type, or the client posted form/text data.'],
        ['Confirm no intermediary is transforming the request body.']);
    }
    if (o.status === 400) {
      return d('MCP_MALFORMED_JSONRPC', SEVERITY.ERROR,
        'Request body was not a valid JSON-RPC 2.0 message.',
        ['Body was truncated, empty, or not JSON.'],
        ['Check for a proxy or size limit between the client and this gateway.']);
    }
    if (o.status === 200 || o.status === 202) {
      return d('MCP_OK', SEVERITY.OK,
        `MCP ${o.rpcMethod || 'request'} succeeded.`, [], []);
    }
  }

  // ---- Device bridge (iPad Userscripts) -----------------------------------
  if (o.path.startsWith('/device/')) {
    if (o.status === 401) {
      if (o.authLength === 0) {
        return d('DEVICE_NO_CREDENTIAL', SEVERITY.ERROR,
          'iPad bridge sent no Authorization header.',
          ['The Remote AI panel was connected before the device token was saved.'],
          ['On the iPad, re-enter the DEVICE_TOKEN in the Remote AI panel, press Save, then Connect.']);
      }
      if (o.expectedDeviceAuthLength && o.authLength !== o.expectedDeviceAuthLength) {
        return d('DEVICE_TOKEN_LENGTH_MISMATCH', SEVERITY.ERROR,
          `Device credential is the wrong length (got ${o.authLength}, expected ${o.expectedDeviceAuthLength}).`,
          ['The token was truncated on paste, or MCP_CLIENT_TOKEN was entered instead of DEVICE_TOKEN.'],
          ['Copy DEVICE_TOKEN specifically — it is a different secret from the Claude connector token.']);
      }
      return d('DEVICE_TOKEN_MISMATCH', SEVERITY.ERROR,
        'Device credential does not match DEVICE_TOKEN.',
        ['MCP_CLIENT_TOKEN was pasted into the iPad panel.',
         'Credentials were regenerated after the iPad was configured.'],
        ['Re-copy DEVICE_TOKEN from .env.mac-tailscale and re-save it on the iPad.']);
    }
    if (o.status === 403) {
      return d('DEVICE_ORIGIN_NOT_ALLOWED', SEVERITY.ERROR,
        `iPad reported origin "${o.deviceOrigin || '(unknown)'}", which is not in the allowlist.`,
        [`The gateway allows only: ${(o.allowedOrigins || []).join(', ') || '(none configured)'}`,
         'The iPad is on a different page than the demo served by this gateway (http instead of https, or a different host).',
         'SAFARI_ALLOWED_ORIGINS was set from a different hostname than the one the iPad actually loaded.'],
        ['On the iPad, confirm the address bar shows exactly the allowlisted https origin.',
         'Open the demo via the printed iPad test page URL rather than a bookmark or a shortened link.']);
    }
    if (o.status === 409) {
      return d('DEVICE_SESSION_CONFLICT', SEVERITY.WARN,
        'Device request conflicted with current session state (duplicate result, expired command, or another origin owns the session).',
        ['A result arrived for a command that already completed, timed out, or was revoked by Stop.',
         'Two tabs are running the bridge against the same gateway.'],
        ['Ensure only one Safari tab has Remote AI connected.',
         'This is fail-closed behaviour: the action was NOT applied twice.']);
    }
    if (o.status === 200) {
      return d('DEVICE_OK', SEVERITY.OK, `Device ${o.path.replace('/device/', '')} accepted.`, [], []);
    }
  }

  // ---- Everything else ----------------------------------------------------
  if (o.path === '/health') return d('HEALTH_OK', SEVERITY.OK, 'Health check.', [], []);
  if (o.path.startsWith('/demo')) {
    if (o.status === 401) {
      return d('DEMO_AUTH_REQUIRED', SEVERITY.INFO,
        'Demo page challenged for browser login (expected on first visit).',
        ['The public demo is protected by HTTP Basic auth so the Funnel URL is not anonymously browsable.'],
        ['Sign in as user "safari-demo" with DEMO_PASSWORD from .env.mac-tailscale.']);
    }
    return d('DEMO_OK', SEVERITY.OK, 'Demo page served.', [], []);
  }
  if (o.status === 404) {
    return d('UNKNOWN_PATH', SEVERITY.WARN,
      `Client requested unknown path ${o.path}.`,
      ['The client expects an endpoint this gateway does not implement.',
       'This often reveals an unsupported transport or discovery convention.'],
      ['If this repeats during a connector setup attempt, note the exact path — it identifies what the client wanted.']);
  }
  return d('UNCLASSIFIED', SEVERITY.INFO, `${o.method} ${o.path} -> ${o.status}`, [], []);
}

const ICON = {ok: '✓', info: '•', warn: '⚠', error: '⛔'};

/** Render one diagnosis as a human-readable console block. */
export function renderHuman(event) {
  const {diagnosis: g} = event;
  const time = event.ts.slice(11, 19);
  const head = `${ICON[g.severity] || '?'} ${time}  ${event.method} ${event.path} -> ${event.status}  req=${event.requestId}`;
  if (g.severity === SEVERITY.OK) return head;
  const lines = ['', '-'.repeat(74), head, `   ${g.summary}`];
  if (g.likelyCauses.length) {
    lines.push('   Likely causes:');
    for (const c of g.likelyCauses) lines.push(`     - ${c}`);
  }
  if (g.suggestedActions.length) {
    lines.push('   Try:');
    for (const a of g.suggestedActions) lines.push(`     > ${a}`);
  }
  lines.push('-'.repeat(74));
  return lines.join('\n');
}

/**
 * Wire diagnostics into an http server.
 * @param {object} cfg
 * @param {boolean} cfg.enabled
 * @param {string|null} cfg.logFile       append-only JSONL path, or null for console only
 * @param {number} cfg.clientTokenLength
 * @param {number} cfg.deviceTokenLength
 * @param {string[]} cfg.allowedOrigins
 * @param {(line:string)=>void} cfg.write console sink
 * @param {(line:string)=>void} cfg.append file sink
 */
export function createDiagnostics(cfg) {
  const enabled = !!cfg.enabled;
  const BEARER = 'Bearer '.length;
  return {
    enabled,
    /** Attach to a request; returns a setter for details only known mid-handling. */
    attach(req, res, requestId, correlationId) {
      const extra = {rpcMethod: null, toolName: null, deviceOrigin: null};
      if (!enabled) return extra;
      const started = Date.now();
      const auth = req.headers.authorization;
      res.on('finish', () => {
        let path = '<unparseable>';
        try { path = new URL(req.url, 'http://localhost').pathname; } catch { /* keep placeholder */ }
        const observation = {
          method: req.method,
          path,
          status: res.statusCode,
          authScheme: typeof auth === 'string' ? auth.split(' ')[0] : null,
          authLength: typeof auth === 'string' ? auth.length : 0,
          expectedMcpAuthLength: cfg.clientTokenLength ? BEARER + cfg.clientTokenLength : 0,
          expectedDeviceAuthLength: cfg.deviceTokenLength ? BEARER + cfg.deviceTokenLength : 0,
          contentType: req.headers['content-type'] || null,
          protocolVersion: req.headers['mcp-protocol-version'] || null,
          origin: req.headers.origin || null,
          rpcMethod: extra.rpcMethod,
          deviceOrigin: extra.deviceOrigin,
          allowedOrigins: cfg.allowedOrigins || []
        };
        const event = {
          ts: new Date().toISOString(),
          requestId,
          correlationId,
          durationMs: Date.now() - started,
          ...observation,
          accept: req.headers.accept || null,
          userAgent: (req.headers['user-agent'] || '').slice(0, 160),
          remote: req.socket?.remoteAddress || null,
          forwardedFor: req.headers['x-forwarded-for'] || null,
          toolName: extra.toolName,
          diagnosis: classify(observation)
        };
        try { cfg.write?.(renderHuman(event)); } catch { /* logging must never break a request */ }
        try { cfg.append?.(JSON.stringify(event) + '\n'); } catch { /* ditto */ }
      });
      return extra;
    }
  };
}
