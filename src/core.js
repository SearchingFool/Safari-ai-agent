/*
 * Safari AI Agent: webpage action engine.
 * This file intentionally depends only on the browser DOM and standard JavaScript.
 * It must never contact a server, execute strings as code, or read password values.
 * The same engine can later be imported by a full Safari WebExtension.
 */
(function (global) {
  'use strict';

  const MAX_ELEMENTS = 100;
  const MAX_TEXT = 2000;
  const ACTIONABLE = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"]';
  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'time']);
  const TIME_FORMAT = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const HIGH_IMPACT = /\b(delete|remove|erase|pay|purchase|buy|checkout|transfer|send|publish|confirm|submit|post|order)\b/i;
  const trim = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

  function createAgentCore(doc, win) {
    if (!doc || !win) throw new TypeError('Document and window are required');
    const references = new Map();
    let sequence = 0;

    function isVisible(el) {
      if (!el || !el.isConnected || el.closest('[data-safari-ai-agent-host]')) return false;
      if (el.hidden || el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const style = win.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function getLabel(el) {
      const fromAria = el.getAttribute('aria-label');
      if (fromAria) return trim(fromAria);
      if (el.labels && el.labels.length) return trim([...el.labels].map(label => label.textContent).join(' '));
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const label = labelledBy.split(/\s+/).map(id => doc.getElementById(id)?.textContent || '').join(' ');
        if (label.trim()) return trim(label);
      }
      return trim(el.getAttribute('placeholder') || el.innerText || el.textContent || el.getAttribute('title') || '');
    }

    function describe(el, ref) {
      const tag = el.tagName.toLowerCase();
      const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag;
      const details = {ref, tag, type, label: getLabel(el), disabled: Boolean(el.disabled)};
      if (tag === 'a') {
        const raw = el.getAttribute('href') || '';
        try { const href = new URL(raw, doc.baseURI); if (['https:', 'http:'].includes(href.protocol)) details.href = href.href; }
        catch (_) { /* An invalid URL is deliberately omitted. */ }
      }
      if (tag === 'select') details.options = [...el.options].slice(0, 30).map(option => ({value: option.value, label: trim(option.textContent, 80)}));
      // Never expose input values. This covers passwords as well as personal form data.
      return details;
    }

    function inspect() {
      references.clear();
      sequence = 0;
      const elements = [];
      for (const el of doc.querySelectorAll(ACTIONABLE)) {
        if (elements.length >= MAX_ELEMENTS) break;
        if (!isVisible(el)) continue;
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (['hidden', 'file'].includes(type)) continue;
        const ref = `e${++sequence}`;
        references.set(ref, el);
        elements.push(describe(el, ref));
      }
      // body.innerText only reflects rendered text. This is intentionally local-only.
      // Never copy a snapshot to an AI provider without separate explicit consent.
      const pageText = trim(doc.body?.innerText || '', MAX_TEXT);
      return {
        schema: 'safari-ai-agent.snapshot.v1',
        url: win.location.href,
        title: trim(doc.title, 240),
        textExcerpt: pageText,
        elements,
        truncated: elements.length >= MAX_ELEMENTS
      };
    }

    function resolve(ref) {
      if (typeof ref !== 'string' || !/^e\d{1,3}$/.test(ref)) throw new Error('Invalid element reference; inspect the page first.');
      const el = references.get(ref);
      if (!el || !isVisible(el)) throw new Error('Element missing or no longer visible; inspect again.');
      return el;
    }

    function fill(ref, value) {
      const el = resolve(ref);
      if (el.disabled || el.readOnly) throw new Error('Field is disabled or read-only.');
      if (typeof value !== 'string' || value.length > 10000) throw new Error('Value must be text of at most 10,000 characters.');
      const tag = el.tagName.toLowerCase();
      if (tag === 'select') {
        const option = [...el.options].find(item => item.value === value || trim(item.textContent) === value);
        if (!option || option.disabled) throw new Error('No enabled option matches that text or value.');
        el.value = option.value;
      } else if (tag === 'textarea' || (tag === 'input' && TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase()))) {
        const proto = tag === 'textarea' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (!setter) throw new Error('Native value setter unavailable.');
        const isTime = tag === 'input' && el.type === 'time';
        if (isTime && value !== '' && !TIME_FORMAT.test(value)) throw new Error('Time format must be HH:mm, e.g. 14:30.');
        const previous = el.value;
        setter.call(el, value);
        if (isTime && (el.value !== value || !el.validity.valid)) {
          const reason = el.validationMessage || 'Time violates min/max/step constraint.';
          setter.call(el, previous);
          throw new Error(`Invalid time: ${reason}`);
        }
      } else if (el.isContentEditable && el.getAttribute('contenteditable') === 'true') {
        el.textContent = value;
      } else {
        throw new Error('Unsupported field. Passwords, files, and sensitive controls cannot be filled.');
      }
      el.dispatchEvent(new win.Event('input', {bubbles: true}));
      el.dispatchEvent(new win.Event('change', {bubbles: true}));
      return {action: 'fill', ref, success: true, type: tag};
    }

    function riskOfClick(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'button' && el.closest('form') && (el.getAttribute('type') || 'submit').toLowerCase() === 'submit') return 'form submission';
      if (tag === 'input' && ['submit', 'image'].includes((el.type || '').toLowerCase())) return 'form submission';
      if (HIGH_IMPACT.test(getLabel(el))) return 'potentially consequential action';
      return null;
    }

    function previewClick(ref) {
      const el = resolve(ref);
      const href = el.tagName.toLowerCase() === 'a' ? new URL(el.getAttribute('href') || '', doc.baseURI).href : null;
      return {ref, risk: riskOfClick(el), href, tag: el.tagName.toLowerCase()};
    }

    function click(ref, approved = false) {
      const el = resolve(ref);
      if (el.disabled) throw new Error('Control is disabled.');
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      if (!['button', 'a', 'input'].includes(tag) && !['button', 'link'].includes(role)) throw new Error('Only buttons, links and click controls are supported.');
      if (tag === 'input' && !['button','submit','checkbox','radio','reset','image'].includes((el.type || '').toLowerCase())) throw new Error('This is not a click control.');
      if (tag === 'a') {
        const href = new URL(el.getAttribute('href') || '', doc.baseURI);
        if (!['https:', 'http:'].includes(href.protocol)) throw new Error('Unsupported link protocol.');
      }
      const risk = riskOfClick(el);
      if (risk && approved !== true) return {action: 'click', ref, requiresApproval: true, reason: risk};
      el.click();
      return {action: 'click', ref, success: true, approvalUsed: Boolean(risk)};
    }

    function highlight(ref) {
      const el = resolve(ref);
      const old = el.style.outline;
      el.style.outline = '3px solid #e38a1b';
      el.scrollIntoView({behavior: 'smooth', block: 'center'});
      win.setTimeout(() => { if (el.isConnected) el.style.outline = old; }, 2000);
      return {action: 'highlight', ref, success: true};
    }

    function navigate(rawUrl, approvedCrossOrigin = false) {
      if (typeof rawUrl !== 'string' || rawUrl.length > 2048) throw new Error('Invalid destination.');
      const url = new URL(rawUrl, win.location.href);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Only normal HTTP(S) destinations are allowed.');
      if (url.origin !== win.location.origin && !approvedCrossOrigin) return {action: 'navigate', requiresApproval: true, reason: 'cross-site navigation', url: url.href};
      win.location.assign(url.href);
      return {action: 'navigate', success: true, url: url.href};
    }

    return Object.freeze({inspect, fill, click, previewClick, highlight, navigate});
  }

  global.SafariAIAgentCore = {createAgentCore};
  if (typeof module !== 'undefined' && module.exports) module.exports = {createAgentCore};
})(typeof globalThis !== 'undefined' ? globalThis : this);
