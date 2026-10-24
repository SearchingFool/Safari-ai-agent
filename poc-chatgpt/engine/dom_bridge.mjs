/**
 * DOM Bridge and Formatter for ChatGPT Agent Loop
 */

export function formatSystemPrompt() {
  return [
    'You are an autonomous browser automation agent operating inside Apple Safari on iOS.',
    'You have direct tool access to inspect, click, and fill interactive elements on the page.',
    '',
    'Operational Rules:',
    '1. Always call `browser_inspect` first if you do not know the current state of the page.',
    '2. When clicking or filling, refer to elements ONLY by their bracketed ID (e.g., "e1", "e2").',
    '3. Do not attempt to guess or hallucinate element IDs.',
    '4. After filling required form inputs, inspect or click the corresponding submission/continue button.',
    '5. When the user goal is complete, reply with a concise final summary explaining what was accomplished.'
  ].join('\n');
}

export function formatUserMessage(goal, domSnapshot) {
  let content = `Goal: ${goal}\n\n`;
  if (domSnapshot) {
    content += `Current URL: ${domSnapshot.url}\n`;
    content += `Page Title: ${domSnapshot.title}\n`;
    content += `Interactive Elements:\n${domSnapshot.snapshot}\n`;
  } else {
    content += `Please inspect the current page to begin.`;
  }
  return content;
}
