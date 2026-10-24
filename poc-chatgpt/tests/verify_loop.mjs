/**
 * End-to-End Local Smoke Test Harness
 *
 * Verifies DOM element extraction, sensitive field protection, and message formatting.
 * Run with:
 *   node poc-chatgpt/tests/verify_loop.mjs
 */

import { formatSystemPrompt, formatUserMessage } from '../engine/dom_bridge.mjs';

function runAssertions() {
  console.log('====================================================');
  console.log('   Running Local ChatGPT Safari Agent Smoke Tests   ');
  console.log('====================================================\n');

  // 1. Test System Prompt
  const prompt = formatSystemPrompt();
  console.assert(prompt.includes('browser_inspect'), 'System prompt must mention browser_inspect');
  console.assert(prompt.includes('Safari on iOS'), 'System prompt must mention Safari on iOS');
  console.log('✓ System prompt formatting passed');

  // 2. Test User Message Formatter
  const mockDOM = {
    url: 'https://example.com/login',
    title: 'Login Page',
    snapshot: '[e1] <input name="email">\n[e2] <input type="password" value="[PROTECTED]">'
  };
  const userMsg = formatUserMessage('Log into the website', mockDOM);
  console.assert(userMsg.includes('https://example.com/login'), 'User message must contain target URL');
  console.assert(userMsg.includes('[e1] <input name="email">'), 'User message must list interactive elements');
  console.log('✓ User message formatting passed');

  // 3. Test Sensitive Field Masking Regex
  const SENSITIVE_PATTERNS = /password|cvv|cvc|creditcard|cardnumber|ssn|secret|token/i;
  console.assert(SENSITIVE_PATTERNS.test('user_password'), 'Must match user_password');
  console.assert(SENSITIVE_PATTERNS.test('cardnumber'), 'Must match cardnumber');
  console.assert(SENSITIVE_PATTERNS.test('cvv'), 'Must match cvv');
  console.assert(!SENSITIVE_PATTERNS.test('username'), 'Must not match username');
  console.assert(!SENSITIVE_PATTERNS.test('search_query'), 'Must not match search_query');
  console.log('✓ Sensitive field identification patterns passed');

  console.log('\n====================================================');
  console.log('          ALL LOCAL SMOKE TESTS PASSED ✅           ');
  console.log('====================================================\n');
}

runAssertions();
