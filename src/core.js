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
  const trim = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

  // ---------------------------------------------------------------------------
  // PERMISSION MODEL (D-019 tiers, D-020 site modes, D-021 grants, D-025 split)
  //
  // Three tiers, evaluated fail-CLOSED. The previous `riskOfClick()` returned
  // null for anything it did not recognise, so every control nobody had
  // enumerated read as an ordinary click. The default is now ELEVATED and only
  // a short, explicitly enumerated set of *provably inert* structures can earn
  // ROUTINE.
  //
  // The split that matters (D-025): BLOCKED is computed HERE, in code that
  // ships with the bridge, from the live DOM. The gateway is reachable over the
  // network, so it is allowed to supply only the *tunable* part of policy (the
  // per-origin mode). There is deliberately no code path by which anything the
  // gateway sends can turn a BLOCKED classification into an allowed action.
  // ---------------------------------------------------------------------------
  const TIERS = Object.freeze({BLOCKED: 'blocked', ELEVATED: 'elevated', ROUTINE: 'routine'});
  const MODES = Object.freeze({READ_ONLY: 'read-only', FILL_ONLY: 'fill-only', TRUSTED: 'trusted'});
  const MODE_VALUES = new Set([MODES.READ_ONLY, MODES.FILL_ONLY, MODES.TRUSTED]);

  // HARD CEILINGS. Genuinely irreversible categories. Never grantable, not even
  // on a site the operator has nominated as trusted, and not overridable by any
  // gateway-supplied policy. Adding to this list is a code change that ships
  // with the bridge; that is the point.
  //
  // Each category has a STRUCTURAL test (language-independent, works on
  // icon-only controls) and a keyword test. The keyword test can only ever
  // RAISE a control to BLOCKED. It is never consulted to clear a control, so a
  // word nobody thought of cannot cause a fail-open - it only means the control
  // falls through to ELEVATED, which still requires explicit human approval.
  const CEILING_WORDS = Object.freeze({
    // Money leaving the operator's control.
    payment: /\b(pay|paying|payment|purchase|buy|checkout|check\s?out|place\s+(the\s+)?order|order\s+now|donate|donation|subscribe|subscription|billing|invoice|wire|remit|transfer\s+(funds|money)|withdraw|top\s?up)\b|(bezahlen|kaufen|kasse|acheter|payer|commander|comprar|pagar|pagamento|acquista|betalen|köp|購入|支払|決済|結帳|结账|购买|支付|결제|구매|оплат|купить)/i,
    // Destroying the account itself, not just a row of data.
    'account-deletion': /\b(delete|delet(e|ing)|deactivate|disable|close|terminate|remove|wipe|purge)\s+(my\s+|the\s+|your\s+)?(account|profile|workspace|organi[sz]ation|tenant|everything|all\s+data)\b|\bdelete\s+my\s+data\b|\baccount\s+(deletion|removal|closure)\b|(konto\s+löschen|compte.*supprim|supprimer.*compte|eliminar.*cuenta|excluir.*conta|删除(账户|帐号)|注销(账户|帐号)|アカウント.*削除|계정.*삭제|удалить.*аккаунт)/i,
    // Credentials, second factors, API keys, recovery paths, session trust.
    'credentials-security': /\b(change|update|reset|rotate|revoke|regenerate|remove|disable|set)\s+(the\s+|my\s+|your\s+)?(password|passphrase|pin|api[\s-]?key|access[\s-]?token|secret|credential|recovery\s+code|backup\s+code|security\s+question)s?\b|\b(two[\s-]?factor|2fa|mfa|passkey|security\s+key|authenticator)\b|\b(revoke|remove)\s+(access|session|device|app)\b|(passwort\s+ändern|changer.*mot\s+de\s+passe|cambiar.*contraseña|修改密码|重置密码|パスワード.*変更|비밀번호.*변경|сменить.*пароль)/i
  });
  // Structural ceiling signals read off the element's FORM OWNER. These need no
  // text at all, so they survive translation, icon-only buttons and an empty
  // accessible name.
  //   - a form carrying a password field is a credential submission or change;
  //   - a form carrying autocomplete="cc-*" (WHATWG autofill tokens) is a
  //     payment instrument form.
  const CC_AUTOFILL = 'input[autocomplete^="cc-" i], select[autocomplete^="cc-" i], [autocomplete="transaction-amount" i], [autocomplete="transaction-currency" i]';

  function normalizeMode(value) { return MODE_VALUES.has(value) ? value : MODES.READ_ONLY; }

  /**
   * Coerce whatever the gateway sent into a policy object this bridge will act
   * on. Anything unrecognised, absent or malformed collapses to the most
   * restrictive mode. A gateway that is compromised, confused or simply older
   * than this bridge therefore cannot widen permissions by accident or design;
   * the worst it can do is fail to grant any.
   */
  function normalizePolicy(raw) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    return Object.freeze({
      mode: normalizeMode(source.mode),
      // Standing grants are OPERATOR-set only (D-021). The gateway may switch
      // them off entirely but can never switch them on by itself, and it can
      // never create one: this flag only decides whether the local panel is
      // allowed to OFFER "Always allow" to a human.
      grantsOffered: source.grants !== false,
      version: typeof source.version === 'string' || typeof source.version === 'number' ? String(source.version) : '0'
    });
  }

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

    /** The form this control actually submits, honouring the `form` attribute. */
    function formOwner(el) {
      const named = el.getAttribute && el.getAttribute('form');
      if (named) return doc.getElementById(named) || null;
      return el.closest ? el.closest('form') : null;
    }

    // Every scrap of text that could name the action, not just the accessible
    // name. id/name are included because an icon-only control frequently
    // carries `id="delete-account"` and nothing else a human could read.
    function ceilingText(el) {
      const parts = [getLabel(el), el.getAttribute('title'), el.getAttribute('value'),
                     el.getAttribute('name'), el.id, el.getAttribute('data-testid')];
      return parts.filter(Boolean).join(' ').slice(0, 400);
    }

    /**
     * HARD CEILING test. Returns {category, reasons} or null.
     * Structural first, keywords second, and keywords may only add.
     */
    function hardCeiling(el) {
      const reasons = [];
      let category = null;
      const form = formOwner(el);
      if (form) {
        if (form.querySelector('input[type="password" i]')) {
          category = 'credentials-security';
          reasons.push('its form contains a password field');
        } else if (form.querySelector(CC_AUTOFILL)) {
          category = 'payment';
          reasons.push('its form contains payment-card fields');
        }
      }
      const text = ceilingText(el);
      if (text) {
        for (const [name, pattern] of Object.entries(CEILING_WORDS)) {
          if (pattern.test(text)) {
            // A structural hit already fixed the category; a keyword hit on a
            // different category is still recorded, because the operator should
            // see every reason the control was refused.
            if (!category) category = name;
            reasons.push(`its text matches the ${name} category`);
            break;
          }
        }
      }
      return category ? {category, reasons} : null;
    }

    /**
     * The ONLY structures allowed to be ROUTINE. Everything here must be
     * reversible by the operator with a single ordinary browser action (back
     * button, click it again). Anything that merely *looks* safe is not here.
     * Returns a category string or null.
     */
    function inertCategory(el, d) {
      if (d.disabled) return null;
      // An empty accessible name means we are acting blind. It ELEVATES; it
      // must never exempt. This is the inversion of the old behaviour, where an
      // unlabelled control produced an empty string that matched no keyword and
      // was therefore waved through.
      if (d.unnamed) return null;
      // Anything inside a form may participate in submission, implicitly or via
      // a script, so no control with a form owner is ever inert.
      if (formOwner(el)) return null;
      if (d.isSubmit) return null;
      // aria-pressed / aria-checked is a persisted state change - Like, Follow,
      // Subscribe, Mute. Structurally detectable in any language with no text.
      if (d.isToggle) return null;
      const role = trim(el.getAttribute('role') || '', 32).toLowerCase();
      // 1. Ordinary same-origin navigation by a real href. Reversible with Back.
      if (d.tag === 'a' && d.href && !d.isPseudoLink && !d.external) return 'same-origin-link';
      // 2. Disclosure. aria-expanded is only meaningful on a control that
      //    expands something, and collapsing it again is the inverse.
      if (el.hasAttribute('aria-expanded') && !d.isPseudoLink) return 'disclosure';
      // 3. Tab selection within a tablist, and pagination expressed as tabs.
      if (role === 'tab' || (el.hasAttribute('aria-selected') && role !== 'option')) return 'tab-select';
      return null;
    }

    function elevatedCategory(el, d) {
      if (d.isSubmit || formOwner(el)) return 'form-submit';
      if (d.isToggle) return 'state-toggle';
      if (d.external) return 'cross-origin-link';
      if (d.isPseudoLink) return 'scripted-action';
      if (d.unnamed) return 'unnamed-control';
      return 'unclassified-action';
    }

    /**
     * Fail-closed classification of a click. Policy-free on purpose: this says
     * what the control IS, never what the operator has permitted. Keeping the
     * two apart is what lets `decideClick` be given untrusted policy safely.
     */
    function classifyClick(el) {
      const control = describeControl(el);
      const summary = describeForPrompt(control);
      const ceiling = hardCeiling(el);
      if (ceiling) {
        return Object.freeze({
          tier: TIERS.BLOCKED, category: ceiling.category, reasons: Object.freeze(ceiling.reasons),
          grantable: false, control, summary
        });
      }
      const inert = inertCategory(el, control);
      if (inert) {
        return Object.freeze({
          tier: TIERS.ROUTINE, category: inert, reasons: Object.freeze([`recognised as a ${inert} control`]),
          grantable: true, control, summary
        });
      }
      const category = elevatedCategory(el, control);
      const reasons = [category === 'unclassified-action'
        ? 'not provably inert, so it is treated as consequential'
        : `recognised as a ${category}`];
      if (control.unnamed) reasons.push('it has no accessible name, so the agent is acting blind');
      return Object.freeze({
        tier: TIERS.ELEVATED, category, reasons: Object.freeze(reasons), grantable: false, control, summary
      });
    }

    /**
     * Apply operator policy to a classification. `policy` may have come over
     * the network, so every branch below is written so that a hostile value can
     * only ever produce a MORE restrictive answer:
     *   - BLOCKED is handled before policy is consulted at all;
     *   - mode is normalised against a closed enum, unknown -> read-only;
     *   - the most permissive mode still yields 'prompt', never 'allow', so a
     *     human is in the loop for every click no matter what arrives.
     */
    function decideClick(classification, policy) {
      const p = normalizePolicy(policy);
      if (classification.tier === TIERS.BLOCKED) {
        return {decision: 'refuse', grantable: false, mode: p.mode,
                reason: `${classification.category} actions are never permitted on any site, including trusted ones`};
      }
      if (p.mode !== MODES.TRUSTED) {
        return {decision: 'refuse', grantable: false, mode: p.mode,
                reason: `clicking is not permitted on this site (site mode: ${p.mode}). Nominate it as trusted to allow completion.`};
      }
      return {decision: 'prompt', mode: p.mode,
              // Only ROUTINE may ever be covered by a standing grant (D-021).
              grantable: classification.tier === TIERS.ROUTINE && p.grantsOffered};
    }

    function decideFill(policy) {
      const p = normalizePolicy(policy);
      if (p.mode === MODES.READ_ONLY) {
        return {decision: 'refuse', mode: p.mode, reason: 'this site is read-only; fields cannot be filled'};
      }
      return {decision: 'allow', mode: p.mode};
    }

    function decideNavigate(policy) {
      const p = normalizePolicy(policy);
      if (p.mode === MODES.READ_ONLY) {
        return {decision: 'refuse', grantable: false, mode: p.mode, reason: 'this site is read-only; navigation is not permitted'};
      }
      return {decision: 'prompt', mode: p.mode, grantable: p.grantsOffered};
    }

    // Describe a control in terms a HUMAN can consent to. The approval prompt
    // previously said only "click e37", which asks the operator to authorise an
    // opaque reference: they could not tell "Next page" from "Delete account".
    // Enforcement decides; description is what makes the decision informed.
    // Signals here are structural, so they survive translation and icon-only
    // buttons where a label-only check sees nothing.
    function describeControl(el) {
      const tag = el.tagName.toLowerCase();
      const name = getLabel(el);
      const inForm = Boolean(el.closest('form'));
      const type = (el.getAttribute('type') || (tag === 'button' ? 'submit' : '') || '').toLowerCase();
      const isSubmit = (tag === 'button' && inForm && type === 'submit') ||
                       (tag === 'input' && ['submit', 'image'].includes(type));
      // aria-pressed/aria-checked identify state toggles (like, follow, bookmark,
      // mute) in any language, even with no visible text at all.
      const toggle = el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked');
      const rawHref = tag === 'a' ? el.getAttribute('href') : null;
      let href = null, external = false;
      if (rawHref) {
        try {
          const u = new URL(rawHref, doc.baseURI);
          href = u.href;
          external = u.origin !== win.location.origin;
        } catch { href = rawHref; }
      }
      return {
        name: name || null,
        // An empty accessible name means we are acting blind. Report it rather
        // than letting it silently read as "nothing risky here".
        unnamed: !name,
        tag, type: type || null, inForm, isSubmit,
        isToggle: toggle !== null && toggle !== undefined,
        togglePressed: toggle === 'true' ? true : toggle === 'false' ? false : null,
        // An <a> with no usable href is a scripted action, not navigation.
        isPseudoLink: tag === 'a' && (!rawHref || rawHref === '#' || /^javascript:/i.test(rawHref)),
        href, external,
        disabled: Boolean(el.disabled)
      };
    }

    /** One-line human sentence for an approval prompt. Never includes page body text. */
    function describeForPrompt(d) {
      const what = d.name ? `"${d.name}"` : `an UNLABELLED ${d.tag}`;
      const bits = [];
      if (d.isSubmit) bits.push('submits a form');
      if (d.isToggle) bits.push(`toggle, currently ${d.togglePressed ? 'on' : 'off'}`);
      if (d.isPseudoLink) bits.push('scripted link, not navigation');
      if (d.href && d.external) bits.push(`goes to ${d.href}`);
      else if (d.href) bits.push(`goes to ${d.href}`);
      if (d.unnamed) bits.push('NO accessible name - cannot be identified');
      return `${what}${bits.length ? ' (' + bits.join('; ') + ')' : ''}`;
    }

    function previewClick(ref) {
      const el = resolve(ref);
      const c = classifyClick(el);
      return {
        ref, tier: c.tier, category: c.category, reasons: c.reasons, grantable: c.grantable,
        // `risk` is retained for callers that predate tiering (src/panel.js).
        // It is now derived FROM the tier rather than being the classifier, so
        // there is one source of truth and it can no longer disagree.
        risk: c.tier === TIERS.ROUTINE ? null : `${c.tier}: ${c.category}`,
        tag: c.control.tag,
        href: c.control.href,
        control: c.control,
        summary: c.summary
      };
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
      const c = classifyClick(el);
      // A hard ceiling is refused even when the caller claims approval. There
      // is no `approved` value, and no policy, that reaches past this line.
      if (c.tier === TIERS.BLOCKED) {
        throw new Error(`Refused: ${c.category} actions are never permitted - ${c.summary}`);
      }
      if (c.tier !== TIERS.ROUTINE && approved !== true) {
        return {action: 'click', ref, requiresApproval: true, tier: c.tier, category: c.category,
                reason: `${c.category} (${c.summary})`};
      }
      el.click();
      return {action: 'click', ref, success: true, tier: c.tier, category: c.category,
              approvalUsed: c.tier !== TIERS.ROUTINE};
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

    return Object.freeze({
      inspect, fill, click, previewClick, highlight, navigate,
      // Ref-addressed so remote callers never hold a live element.
      classify: ref => classifyClick(resolve(ref)),
      decideClick, decideFill, decideNavigate
    });
  }

  global.SafariAIAgentCore = {createAgentCore, TIERS, MODES, normalizeMode, normalizePolicy};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {createAgentCore, TIERS, MODES, normalizeMode, normalizePolicy};
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
