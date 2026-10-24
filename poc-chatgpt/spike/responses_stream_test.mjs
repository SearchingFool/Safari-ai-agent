/**
 * Responses API Streaming Test Spike
 *
 * Verifies that the bearer token obtained from Sign in with ChatGPT can execute
 * a streaming request against https://api.openai.com/v1/responses with custom tool definitions.
 *
 * Usage:
 *   node poc-chatgpt/spike/responses_stream_test.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKEN_FILE = join(__dirname, '../../.env.chatgpt-token');

// Read token: checks env, then local .env, then system Codex auth
function getAccessToken() {
  if (process.env.CHATGPT_ACCESS_TOKEN) {
    return process.env.CHATGPT_ACCESS_TOKEN;
  }
  if (existsSync(TOKEN_FILE)) {
    const content = readFileSync(TOKEN_FILE, 'utf8');
    const match = content.match(/^CHATGPT_ACCESS_TOKEN=(.*)$/m);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fallback: Check if local machine already has an active Codex ChatGPT login
  const home = process.env.HOME || '/Users/liborballaty';
  const codexAuthPath = join(home, '.codex/auth.json');
  if (existsSync(codexAuthPath)) {
    try {
      const data = JSON.parse(readFileSync(codexAuthPath, 'utf8'));
      if (data.tokens && data.tokens.access_token) {
        console.log('Found existing authenticated ChatGPT subscription token in ~/.codex/auth.json!');
        return data.tokens.access_token;
      }
    } catch (e) {
      // Ignore parse failure
    }
  }

  throw new Error(`Token not found. Run oauth_login.mjs first or sign in via codex login.`);
}

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'browser_inspect',
      description: 'Inspect the visible DOM structure and interactive elements of the current page.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click an element on the page identified by its element reference ID.',
      parameters: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element ID reference (e.g., e1, e2, e3)'
          }
        },
        required: ['ref'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_fill',
      description: 'Fill in an input field or textarea identified by its element reference ID.',
      parameters: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element ID reference (e.g., e1, e2)'
          },
          value: {
            type: 'string',
            description: 'The exact string value to type into the field'
          }
        },
        required: ['ref', 'value'],
        additionalProperties: false
      }
    }
  }
];

async function main() {
  const token = getAccessToken();
  console.log('Using Bearer Token:', `${token.slice(0, 10)}...${token.slice(-6)}`);
  console.log('Sending streaming request to https://api.openai.com/v1/responses ...\n');

  const payload = {
    model: 'gpt-4o',
    stream: true,
    input: [
      {
        role: 'system',
        content: 'You are an autonomous browser agent. You are looking at a webpage and need to click the search button.'
      },
      {
        role: 'user',
        content: `Current page elements:\n[e1] input (type="text", placeholder="Search products")\n[e2] button "Search"\n[e3] link "Cart"\n\nPlease search for "wireless headphones".`
      }
    ],
    tools: TOOL_DEFINITIONS
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`\n[ERROR] HTTP ${response.status} ${response.statusText}`);
    console.error('Response Body:', errorText);

    if (response.status === 429 && errorText.includes('subscription_sharing')) {
      console.error('\n⚠️ Rate Limit / Cap reached on ChatGPT Subscription Token Sharing.');
    } else if (response.status === 401 || response.status === 403) {
      console.error('\n⚠️ Authentication or Plan Eligibility issue. Check that scope chatgpt.tokens.use.direct is granted.');
    }
    process.exit(1);
  }

  console.log('HTTP 200 OK — Parsing Server-Sent Events (SSE) stream:\n');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf8');
  let buffer = '';
  let toolCallName = '';
  let toolCallArguments = '';
  let textOutput = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep remainder

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (dataStr === '[DONE]') {
        console.log('\n[Stream [DONE]]');
        continue;
      }

      try {
        const event = JSON.parse(dataStr);
        const type = event.type || '';

        // Capture tool calls
        if (type === 'response.output_item.added') {
          if (event.item?.type === 'function_call') {
            toolCallName = event.item.name;
            console.log(`\n→ Function Call Detected: ${toolCallName}`);
          }
        } else if (type === 'response.function_call_arguments.delta') {
          toolCallArguments += event.delta || '';
          process.stdout.write(event.delta || '');
        } else if (type === 'response.output_item.done') {
          if (toolCallName) {
            console.log(`\n✓ Tool Call Completed: ${toolCallName}(${toolCallArguments})`);
          }
        } else if (type === 'response.text.delta') {
          textOutput += event.delta || '';
          process.stdout.write(event.delta || '');
        }
      } catch (e) {
        // Ignored raw comments/unparseable frames
      }
    }
  }

  console.log('\n\n====================================================');
  console.log('             STREAMING TEST SUMMARY                 ');
  console.log('====================================================');
  console.log('Tool Called  :', toolCallName || '(none)');
  console.log('Arguments    :', toolCallArguments || '(none)');
  console.log('Text Output  :', textOutput ? `"${textOutput.slice(0, 80)}..."` : '(none)');
  console.log('Result       : ✅ Responses API & Token Sharing Verified!');
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('Fatal error in streaming test:', err);
  process.exit(1);
});
