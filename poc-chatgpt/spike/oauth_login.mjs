/**
 * Sign in with ChatGPT - PKCE OAuth Flow Spike
 *
 * Implements standard OpenID Connect with PKCE (Proof Key for Code Exchange)
 * to obtain an access token with scope: chatgpt.tokens.use.direct
 *
 * Usage:
 *   node poc-chatgpt/spike/oauth_login.mjs
 */

import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { exec } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKEN_FILE = join(__dirname, '../../.env.chatgpt-token');

// OpenAI registered client ID (defaults to OpenAI's official client ID for CLI/desktop agents)
const OPENAI_AUTH_HOST = process.env.OPENAI_AUTH_HOST || 'https://auth.openai.com';
const CLIENT_ID = process.env.OPENAI_CLIENT_ID || 'app_EMoamEEZ73f0CkXaXp7hrann';
const REDIRECT_PORT = 8787;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const REQUIRED_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'model.request',
  'api.responses.write',
  'chatgpt.tokens.use.direct'
].join(' ');
const AUDIENCE_RESOURCE = 'https://api.openai.com/v1';

// 1. Generate PKCE Verifier and Challenge
function generatePKCE() {
  const verifier = randomBytes(32)
    .toString('base64url')
    .replace(/[^A-Za-z0-9_-]/g, '');
  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url');
  const state = randomBytes(16).toString('hex');
  return { verifier, challenge, state };
}

// 2. Main flow
async function main() {
  const { verifier, challenge, state } = generatePKCE();

  const authUrl = new URL(`${OPENAI_AUTH_HOST}/oauth/authorize`);
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', REQUIRED_SCOPES);
  authUrl.searchParams.set('resource', AUDIENCE_RESOURCE);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  console.log('====================================================');
  console.log('   Sign in with ChatGPT — OAuth PKCE Authentication  ');
  console.log('====================================================\n');
  console.log('Listening on:', REDIRECT_URI);
  console.log('\nOpening your browser to authenticate with ChatGPT...\n');
  console.log('Authorization URL:\n', authUrl.toString(), '\n');

  // Start temporary callback listener
  const server = createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`);
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const returnedState = reqUrl.searchParams.get('state');
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');
      const errorDescription = reqUrl.searchParams.get('error_description');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>Authentication Failed</h2><p>${error}: ${errorDescription || 'No details'}</p>`);
        console.error(`\n[FATAL] OAuth error returned: ${error} - ${errorDescription}`);
        server.close();
        process.exit(1);
      }

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('State mismatch - CSRF protection triggered.');
        console.error('\n[FATAL] CSRF State mismatch.');
        server.close();
        process.exit(1);
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing authorization code.');
        server.close();
        process.exit(1);
      }

      console.log('Authorization code received! Exchanging for token...');

      // 3. Exchange authorization code for token
      const tokenResponse = await fetch(`${OPENAI_AUTH_HOST}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier
        })
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>Token Exchange Failed</h2><pre>${JSON.stringify(tokenData, null, 2)}</pre>`);
        console.error('\n[FATAL] Token exchange failed:', tokenData);
        server.close();
        process.exit(1);
      }

      // Check for scope
      const grantedScope = tokenData.scope || '';
      const hasPlanUsageScope = grantedScope.includes('chatgpt.tokens.use.direct');

      console.log('\n✅ Token exchange succeeded!');
      console.log('Granted Scopes:', grantedScope);
      console.log('Token Sharing Scope Present?:', hasPlanUsageScope ? 'YES ✅' : 'NO ❌');

      // Persist to .env.chatgpt-token
      const envContent = [
        `# Generated by oauth_login.mjs on ${new Date().toISOString()}`,
        `CHATGPT_ACCESS_TOKEN=${tokenData.access_token}`,
        `CHATGPT_REFRESH_TOKEN=${tokenData.refresh_token || ''}`,
        `CHATGPT_TOKEN_EXPIRES_IN=${tokenData.expires_in || 3600}`,
        `CHATGPT_TOKEN_SCOPES=${grantedScope}`,
        `CHATGPT_HAS_PLAN_SCOPE=${hasPlanUsageScope}`,
        ''
      ].join('\n');

      writeFileSync(TOKEN_FILE, envContent, { mode: 0o600 });
      console.log(`Saved credentials to ${TOKEN_FILE} (permissions 0600)`);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: system-ui; text-align: center; padding: 50px;">
            <h2 style="color: #2e7d32;">Authentication Successful!</h2>
            <p>Your ChatGPT plan has been linked for the Safari Agent PoC.</p>
            <p>You can close this tab and return to the terminal.</p>
          </body>
        </html>
      `);

      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 1000);

    } catch (err) {
      console.error('Callback handler error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
      server.close();
      process.exit(1);
    }
  });

  server.listen(REDIRECT_PORT, () => {
    // Open in browser
    const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${startCmd} "${authUrl.toString()}"`);
  });
}

main().catch(err => {
  console.error('Error in OAuth runner:', err);
  process.exit(1);
});
