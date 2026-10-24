document.addEventListener('DOMContentLoaded', async () => {
  const authStatus = document.getElementById('authStatus');
  const authPrompt = document.getElementById('authPrompt');
  const agentInterface = document.getElementById('agentInterface');
  const loginBtn = document.getElementById('loginBtn');
  const runBtn = document.getElementById('runBtn');
  const taskInput = document.getElementById('taskInput');
  const logEl = document.getElementById('log');

  function log(msg) {
    logEl.textContent += `\n${msg}`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Check storage for token
  const { chatgpt_token } = await chrome.storage.local.get(['chatgpt_token']);
  if (chatgpt_token) {
    authStatus.textContent = 'ChatGPT Connected';
    authStatus.classList.add('connected');
    authPrompt.style.display = 'none';
    agentInterface.style.display = 'block';
  }

  loginBtn.addEventListener('click', () => {
    log('Opening Sign in with ChatGPT...');
    chrome.runtime.sendMessage({ action: 'START_AUTH' }, response => {
      if (response && response.success) {
        authStatus.textContent = 'ChatGPT Connected';
        authStatus.classList.add('connected');
        authPrompt.style.display = 'none';
        agentInterface.style.display = 'block';
        log('Signed in successfully!');
      } else {
        log(`Auth failed: ${response?.error || 'Unknown error'}`);
      }
    });
  });

  runBtn.addEventListener('click', () => {
    const task = taskInput.value.trim();
    if (!task) return;

    log(`Starting task: "${task}"`);
    runBtn.disabled = true;

    chrome.runtime.sendMessage({ action: 'RUN_TASK', task }, response => {
      runBtn.disabled = false;
      if (response && response.success) {
        log(`\n✅ Task completed: ${response.message || 'Done'}`);
      } else {
        log(`\n❌ Task failed: ${response?.error || 'Execution error'}`);
      }
    });
  });
});
