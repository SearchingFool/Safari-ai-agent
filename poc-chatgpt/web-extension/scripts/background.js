/**
 * Safari Web Extension Background Service Worker
 * Coordinates agent execution, token storage, and OpenAI Responses API requests.
 */

const RESPONSES_API_URL = 'https://api.openai.com/v1/responses';

const TOOLS = [
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
];

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function sendToContent(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      resolve(response);
    });
  });
}

async function executeAgentTask(task) {
  const { chatgpt_token } = await chrome.storage.local.get(['chatgpt_token']);
  if (!chatgpt_token) {
    throw new Error('Please sign in with ChatGPT first.');
  }

  const tabId = await getActiveTabId();
  if (!tabId) {
    throw new Error('No active browser tab found.');
  }

  // 1. Initial DOM inspection
  const domState = await sendToContent(tabId, { action: 'DOM_INSPECT' });

  const messages = [
    {
      role: 'system',
      content: 'You are an autonomous browser agent on iOS Safari. Use your tools to click and fill elements.'
    },
    {
      role: 'user',
      content: `Goal: ${task}\nURL: ${domState.url}\nTitle: ${domState.title}\nElements:\n${domState.snapshot}`
    }
  ];

  // Run up to 4 autonomous turns
  for (let turn = 1; turn <= 4; turn++) {
    const payload = {
      model: 'gpt-4o',
      stream: false,
      input: messages,
      tools: TOOLS
    };

    const response = await fetch(RESPONSES_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${chatgpt_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API Error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const items = data.output || [];
    let toolExecuted = false;

    for (const item of items) {
      if (item.type === 'message' && item.content) {
        messages.push({ role: 'assistant', content: item.content });
      }

      if (item.type === 'function_call') {
        toolExecuted = true;
        const name = item.name;
        const args = JSON.parse(item.arguments || '{}');

        let toolResult;
        if (name === 'browser_click') {
          toolResult = await sendToContent(tabId, { action: 'DOM_CLICK', ref: args.ref });
        } else if (name === 'browser_fill') {
          toolResult = await sendToContent(tabId, { action: 'DOM_FILL', ref: args.ref, value: args.value });
        } else if (name === 'browser_inspect') {
          toolResult = await sendToContent(tabId, { action: 'DOM_INSPECT' });
        }

        const freshDOM = await sendToContent(tabId, { action: 'DOM_INSPECT' });
        messages.push({
          role: 'tool',
          name,
          content: JSON.stringify({ result: toolResult, liveDOM: freshDOM?.snapshot })
        });
      }
    }

    if (!toolExecuted) {
      return { success: true, message: 'Goal accomplished.' };
    }
  }

  return { success: true, message: 'Completed multi-turn sequence.' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'RUN_TASK') {
    executeAgentTask(msg.task)
      .then(res => sendResponse({ success: true, message: res.message }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
});
