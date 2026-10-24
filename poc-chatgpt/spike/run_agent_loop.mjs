/**
 * Autonomous Multi-Turn Agent Loop Coordinator
 *
 * Demonstrates a complete multi-step task execution against the OpenAI Responses API
 * using tool calls, state persistence, and simulated DOM feedback.
 *
 * Usage:
 *   node poc-chatgpt/spike/run_agent_loop.mjs "Search for wireless mouse and add the first result to cart"
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formatSystemPrompt, formatUserMessage } from '../engine/dom_bridge.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKEN_FILE = join(__dirname, '../../.env.chatgpt-token');

function getAccessToken() {
  if (process.env.CHATGPT_ACCESS_TOKEN) return process.env.CHATGPT_ACCESS_TOKEN;
  if (existsSync(TOKEN_FILE)) {
    const content = readFileSync(TOKEN_FILE, 'utf8');
    const match = content.match(/^CHATGPT_ACCESS_TOKEN=(.*)$/m);
    if (match && match[1]) return match[1].trim();
  }

  // Fallback: Check ~/.codex/auth.json
  const home = process.env.HOME || '/Users/liborballaty';
  const codexAuthPath = join(home, '.codex/auth.json');
  if (existsSync(codexAuthPath)) {
    try {
      const data = JSON.parse(readFileSync(codexAuthPath, 'utf8'));
      if (data.tokens && data.tokens.access_token) {
        console.log('Using active subscription token from ~/.codex/auth.json');
        return data.tokens.access_token;
      }
    } catch (e) {}
  }

  throw new Error(`Token file not found at ${TOKEN_FILE}. Run oauth_login.mjs first.`);
}

// Mock DOM State for simulation
class MockBrowserPage {
  constructor() {
    this.url = 'https://store.example.com/products';
    this.title = 'Demo Tech Store - Products';
    this.cartCount = 0;
    this.searchQuery = '';
  }

  getSnapshot() {
    if (!this.searchQuery) {
      return {
        url: this.url,
        title: this.title,
        snapshot: [
          '[e1] <input type="text" name="query" placeholder="Search store">',
          '[e2] <button text="Search">',
          '[e3] <a href="/cart" text="Cart (0 items)">',
          '[e4] <div text="Featured: Mechanical Keyboard - $99">'
        ].join('\n')
      };
    } else {
      return {
        url: `${this.url}?q=${encodeURIComponent(this.searchQuery)}`,
        title: `Search: ${this.searchQuery} - Demo Tech Store`,
        snapshot: [
          `[e1] <input type="text" name="query" value="${this.searchQuery}">`,
          '[e2] <button text="Search">',
          `[e3] <a href="/cart" text="Cart (${this.cartCount} items)">`,
          '[e4] <div text="Pro Wireless Mouse - $49.99">',
          '[e5] <button text="Add Pro Wireless Mouse to Cart">'
        ].join('\n')
      };
    }
  }

  execute(tool, args) {
    console.log(`\n  ⚡ [Simulated DOM] Executing ${tool}:`, JSON.stringify(args));
    if (tool === 'browser_inspect') {
      return this.getSnapshot();
    }
    if (tool === 'browser_fill') {
      if (args.ref === 'e1') {
        this.searchQuery = args.value;
        return { success: true, message: `Typed "${args.value}" into search input.` };
      }
      return { success: false, error: `Invalid input ref: ${args.ref}` };
    }
    if (tool === 'browser_click') {
      if (args.ref === 'e2') {
        return { success: true, message: 'Clicked Search. Page reloaded with search results.' };
      }
      if (args.ref === 'e5') {
        this.cartCount += 1;
        return { success: true, message: `Added item to cart! Total items in cart: ${this.cartCount}` };
      }
      return { success: false, error: `Unrecognized button click ref: ${args.ref}` };
    }
    return { success: false, error: `Unsupported tool: ${tool}` };
  }
}

async function callResponsesAPI(token, inputMessages) {
  const payload = {
    model: 'gpt-4o',
    stream: false, // Use standard JSON payload for loop coordinator simplicity
    input: inputMessages,
    tools: [
      {
        type: 'function',
        function: {
          name: 'browser_inspect',
          description: 'Inspect the current page elements',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser_click',
          description: 'Click an element identified by its ref ID',
          parameters: {
            type: 'object',
            properties: { ref: { type: 'string' } },
            required: ['ref']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'browser_fill',
          description: 'Type text into an input field',
          parameters: {
            type: 'object',
            properties: { ref: { type: 'string' }, value: { type: 'string' } },
            required: ['ref', 'value']
          }
        }
      }
    ]
  };

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API Error HTTP ${res.status}: ${err}`);
  }

  return await res.json();
}

async function runAutonomousLoop(userGoal) {
  const token = getAccessToken();
  const page = new MockBrowserPage();
  const maxTurns = 5;

  console.log('====================================================');
  console.log('  Autonomous ChatGPT Safari Agent Loop Runner');
  console.log('====================================================');
  console.log('User Goal:', userGoal);

  // Initial turn setup
  const messages = [
    { role: 'system', content: formatSystemPrompt() },
    { role: 'user', content: formatUserMessage(userGoal, page.getSnapshot()) }
  ];

  for (let turn = 1; turn <= maxTurns; turn++) {
    console.log(`\n--- [Turn ${turn}/${maxTurns}] Querying OpenAI Responses API ---`);
    const response = await callResponsesAPI(token, messages);

    // Extract output items
    const outputItems = response.output || [];
    let toolCallFound = false;

    for (const item of outputItems) {
      if (item.type === 'message' && item.content) {
        console.log(`\n🤖 [Agent Response]: ${item.content}`);
        messages.push({ role: 'assistant', content: item.content });
      }

      if (item.type === 'function_call') {
        toolCallFound = true;
        const toolName = item.name;
        const toolArgs = JSON.parse(item.arguments || '{}');

        console.log(`\n🛠️  [Model Tool Call]: ${toolName}(${JSON.stringify(toolArgs)})`);

        // Execute action on page
        const executionResult = page.execute(toolName, toolArgs);

        // Fetch fresh DOM if an action occurred
        const freshDOM = page.getSnapshot();

        // Feed tool result back to message history
        messages.push({
          role: 'tool',
          name: toolName,
          content: JSON.stringify({
            result: executionResult,
            updatedDOM: freshDOM
          })
        });
      }
    }

    if (!toolCallFound) {
      console.log('\n✅ Task completed autonomously by the agent!');
      return;
    }
  }

  console.log('\n⚠️ Reached maximum turn limit (5).');
}

const goal = process.argv[2] || 'Search for "wireless mouse" and add it to the shopping cart.';
runAutonomousLoop(goal).catch(err => {
  console.error('\nFatal error in loop execution:', err);
  process.exit(1);
});
