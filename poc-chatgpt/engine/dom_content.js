/**
 * DOM Extraction and Action Engine for ChatGPT Safari Agent
 *
 * Runs inside the browser context (content script or injected module).
 * Maps interactive elements to monotonic IDs ('e1', 'e2', ...), sanitizes sensitive
 * inputs, and performs simulated user events (clicks, text input).
 */

(function (global) {
  'use strict';

  const AGENT_ATTR = 'data-agent-id';
  let elementRegistry = new Map();
  let idCounter = 1;

  // Selectors for interactive and meaningful elements
  const INTERACTIVE_SELECTORS = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="combobox"]',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(',');

  // Sensitive field identifiers to mask
  const SENSITIVE_PATTERNS = /password|cvv|cvc|creditcard|cardnumber|ssn|secret|token/i;

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const style = global.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isSensitive(el) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.getAttribute('id') || '').toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    const label = (el.getAttribute('aria-label') || '').toLowerCase();

    if (type === 'password') return true;
    return SENSITIVE_PATTERNS.test(name) ||
           SENSITIVE_PATTERNS.test(id) ||
           SENSITIVE_PATTERNS.test(placeholder) ||
           SENSITIVE_PATTERNS.test(label);
  }

  function cleanText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Inspects the current page DOM, marks interactive nodes, and serializes a clean summary.
   */
  function inspectDOM() {
    elementRegistry.clear();
    idCounter = 1;

    const allElements = document.querySelectorAll(INTERACTIVE_SELECTORS);
    const serializedElements = [];

    allElements.forEach(el => {
      if (!isVisible(el)) return;

      const ref = `e${idCounter++}`;
      el.setAttribute(AGENT_ATTR, ref);
      elementRegistry.set(ref, el);

      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const role = el.getAttribute('role') || '';
      const text = cleanText(el.innerText || el.textContent || '');
      const ariaLabel = cleanText(el.getAttribute('aria-label') || '');
      const name = el.getAttribute('name') || '';
      const placeholder = cleanText(el.getAttribute('placeholder') || '');
      const disabled = el.hasAttribute('disabled');

      let descriptor = `[${ref}] <${tag}`;
      if (type) descriptor += ` type="${type}"`;
      if (role) descriptor += ` role="${role}"`;
      if (name) descriptor += ` name="${name}"`;
      if (placeholder) descriptor += ` placeholder="${placeholder}"`;
      if (disabled) descriptor += ` disabled`;

      if (tag === 'input' || tag === 'textarea') {
        if (isSensitive(el)) {
          descriptor += ` value="[PROTECTED_SENSITIVE_FIELD]"`;
        } else if (el.value) {
          descriptor += ` value="${cleanText(el.value)}"`;
        }
      }

      if (tag === 'select') {
        const options = Array.from(el.options || []).map(o => cleanText(o.text)).slice(0, 5);
        descriptor += ` options=[${options.join(', ')}]`;
      }

      const labelText = ariaLabel || text;
      if (labelText && labelText.length < 80) {
        descriptor += ` text="${labelText}"`;
      }
      descriptor += '>';

      serializedElements.push(descriptor);
    });

    return {
      url: window.location.href,
      title: document.title,
      elementCount: serializedElements.length,
      snapshot: serializedElements.join('\n')
    };
  }

  /**
   * Executes a click on an element by its reference ID.
   */
  function executeClick(ref) {
    const el = elementRegistry.get(ref) || document.querySelector(`[${AGENT_ATTR}="${ref}"]`);
    if (!el) {
      return { success: false, error: `Element with ref '${ref}' not found in live DOM.` };
    }

    if (isSensitive(el) && el.tagName.toLowerCase() === 'input') {
      return { success: false, error: `Clicking protected sensitive element '${ref}' is forbidden.` };
    }

    el.scrollIntoView({ behavior: 'instant', block: 'center' });

    // Synthetic mouse events
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
      const evt = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window
      });
      el.dispatchEvent(evt);
    });

    return { success: true, message: `Clicked element [${ref}]` };
  }

  /**
   * Fills an input or textarea element by its reference ID.
   */
  function executeFill(ref, value) {
    const el = elementRegistry.get(ref) || document.querySelector(`[${AGENT_ATTR}="${ref}"]`);
    if (!el) {
      return { success: false, error: `Element with ref '${ref}' not found in live DOM.` };
    }

    if (isSensitive(el)) {
      return { success: false, error: `Direct filling of protected sensitive input '${ref}' is forbidden.` };
    }

    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    el.focus();

    // Set value and trigger reactive events
    el.value = value;
    ['input', 'change'].forEach(eventType => {
      const evt = new Event(eventType, { bubbles: true, cancelable: true });
      el.dispatchEvent(evt);
    });

    return { success: true, message: `Filled element [${ref}] with "${value}"` };
  }

  // Export to global scope
  global.SafariAgentDOM = {
    inspect: inspectDOM,
    click: executeClick,
    fill: executeFill
  };

})(typeof window !== 'undefined' ? window : globalThis);
