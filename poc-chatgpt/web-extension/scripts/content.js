/**
 * Safari Web Extension Content Script
 * Bridges background agent loop commands to the active web page DOM.
 */

// Embed the core DOM engine
(function () {
  const AGENT_ATTR = 'data-agent-id';
  let registry = new Map();
  let counter = 1;

  function inspect() {
    registry.clear();
    counter = 1;

    const selectors = 'a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    const items = document.querySelectorAll(selectors);
    const serialized = [];

    items.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const ref = `e${counter++}`;
      el.setAttribute(AGENT_ATTR, ref);
      registry.set(ref, el);

      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      const name = el.getAttribute('name') || '';
      const placeholder = el.getAttribute('placeholder') || '';

      let desc = `[${ref}] <${tag}`;
      if (type) desc += ` type="${type}"`;
      if (name) desc += ` name="${name}"`;
      if (placeholder) desc += ` placeholder="${placeholder}"`;
      if (text && text.length < 60) desc += ` text="${text}"`;
      desc += '>';
      serialized.push(desc);
    });

    return {
      url: window.location.href,
      title: document.title,
      snapshot: serialized.join('\n')
    };
  }

  function click(ref) {
    const el = registry.get(ref) || document.querySelector(`[${AGENT_ATTR}="${ref}"]`);
    if (!el) return { success: false, error: `Element ${ref} not found` };
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    ['mousedown', 'mouseup', 'click'].forEach(evt => {
      el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
    });
    return { success: true };
  }

  function fill(ref, value) {
    const el = registry.get(ref) || document.querySelector(`[${AGENT_ATTR}="${ref}"]`);
    if (!el) return { success: false, error: `Element ${ref} not found` };
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    el.focus();
    el.value = value;
    ['input', 'change'].forEach(evt => el.dispatchEvent(new Event(evt, { bubbles: true })));
    return { success: true };
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'DOM_INSPECT') {
      sendResponse(inspect());
    } else if (msg.action === 'DOM_CLICK') {
      sendResponse(click(msg.ref));
    } else if (msg.action === 'DOM_FILL') {
      sendResponse(fill(msg.ref, msg.value));
    }
    return true;
  });
})();
