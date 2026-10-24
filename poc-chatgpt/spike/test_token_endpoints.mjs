/**
 * Test Token Endpoints
 * Checks which OpenAI endpoints the active token has permission to access.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const codexAuthPath = join(process.env.HOME || '/Users/liborballaty', '.codex/auth.json');
const authData = JSON.parse(readFileSync(codexAuthPath, 'utf8'));
const token = authData.tokens.access_token;

console.log('Testing active token against OpenAI endpoints...\n');

async function testEndpoint(name, url, method, body) {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const status = res.status;
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = text.slice(0, 150); }

    console.log(`[${status}] ${name} (${url})`);
    if (!res.ok) {
      console.log('  Response:', typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : parsed);
    } else {
      console.log('  Success!');
    }
  } catch (err) {
    console.log(`[FAIL] ${name}:`, err.message);
  }
}

async function run() {
  // 1. Test Models endpoint
  await testEndpoint('GET /v1/models', 'https://api.openai.com/v1/models', 'GET');

  // 2. Test Chat Completions
  await testEndpoint(
    'POST /v1/chat/completions',
    'https://api.openai.com/v1/chat/completions',
    'POST',
    {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 10
    }
  );

  // 3. Test Responses API with required scope
  await testEndpoint(
    'POST /v1/responses',
    'https://api.openai.com/v1/responses',
    'POST',
    {
      model: 'gpt-4o',
      input: [{ role: 'user', content: 'Say hello' }]
    }
  );
}

run();
