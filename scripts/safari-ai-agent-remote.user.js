// ==UserScript==
// @name         Safari AI Agent Remote MCP
// @namespace    https://github.com/SearchingFool/Safari-ai-agent
// @version      0.2.4
// @description  Opt-in MCP gateway bridge. Only use on safe websites; never put credentials in webpage context.
// @match        https://*/*
// @match        http://*/*
// @run-at       document-idle
// @noframes
// @inject-into   content
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// ==/UserScript==

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
  const MODES = Object.freeze({READ_ONLY: 'read-only', FILL_ONLY: 'fill-only', TRUSTED: 'trusted', ASK: 'ask'});
  const MODE_VALUES = new Set(Object.values(MODES));

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

  // ---------------------------------------------------------------------------
  // FIELD VALUES (D-032)
  //
  // The snapshot used to carry no field value at all, which made *updating* an
  // existing form blind: the agent could not tell a pre-filled field from an
  // empty one, could not verify its own fill, and could not preserve a value it
  // should not change. Reporting values is now possible, but it is OFF unless
  // the operator opted the origin in AND that origin is `trusted` - and it is
  // refused outright for the categories below whatever policy says.
  //
  // Same split as everywhere else (D-025): the gateway may only ever answer
  // "the operator opted this origin in". WHICH fields are readable is decided
  // here, from the live DOM, by code that ships with the bridge. There is
  // deliberately no field on the wire by which a gateway can name a field, widen
  // the allowlist, or disable an exclusion.
  //
  // HARD EXCLUSIONS. Structural, not keyword-based, and unreachable by any
  // policy - the value analogue of hardCeiling():
  //   - input[type=password], and EVERY field in a form that carries one (the
  //     username beside a password is a credential too, and so is the answer to
  //     a security question sitting in the same form);
  //   - anything matching CC_AUTOFILL, and every field in a form that carries
  //     one (payment instrument data);
  //   - input[type=hidden] - never shown to the human, so never consented to;
  //   - any autocomplete token in SENSITIVE_AUTOFILL below.
  const SENSITIVE_AUTOFILL = Object.freeze(new Set([
    'one-time-code', 'current-password', 'new-password'
  ]));
  // Value reporting is ALLOWLISTED by control kind, not blocklisted. An input
  // type nobody enumerated reports nothing, which is the fail-closed direction:
  // a future HTML input type cannot leak by default.
  const VALUE_INPUT_TYPES = Object.freeze(new Set([
    ...TEXT_INPUT_TYPES, 'number', 'date', 'month', 'week', 'datetime-local'
  ]));
  const MAX_VALUE = 200;

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
    const mode = normalizeMode(source.mode);
    return Object.freeze({
      mode,
      // D-032 field values. An ORTHOGONAL per-origin flag, not a fourth mode:
      // seeing what a field contains is a disclosure question, not a question
      // of what the agent may DO, and the two do not order against each other.
      // Three independent conditions, all required, so every one of them is a
      // separate thing that must go wrong before a value is reported:
      //   - the operator opted this origin in at the gateway (source.values);
      //   - the value is strictly boolean `true`, not any truthy value, so a
      //     string, object or 1 from a confused gateway reads as off;
      //   - the origin is TRUSTED. read-only and fill-only never report values,
      //     and an origin absent from the policy map normalises to read-only,
      //     so the default for an unlisted site is silence.
      values: mode === MODES.TRUSTED && source.values === true,
      // Standing grants are OPERATOR-set only (D-021). The gateway may switch
      // them off entirely but can never switch them on by itself, and it can
      // never create one: this flag only decides whether the local panel is
      // allowed to OFFER "Always allow" to a human.
      grantsOffered: mode !== MODES.ASK && source.grants !== false,
      routineActions: mode === MODES.TRUSTED && source.routineActions === true,
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

    /**
     * HARD EXCLUSION test for a field's value (D-032). Returns true when the
     * value must NEVER be reported, whatever the policy says. Called before the
     * policy flag is consulted at all, exactly as hardCeiling() is.
     *
     * Structural throughout: no label text, placeholder or name is examined, so
     * this works on a password field labelled in any language or not at all.
     */
    function valueExcluded(el, tag, type) {
      // DELIBERATELY REDUNDANT, and honestly so. `password` is also kept out by
      // the VALUE_INPUT_TYPES allowlist below, and `hidden` is kept out three
      // more times over - inspect() skips type=hidden, isVisible() rejects a
      // zero-box element, and the allowlist does not contain it. Breaking this
      // line alone therefore changes no observable behaviour and NO TEST GOES
      // RED for it; breaking it together with the allowlist does, and
      // tests/remote_dom_smoke.py pins that pair on a form-less password field.
      // It stays because an exclusion should be stated where it is reasoned
      // about, not inferred from an allowlist two screens away.
      if (tag === 'input' && (type === 'password' || type === 'hidden')) return true;
      // The element itself is a payment-instrument field.
      if (el.matches && el.matches(CC_AUTOFILL)) return true;
      // WHATWG autofill is a token LIST ("shipping cc-number"), so split it
      // rather than comparing the attribute whole - otherwise two tokens hide a
      // sensitive one. Any cc-* token, or any token in the sensitive set, is out.
      const autofill = String(el.getAttribute?.('autocomplete') || '').toLowerCase();
      for (const token of autofill.split(/\s+/)) {
        if (!token) continue;
        if (token.startsWith('cc-') || SENSITIVE_AUTOFILL.has(token)) return true;
      }
      // Guilt by form membership. A credential or payment form makes EVERY
      // field in it sensitive: the username beside the password identifies the
      // account, and the name on a card form is the cardholder.
      const form = formOwner(el);
      if (form && (form.querySelector('input[type="password" i]') || form.querySelector(CC_AUTOFILL))) return true;
      return false;
    }

    /**
     * The field's current value, or undefined. `showValues` has already been
     * through normalizePolicy, so it is true only for a TRUSTED origin the
     * operator opted in; the exclusions above are checked regardless.
     */
    function fieldValue(el, tag, type, showValues) {
      if (showValues !== true) return undefined;
      if (valueExcluded(el, tag, type)) return undefined;
      let raw;
      if (tag === 'select' || tag === 'textarea') raw = el.value;
      else if (tag === 'input' && VALUE_INPUT_TYPES.has(type)) raw = el.value;
      else if (el.isContentEditable && el.getAttribute('contenteditable') === 'true') raw = el.textContent;
      // Anything else - a button, a checkbox, an input type nobody enumerated -
      // reports nothing. Allowlisted, so a new control kind is silent by default.
      else return undefined;
      if (typeof raw !== 'string') return undefined;
      // An EMPTY string is reported as "". `value` absent and `value: ""` mean
      // different things - not disclosed, versus disclosed and the field is
      // empty - and the difference is the whole point of the feature.
      return trim(raw, MAX_VALUE);
    }

    function describe(el, ref, showValues) {
      const tag = el.tagName.toLowerCase();
      const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag;
      const details = {ref, tag, type, label: getLabel(el), disabled: Boolean(el.disabled)};
      if (tag === 'a') {
        const raw = el.getAttribute('href') || '';
        try { const href = new URL(raw, doc.baseURI); if (['https:', 'http:'].includes(href.protocol)) details.href = href.href; }
        catch (_) { /* An invalid URL is deliberately omitted. */ }
      }
      if (tag === 'select') details.options = [...el.options].slice(0, 30).map(option => ({value: option.value, label: trim(option.textContent, 80)}));
      // Field values are OMITTED unless the operator opted this trusted origin
      // in (D-032), and omitted unconditionally for passwords, password-form
      // siblings, payment fields, hidden inputs and sensitive autofill tokens.
      const value = fieldValue(el, tag, type, showValues);
      if (value !== undefined) {
        details.value = value;
        // Say so when the value was cut, otherwise a caller comparing its own
        // fill against the readback sees a mismatch and cannot tell why.
        if (value.length >= MAX_VALUE) details.valueTruncated = true;
      }
      return details;
    }

    function inspect(policy) {
      // Policy may have come over the network. normalizePolicy collapses
      // anything unrecognised to read-only, which cannot report values, so the
      // no-argument call used by the panel and the extension is values-off.
      const showValues = normalizePolicy(policy).values;
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
        elements.push(describe(el, ref, showValues));
      }
      // body.innerText only reflects rendered text. This is intentionally local-only.
      // Never copy a snapshot to an AI provider without separate explicit consent.
      const pageText = trim(doc.body?.innerText || '', MAX_TEXT);
      const snapshot = {
        schema: 'safari-ai-agent.snapshot.v1',
        url: win.location.href,
        title: trim(doc.title, 240),
        textExcerpt: pageText,
        elements,
        truncated: elements.length >= MAX_ELEMENTS
      };
      // Added ONLY when values are on, so a snapshot taken under the default is
      // byte-identical to the one this code produced before D-032. When it is
      // present it tells the caller that a missing `value` means excluded or
      // unsupported, not merely "not asked for".
      if (showValues) snapshot.fieldValues = true;
      return snapshot;
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
      // Form membership alone does not turn a non-submit control into a submit.
      if (d.isSubmit) return null;
      if (/\b(save|send|post|publish|confirm|book|reserve|follow|like|subscribe)\b/i.test(d.name || '')) return null;
      // aria-pressed / aria-checked is a persisted state change - Like, Follow,
      // Subscribe, Mute. Structurally detectable in any language with no text.
      if (d.isToggle) return null;
      const role = trim(el.getAttribute('role') || '', 32).toLowerCase();
      // 1. Ordinary same-origin navigation by a real href. Reversible with Back.
      if (d.tag === 'a' && d.href && !d.isPseudoLink && !d.external && !el.hasAttribute('download')) return 'same-origin-link';
      // 2. Disclosure. aria-expanded is only meaningful on a control that
      //    expands something, and collapsing it again is the inverse.
      if (el.hasAttribute('aria-expanded') && !d.isPseudoLink) return 'disclosure';
      // 3. Tab selection within a tablist, and pagination expressed as tabs.
      if (role === 'tab' || (el.hasAttribute('aria-selected') && role !== 'option')) return 'tab-select';
      if (el.getAttribute('aria-haspopup') === 'menu' && doc.getElementById(el.getAttribute('aria-controls'))) return 'menu-open';
      // Tour controls need both a recognised tour container and a step label;
      // a generic "Next" or "Finish" button elsewhere stays unclear.
      if (d.type === 'button' && el.closest('.introjs-tooltip,.driver-popover,.shepherd-element,[data-tour-step]') &&
          /^(next|previous|back|skip|done|finish|close)(\s+(step|tour))?$/i.test(d.name)) return 'tour-step';
      return null;
    }

    /** Classify real submits separately from other data changes and unclear controls. */
    function elevatedCategory(el, d) {
      if (d.isSubmit) return 'form-submit';
      if (d.isToggle) return 'state-toggle';
      if (/\b(save|send|post|publish|confirm|book|reserve|follow|like|subscribe)\b/i.test(d.name || '')) return 'data-change';
      if (formOwner(el)) return 'form-control';
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
     *   - automatic execution requires trusted mode, explicit routine
     *     permission and a recognised routine classification.
     */
    function decideClick(classification, policy) {
      const p = normalizePolicy(policy);
      if (classification.tier === TIERS.BLOCKED) {
        return {decision: 'refuse', grantable: false, mode: p.mode,
                reason: `${classification.category} actions are never permitted on any site, including trusted ones`};
      }
      if (p.mode !== MODES.TRUSTED && p.mode !== MODES.ASK) {
        return {decision: 'refuse', grantable: false, mode: p.mode,
                reason: `clicking is not permitted on this site (site mode: ${p.mode}). Nominate it as trusted to allow completion.`};
      }
      if (p.routineActions && classification.tier === TIERS.ROUTINE) {
        return {decision:'allow',mode:p.mode,grantable:false};
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
      return {decision: p.mode === MODES.ASK ? 'prompt' : 'allow', mode: p.mode};
    }

    function decideNavigate(policy) {
      const p = normalizePolicy(policy);
      if (p.mode === MODES.READ_ONLY) {
        return {decision: 'refuse', grantable: false, mode: p.mode, reason: 'this site is read-only; navigation is not permitted'};
      }
      return {decision: p.routineActions ? 'allow' : 'prompt', mode: p.mode, grantable: !p.routineActions && p.grantsOffered};
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
      const inForm = Boolean(formOwner(el));
      // Use the browser's effective type: missing/invalid button types submit.
      const type = (tag === 'button' ? el.type : el.getAttribute('type') || '').toLowerCase();
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
        actionType: c.tier === TIERS.BLOCKED ? 'Blocked action' :
          c.category === 'same-origin-link' ? 'Navigation' :
          c.tier === TIERS.ROUTINE ? 'Page interaction' :
          ['form-submit','state-toggle','data-change'].includes(c.category) ? 'Submit or change data' : 'Unclear action',
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

    // A saved approval identifies one control on one exact page, never an eN
    // ref or an entire action category. Ambiguous/unnamed controls cannot persist.
    function approvalKey(ref) {
      const el=resolve(ref);
      const signature=node=>{
        const d=describeControl(node);
        return JSON.stringify([node.id||'',d.tag,d.type,d.name,d.href,
          node.getAttribute('name')||'',node.getAttribute('data-testid')||'',formOwner(node)?.id||'']);
      };
      if(!getLabel(el))return null;
      const value=signature(el);
      if([...doc.querySelectorAll(ACTIONABLE)].filter(node=>signature(node)===value).length!==1)return null;
      const key=JSON.stringify([win.location.origin,win.location.pathname,win.location.search,value]);
      return key.length<4000?key:null;
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
      inspect, fill, click, previewClick, approvalKey, highlight, navigate,
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


/*
 * Opt-in remote MCP browser bridge for Userscripts on iPad.
 * IMPORTANT: this must run with @inject-into content and GM.* grants.
 * Never inject the device credential into the webpage or localStorage.
 * The UI uses a closed ShadowRoot so site scripts cannot inspect entered secrets.
 */
(function () {
  'use strict';
  if (window.self !== window.top) return;
  if (typeof GM !== 'object' || typeof GM.getValue !== 'function' || typeof GM.xmlHttpRequest !== 'function') return;
  const K_URL = 'safari-agent:gateway-url';
  const K_TOKEN = 'safari-agent:device-token';
  const K_SITE = `safari-agent:enabled:${location.origin}`;
  const K_EVERYWHERE = 'safari-agent:read-everywhere';
  const K_ACTIVE = 'safari-agent:active';
  const K_GRANTS = `safari-agent:button-grants:${location.origin}`;
  // Per-TAB identity. sessionStorage is scoped to one tab and survives
  // same-tab navigation and reload, which is exactly the lifetime of a paired
  // session: a new tab gets a new id, but navigating within this tab keeps it,
  // so the gateway does not see our own next page as a rival tab.
  // Not a secret and never sent to a model - the device token stays in GM storage.
  const K_INSTANCE = 'safari-agent:instance';
  const K_SEQ = 'safari-agent:seq';
  // Global, not per-origin: this is a property of the device and the person
  // holding it, not of the site being automated.
  const K_SOUND = 'safari-agent:approval-sound';
  const INSTANCE_ID = /^[A-Za-z0-9_-]{8,64}$/;
  const MAX_WAIT = 8000;
  let running = false;
  let paused = false;
  let timer = null;
  let loopId = 0;
  let lastCommand = '';
  let lastSnapshot = null;
  let takeoverRequested = false;
  const SAFARI_CORE = globalThis.SafariAIAgentCore;
  const core = SAFARI_CORE.createAgentCore(document, window);
  let url = '';
  let token = '';

  // ---------------------------------------------------------------------------
  // POLICY (D-025) and STANDING GRANTS (D-021)
  //
  // `policy` is the TUNABLE half, delivered by the gateway on every poll and
  // re-normalised here every time. Until a poll answers, and whenever the
  // answer is missing or malformed, it is read-only: the bridge fails closed on
  // a gateway it cannot hear from, not open.
  //
  // `grants` is the LOCAL half. It is a persistent, per-button map that only
  // the operator can add to - by pressing "Always allow" in the panel dialog.
  // The gateway cannot create one, the model cannot request one, and nothing in
  // the page can cause one, which is what stops prompt injection from turning
  // into privilege escalation. Grants key on origin + page + control, never on an
  // element ref: refs are reassigned on every inspect, so a ref-scoped grant
  // would silently transfer to an unrelated control.
  // ---------------------------------------------------------------------------
  let policy = SAFARI_CORE.normalizePolicy(null);
  const grants = new Map(); // exact page + stable control signature; isolated GM storage
  let grantLoad=null,grantWrites=Promise.resolve(),clickAuthorization=null;
  function persistGrants(){
    const saved=[...grants.entries()];
    grantWrites=grantWrites.catch(()=>{}).then(()=>GM.setValue(K_GRANTS,saved));
    return grantWrites;
  }
  async function loadGrants(refresh=false){
    if(refresh){await grantWrites;grantLoad=null;}
    if(!grantLoad)grantLoad=(async()=>{
      const saved=await GM.getValue(K_GRANTS,[]);
      grants.clear();
      if(Array.isArray(saved))for(const row of saved.slice(0,100)){
        if(Array.isArray(row)&&typeof row[0]==='string'&&row[0].length<4000&&row[1]?.origin===location.origin&&typeof row[1].category==='string')grants.set(row[0],row[1]);
      }
      renderGrants();
    })();
    return grantLoad;
  }
  function hasGrant(key,category){return Boolean(key&&grants.get(key)?.category===category);}
  async function addGrant(key,category,target){
    if(!key||grants.size>=100)throw Error('Cannot save this approval; revoke an existing approval and retry.');
    const previous=grants.get(key);
    grants.set(key,{origin:location.origin,category,target,page:location.pathname,at:Date.now()});
    try{await persistGrants();}catch(error){if(previous)grants.set(key,previous);else grants.delete(key);throw Error('Could not save Always allow. No action executed.');}
    renderGrants();
  }
  async function revokeGrant(key){grants.delete(key);renderGrants();await persistGrants();}
  async function revokeAllGrants(){grants.clear();renderGrants();await persistGrants();}
  // Saved approvals survive reconnects. Current policy and live classification
  // are checked first, so a saved approval cannot bypass a restriction.
  function applyPolicy(raw) {
    const next = SAFARI_CORE.normalizePolicy(raw);
    policy = next;
    renderGrants();
  }

  const instanceId = (() => {
    let existing = '';
    // Opaque origins (and Private Browsing) throw on sessionStorage access.
    // Falling back to a memory-only id is correct: no storage means no tab
    // continuity to preserve anyway.
    try { existing = String(window.sessionStorage.getItem(K_INSTANCE) || ''); } catch { existing = ''; }
    if (INSTANCE_ID.test(existing)) return existing;
    const fresh = (typeof crypto === 'object' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `t${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    try { window.sessionStorage.setItem(K_INSTANCE, fresh); } catch { /* memory-only id */ }
    return fresh;
  })();

  // Monotonic per-tab request counter (D-035). visibilityState is read when a
  // request is BUILT, but the request is then awaited, so a poll built while
  // visible can still be in flight when the tab goes hidden. It then races the
  // out-of-band "I am hidden" notification fired by visibilitychange, and if
  // the stale one lands second the gateway - last-writer-wins - records a
  // suspended tab as visible. Nothing corrects it, because the tab has stopped
  // polling. That blocks sessionFollows (D-033) for the full 45s freshness
  // window and forces a manual Take over.
  //
  // Observed on an iPad 2026-10-11: once in eight visibility transitions, with
  // the two requests one millisecond apart. It cannot be reproduced off-device
  // because headless browsers do not suspend tabs, so the gateway-side ordering
  // rule is what the tests pin.
  //
  // The counter lives in sessionStorage beside the instance id deliberately:
  // the two must share a lifetime. A reload keeps the instance id, so a
  // counter that reset on reload would make every subsequent poll look stale
  // and freeze the gateway's view of this tab permanently - a worse bug than
  // the one being fixed.
  let seq = (() => {
    try { return Math.max(0, parseInt(window.sessionStorage.getItem(K_SEQ) || '0', 10) || 0); }
    catch { return 0; }
  })();
  function nextSeq() {
    seq += 1;
    try { window.sessionStorage.setItem(K_SEQ, String(seq)); } catch { /* memory-only, still monotonic in-tab */ }
    return seq;
  }

  // Identity sent on every device call. visibilityState is part of it because
  // the gateway refuses to hand a command to a tab the operator cannot see.
  const identity = () => ({origin: location.origin, instanceId, visibility: document.visibilityState, seq: nextSeq()});

  // The native Userscripts API bridges to Safari's extension, bypassing page CORS.
  async function request(path, payload) {
    if (!url.startsWith('https://')) throw new Error('An HTTPS gateway is required.');
    const response = await GM.xmlHttpRequest({
      method:'POST', url:url + path, headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
      data:JSON.stringify(payload), timeout:MAX_WAIT, responseType:'text'
    });
    let body = null;
    try{ body = JSON.parse(response.responseText); }catch{ body = null; }
    if(response.status!==200){
      // Carry the parsed body on the error. A bare "HTTP 409" is what made the
      // two-tab deadlock undiagnosable from the panel (D-017).
      const error = new Error(body && body.error ? `Gateway HTTP ${response.status}: ${body.error}` : `Gateway HTTP ${response.status}`);
      error.status = response.status; error.payload = body;
      throw error;
    }
    if(!body) throw new Error('Gateway returned invalid JSON');
    return body;
  }
  async function execute(command){
    if(!command || typeof command!=='object' || command.origin!==location.origin) throw new Error('Wrong session origin');
    if(!/^[0-9a-f-]{36}$/.test(command.id)|| Date.now()>=command.expiresAt)throw new Error('Expired/invalid command');
    const a=command.args||{};
    if(a.ref && !/^e\d{1,3}$/.test(a.ref))throw new Error('Invalid element reference');
    switch(command.action){
      // Inspect and verify are permitted in every mode including read-only.
      // They still disclose rendered page text to the model, which is why
      // read-only is a site-trust decision and not "harmless".
      // Policy is handed to inspect() so the snapshot can carry field VALUES
      // (D-032) when - and only when - the operator opted this trusted origin
      // in. core.normalizePolicy re-checks that independently of the gateway,
      // and the hard exclusions inside core.js are not reachable from here at
      // all, so passing policy can widen the snapshot by exactly one thing.
      case 'browser_inspect': lastSnapshot=core.inspect(policy); return {success:true,data:lastSnapshot};
      case 'browser_fill': {
        const verdict=core.decideFill(policy);
        if(!['allow','prompt'].includes(verdict.decision))throw new Error(`Refused: ${verdict.reason}`);
        if(!lastSnapshot?.elements.some(x=>x.ref===a.ref))throw new Error('Inspect before filling a field');
        if(verdict.decision==='prompt'){
          const field=lastSnapshot.elements.find(x=>x.ref===a.ref);
          const answer=await requestApproval({verb:'fill field',target:field.label||field.name||a.ref,
            tier:'elevated',category:'field-fill',reasons:['This website asks before every action.'],
            grantable:false,expiresAt:command.expiresAt});
          const refusal=refusalFor(answer,'fill field');if(refusal)throw new Error(refusal);
          if(policy.mode==='read-only')throw new Error('Site permission changed while approval was open');
        }
        return {success:true,data:core.fill(a.ref,a.value)};
      }
      case 'browser_verify': {
        const snap=core.inspect(policy); lastSnapshot=snap;
        const pass=(!a.textIncludes || snap.textExcerpt.includes(a.textIncludes)) && (!a.urlIncludes || snap.url.includes(a.urlIncludes));
        return {success:pass,data:{match:pass,url:snap.url,title:snap.title},error:pass?undefined:'Expected condition was not observed'};
      }
      case 'browser_click': {
        if(!lastSnapshot?.elements.some(x=>x.ref===a.ref))throw new Error('Inspect before clicking an element');
        const preview=core.previewClick(a.ref);
        // Classification happens in the bridge, from the live DOM. The verdict
        // then applies policy; a hard ceiling is refused inside decideClick
        // before the policy mode is even read.
        const verdict=core.decideClick(preview,policy);
        if(!['prompt','allow'].includes(verdict.decision))throw new Error(`Refused: ${verdict.reason}`);
        if(preview.href && new URL(preview.href).origin!==location.origin)throw new Error('Cross-site link blocked');
        const targetKey=core.approvalKey(a.ref);
        clickAuthorization={id:command.id,key:targetKey,category:preview.category,summary:preview.summary};
        if(verdict.decision==='allow')return {success:true,dispatched:true,verified:false,action:'click',approval:'site-permission',category:preview.category};
        if(verdict.grantable)await loadGrants(true);
        // A standing grant covers only the ROUTINE class the operator granted,
        // on this origin. It is checked AFTER the tier and mode gates, so it can
        // never reach an elevated or blocked control.
        if(verdict.grantable && hasGrant(targetKey,preview.category)){
          return {success:true,dispatched:true,verified:false,action:'click',approval:'standing-grant',category:preview.category};
        }
        // Name the control, not the opaque ref. The operator is the enforcement
        // layer here, so approving "e37" is the security control failing.
        const answer=await requestApproval({
          verb:'click', target:preview.summary||a.ref, tier:preview.tier,
          category:preview.category, actionType:preview.actionType,reasons:preview.reasons,
          grantable:verdict.grantable&&Boolean(targetKey), expiresAt:command.expiresAt
        });
        const refusal=refusalFor(answer,'click');
        if(refusal)throw new Error(refusal);
        if(answer==='always')await addGrant(targetKey,preview.category,preview.summary);
        // Links may cause a page unload. Caller must inspect again to verify.
        return {success:true,dispatched:true,verified:false,action:'click',approval:answer,category:preview.category};
      }
      case 'browser_navigate': {
        const dest = new URL(a.url);
        if(!['http:','https:'].includes(dest.protocol)||dest.origin!==location.origin)throw new Error('Only same-site navigation allowed');
        const verdict=core.decideNavigate(policy);
        if(!['prompt','allow'].includes(verdict.decision))throw new Error(`Refused: ${verdict.reason}`);
        if(verdict.decision==='allow')return {success:true,dispatched:true,verified:false,url:dest.href,approval:'site-permission'};
        const answer=await requestApproval({
          verb:'navigate to', target:dest.href, tier:'routine', category:NAV_CLASS,actionType:'Navigation',
          reasons:['same-origin navigation, reversible with the back button'],
          grantable:false, expiresAt:command.expiresAt
        });
        const refusal=refusalFor(answer,'navigation');
        if(refusal)throw new Error(refusal);
        return {success:true,dispatched:true,verified:false,url:dest.href,approval:answer};
      }
      default:throw new Error('Unsupported tool action');
    }
  }
  const NAV_CLASS='same-origin-navigation';
  const sleep=ms=>new Promise(resolve=>{timer=setTimeout(resolve,ms);});
  // A target="_blank" link opens a NEW tab, which would strand the paired
  // session in the tab the operator is still looking at and start an unpaired
  // instance elsewhere. Rewrite to _self in the capture phase: the target
  // attribute is read when the default action runs, after dispatch, so this
  // takes effect for the click we are about to make. It is not restored
  // afterwards - the page is navigating away, and keeping the agent's work in
  // the paired tab is the intended behaviour, not a temporary override.
  function keepNavigationInThisTab(event){
    const link = event.target && typeof event.target.closest==='function' ? event.target.closest('a[target]') : null;
    if(!link) return;
    const requested = link.getAttribute('target');
    if(!requested || requested==='_self') return;
    try{
      if(new URL(link.getAttribute('href')||'',document.baseURI).origin!==location.origin) return;
    }catch{ return; }
    link.setAttribute('target','_self');
  }
  // `approved` is true because the gate already ran in execute(): the operator
  // answered the dialog, or a standing grant covered this ROUTINE class. A hard
  // ceiling still throws inside core.click() regardless of this flag, so the
  // re-check on dispatch is a genuine second evaluation of the live DOM and not
  // a formality - if the page swapped the control under us between approval and
  // dispatch, a now-blocked control is refused here.
  function clickInThisTab(ref){
    document.addEventListener('click',keepNavigationInThisTab,true);
    try{ return core.click(ref,true); }
    finally{ document.removeEventListener('click',keepNavigationInThisTab,true); }
  }
  async function pump(){
    const mine=++loopId; // Retires any older loop; prevents two pumps after a resume.
    while(running && !paused && loopId===mine){
      try {
        const poll={...identity()};
        if(takeoverRequested)poll.takeover=true;
        const p=await request('/device/poll',poll);
        takeoverRequested=false;
        conflict=null;
        // Policy is re-read on EVERY poll, so revoking trust at the gateway
        // takes effect within one poll interval rather than at next connect.
        // A response with no policy field normalises to read-only.
        applyPolicy(p.policy);
        if(!running||paused||loopId!==mine) break; // Stop/pause during an in-flight request must prevent execution.
        if(p.command){
          const command=p.command;
          lastCommand=command.action;
          let outcome;
          try{outcome=await execute(command);}catch(e){outcome={success:false,error:String(e.message||e)};}
          // Acknowledge before unload for click/navigation. This is a dispatch
          // acknowledgement ONLY, not confirmation that navigation succeeded.
          const a=await request('/device/result',{id:command.id,...identity(),result:outcome});
          if(!a.accepted)throw new Error('Gateway rejected result');
          // Stop while the request was in flight must prevent further local actions.
          // An already-acknowledged navigation/click is still unverified remotely.
          if(!running||paused||loopId!==mine) return;
          if(outcome.success && outcome.dispatched && command.action==='browser_navigate'){
            running=false;
            location.assign(outcome.url);
            return;
          }
          if(outcome.success && outcome.dispatched && command.action==='browser_click'){
            const currentPreview=core.previewClick(command.args.ref);
            if(clickAuthorization?.id!==command.id||clickAuthorization.category!==currentPreview.category||clickAuthorization.summary!==currentPreview.summary||
               (clickAuthorization.key&&clickAuthorization.key!==core.approvalKey(command.args.ref)))throw new Error('Click target changed; inspect again.');
            const latest=core.decideClick(currentPreview,policy);
            if(latest.decision==='refuse'||(outcome.approval==='site-permission'&&latest.decision!=='allow'))throw new Error('Click permission changed; inspect again.');
            // Re-check element/reference after user's confirmation, then click.
            const result=clickInThisTab(command.args.ref);
            if(result.requiresApproval)throw new Error('Unexpected high-impact control on recheck');
            lastSnapshot=null;
          }
        }
        // A successful poll means the gateway considers THIS tab the owner, so
        // the panel can say so without guessing. With the session now following
        // the visible tab (D-033) the operator may have several tabs of one
        // site open, and "Connected" in all of them would be a lie in all but
        // one - so the live tab says "LIVE in this tab" and every other tab
        // says standing by or paused.
        show(running?`${LIVE} Live in this tab · ${lastCommand||'ready'}`:'Stopped');
      } catch(e){
        if(e.status===409 && e.payload && e.payload.code==='DEVICE_SESSION_CONFLICT')showConflict(e.payload);
        else show(`Connection/action error: ${String(e.message||e)}`);
      }
      if(running && !paused && loopId===mine)await sleep(1200);
    }
  }
  const LIVE='●';   // filled dot: this tab holds the session
  const IDLE='○';   // hollow dot: this tab is connected but not the live one
  function show(message){ if(status)status.textContent=message; if(takeover)takeover.hidden=!conflict; }
  // Name the tab that actually holds the session and offer a way out. Before
  // this the losing panel showed a bare HTTP error and polled forever (D-017).
  function showConflict(payload){
    conflict=payload;
    const seconds=Math.ceil((payload.staleAfterMs||0)/1000);
    if(payload.sameOrigin){
      // Same origin is the D-033 case. A 409 here means the other tab is
      // currently VISIBLE, because the gateway hands the session over
      // automatically as soon as it is not - so the honest message is "you are
      // next", not "something is broken". Take over stays available for the
      // genuinely ambiguous case of two tabs visible at once (Split View or a
      // second window), which is the one thing the gateway cannot decide.
      show(`${IDLE} Standing by — another tab of this site is live. This tab becomes live automatically as soon as it is the one you are looking at. Press "Take over" only if both tabs are on screen at once.`);
      return;
    }
    show(`${IDLE} ${payload.activeOrigin||'Another site'} is connected and owns the device session. Stop it there, or press "Take over" to move the session to this tab. ${seconds>0?`It frees itself in about ${seconds}s if that tab is gone.`:''}`);
  }
  let status=null;
  let takeover=null;
  let conflict=null;
  let approvalBox=null;
  let grantList=null;
  let modeLine=null;
  let pendingApproval=null;

  // window.confirm is binary and cannot express allow-once / allow-always /
  // deny, and a native modal also blocks the bridge's own event loop. This is a
  // three-way dialog rendered inside the SAME closed shadow root as the panel,
  // so a page script can neither read it nor synthesise a click on it.
  //
  // Everything page-derived (the control's accessible name) is inserted with
  // textContent, never innerHTML: the summary is attacker-influenced text and
  // the one place it is displayed must not be able to build markup.
  function el(tag,text,className){
    const node=document.createElement(tag);
    if(text!==undefined&&text!==null)node.textContent=String(text);
    if(className)node.className=className;
    return node;
  }
  // ---------------------------------------------------------------------------
  // AUDIBLE ALERT (D-039)
  //
  // The whole safety model rests on a human NOTICING the prompt. A gate nobody
  // sees is not a gate. Observed twice within five minutes on 2026-10-11: the
  // dialog opened, the operator was reading something else, and it timed out
  // unanswered - which the diagnostics correctly calls a usability defect
  // rather than a user choice (D-037).
  //
  // Sound is the only channel available here. iOS Safari has no
  // navigator.vibrate, and Web Push needs a home-screen web app. Web Audio must
  // be unlocked by a real user gesture, so it is unlocked on the operator's own
  // taps in the panel - toggle, Save, Connect - which always happen before any
  // approval can arrive. Nothing touches audio on load.
  //
  // Synthesised rather than a bundled file on purpose: no network fetch, and no
  // base64 blob inside a userscript that has to stay auditable by eye.
  //
  // This must NEVER be able to block or delay the prompt. If audio is
  // unavailable, denied, or throws, the dialog still appears: a silent alert is
  // degraded, a missing dialog is a defect.
  let audioContext = null;
  let soundEnabled = true;
  function unlockSound(){
    if(audioContext || !soundEnabled)return;
    try{
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if(!Ctor)return;
      audioContext = new Ctor();
      if(audioContext.state === 'suspended' && typeof audioContext.resume === 'function')void audioContext.resume();
      // D-040. Creating and resuming a context is NOT enough on iOS: Safari
      // only fully unlocks audio once a buffer has actually been PLAYED inside
      // a user gesture. Skipping this half is why the first version was silent
      // on a device with the volume up and the ringer on, while YouTube played
      // normally in the same browser at the same moment.
      //
      // A one-frame silent buffer is the standard way to do it. Inaudible, but
      // it must be started synchronously, here, inside the tap.
      if(typeof audioContext.createBuffer === 'function'){
        const buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate || 22050);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        if(typeof source.start === 'function')source.start(0);
      }
    }catch{ audioContext = null; }
  }
  function alertSound(){
    if(!soundEnabled)return;
    try{
      if(!audioContext)return;
      // D-040. resume() is ASYNCHRONOUS. Scheduling against currentTime while
      // the context is still suspended puts both notes in the past by the time
      // audio actually starts, and the hardware drops them - silently, with no
      // error, which from outside is indistinguishable from a muted device.
      // So: resume first, schedule only once it is actually running.
      if(audioContext.state === 'suspended' && typeof audioContext.resume === 'function'){
        const resumed = audioContext.resume();
        if(resumed && typeof resumed.then === 'function'){ void resumed.then(playTones, () => {}); return; }
      }
      playTones();
    }catch{ /* audio is a courtesy; it must never affect the gate */ }
  }
  function playTones(){
    try{
      if(!audioContext)return;
      // A small lead, so a note is never scheduled at a moment that has already
      // passed by the time the hardware starts.
      const now = audioContext.currentTime + 0.02;
      // Rising two-tone: short, quiet, and not a lookalike of a system sound.
      for(const [at, hz] of [[0, 880], [0.16, 1320]]){
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.value = hz;
        // Ramped rather than switched; an abrupt gain change clicks.
        gain.gain.setValueAtTime(0.0001, now + at);
        gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.14);
        osc.connect(gain); gain.connect(audioContext.destination);
        osc.start(now + at); osc.stop(now + at + 0.16);
      }
    }catch{ /* audio is a courtesy; it must never affect the gate */ }
  }

  // D-040. The alert must NOT depend on audio. The first version did - having
  // already recorded that iOS might refuse to play it - and was then silent on
  // a device with the volume up and the ringer on. Sound can fail for reasons
  // no code here can see or fix: the ringer switch, an audio session policy,
  // headphones elsewhere, a future Safari change.
  //
  // So the visual cue always runs and sound is the bonus, not the other way
  // round. A pulse on the dialog border is visible across a desk, costs
  // nothing, and cannot be refused by a platform policy.
  function alertAttention(){
    try{
      if(approvalBox){
        approvalBox.classList.remove('pulse');
        // Reading offsetWidth restarts the animation; without it a second
        // prompt in the same session would not re-trigger it.
        void approvalBox.offsetWidth;
        approvalBox.classList.add('pulse');
      }
    }catch{ /* never let a cosmetic cue break the prompt */ }
    alertSound();
  }

  // The answers that MEAN CONSENT. Everything else refuses, including any value
  // added later. This is an allowlist on purpose: the previous code refused only
  // the literal string 'deny' and returned success for anything else, so adding
  // a 'timeout' answer - the obvious fix for D-037 - would have turned every
  // unanswered prompt into consent. Extending this dialog must never be able to
  // create an approval path by accident.
  const APPROVALS=new Set(['once','always']);
  // Why the refusal happened, in the words the MODEL and the audit log will see.
  // These were one string - 'User denied click' - for every outcome, so a prompt
  // that expired unanswered was recorded as a decision the operator never made
  // (D-037). 'They refused' and 'they never saw it' call for opposite responses,
  // so they must be distinguishable.
  function refusalFor(answer,verb){
    if(APPROVALS.has(answer))return null;
    // Only this one is an operator decision.
    if(answer==='deny')return `The operator denied ${verb} in the paired tab.`;
    if(answer==='timeout')return `Nobody answered the approval prompt for ${verb} in the paired tab, so it was refused. This is NOT an operator decision - the prompt may not have been seen. Check the tab is visible before retrying.`;
    if(answer==='hidden')return `The paired tab went off screen while the approval for ${verb} was open, so it was refused. Consent given to a page the operator cannot see is not consent.`;
    if(answer==='stopped')return `The operator pressed Stop while the approval for ${verb} was open, revoking it and disconnecting this tab.`;
    if(answer==='superseded')return `The approval prompt for ${verb} was replaced by a newer request before it was answered, so it was refused.`;
    // Unrecognised outcome. Refuse - but do NOT attribute it to the operator.
    // Claiming a decision nobody made is the whole of D-037, and a default that
    // does it for every future answer value would reintroduce it by design.
    return `The approval for ${verb} did not complete (unrecognised outcome), so it was refused. No operator decision was recorded.`;
  }
  function requestApproval(request){
    // No UI means no way to obtain consent, so the answer is no. Failing closed
    // here matters: a headless or stripped environment must not become a path
    // to unattended action.
    if(!approvalBox)return Promise.resolve('deny');
    // A prompt replaced before it was answered. Refused, but nobody decided it.
    if(pendingApproval)pendingApproval('superseded');
    return new Promise(resolve=>{
      let done=false;
      const settle=answer=>{
        if(done)return;
        done=true;
        clearTimeout(timer2);
        pendingApproval=null;
        approvalBox.textContent='';
        approvalBox.hidden=true;
        resolve(answer);
      };
      pendingApproval=settle;
      // The gateway abandons the command at expiresAt. Auto-DENY before that so
      // an unattended tab yields a clean refusal instead of "outcome may be
      // uncertain" - the one failure class a caller cannot safely retry.
      const remaining=(Number(request.expiresAt)||0)-Date.now()-1500;
      // Settles 'timeout', not 'deny'. It still REFUSES - that is unchanged and
      // correct - but it is not an operator decision and must not be reported as
      // one (D-037).
      const timer2=setTimeout(()=>settle('timeout'),Math.max(1000,Math.min(120000,remaining)));
      approvalBox.textContent='';
      approvalBox.append(el('b',`Approve ${request.verb}?`));
      if(request.actionType)approvalBox.append(el('p',request.actionType,'why'));
      approvalBox.append(el('p',request.target,'target'));
      approvalBox.append(el('p',`on ${location.origin}`,'where'));
      const why=el('p',`${request.tier.toUpperCase()} · ${request.category}`,'why');
      approvalBox.append(why);
      for(const reason of request.reasons||[])approvalBox.append(el('p',`· ${reason}`,'why'));
      const row=el('div',null,'actions');
      const once=el('button','Allow once');once.id='approve-once';once.type='button';
      once.addEventListener('click',()=>settle('once'));
      row.append(once);
      if(request.grantable){
        const always=el('button','Always allow this button on this page');
        always.id='approve-always';always.type='button';
        always.addEventListener('click',()=>settle('always'));
        row.append(always);
      }
      const deny=el('button','Deny');deny.id='approve-deny';deny.type='button';
      deny.addEventListener('click',()=>settle('deny'));
      row.append(deny);
      approvalBox.append(row);
      // D-036. The panel carrying Stop sits at the SAME coordinates as this
      // dialog and is covered by it, so the operator's escape hatch was
      // unreachable at exactly the moment it is wanted: a prompt they did not
      // expect, or one that looks wrong. Deny is not a substitute - it refuses
      // one action and leaves the session running - so the escape belongs here.
      //
      // Deliberately in its OWN row, below a rule, and not styled like the
      // others: a mis-tap in this dialog is worse than anywhere else in the
      // product, and the operator has already mis-tapped "Allow once" for
      // "Deny" once on real hardware. It must be unmistakable, not merely
      // present.
      const escape=el('div',null,'escape');
      const stopButton=el('button','Stop the agent and disconnect');
      stopButton.id='approve-stop';stopButton.type='button';
      stopButton.addEventListener('click',()=>{
        // Settle FIRST, so stop() finds no pending approval and cannot overwrite
        // the reason with a generic denial. The operator pressing Stop IS a
        // decision, and is reported as one.
        settle('stopped');
        void stop();
      });
      escape.append(stopButton);
      approvalBox.append(escape);
      approvalBox.hidden=false;
      // After the dialog is built and shown, never before: if anything in here
      // throws, the operator still has a prompt to answer (D-039).
      alertAttention();
      once.focus();
    });
  }

  // Standing grants must be visible and individually revocable DURING a
  // session, not only clearable by Stop. Michael & Roesner found that only 6 of
  // 21 surveyed permission systems allow post-hoc modification at all; that gap
  // is the whole reason this list exists.
  function renderGrants(){
    // Field-value reporting is a disclosure the operator turned on at the
    // gateway, possibly days ago. Say so in the tab where the disclosure
    // actually happens, every time, rather than leaving it invisible here.
    if(modeLine)modeLine.textContent=`Site mode: ${policy.mode}${policy.grantsOffered?'':' (standing approvals disabled by gateway)'}`+
      (policy.routineActions?' · recognised navigation and page interactions automatic':'')+
      (policy.values?' · FIELD VALUES on this site are readable by the AI (passwords, card and hidden fields never are)':'');
    if(!grantList)return;
    grantList.textContent='';
    if(grants.size===0){
      grantList.append(el('p','No standing approvals.','muted'));
      return;
    }
    grantList.append(el('p',`${grants.size} standing approval${grants.size===1?'':'s'} saved for individual buttons — review:`,'muted'));
    for(const [key,grant] of grants){
      const row=el('div',null,'grant');
      row.append(el('span',`${grant.target||grant.category} · ${grant.category} on ${grant.page||'this page'}`));
      const button=el('button','Revoke');button.type='button';
      button.addEventListener('click',()=>void revokeGrant(key).catch(error=>show(`Could not save revocation: ${error.message}`)));
      row.append(button);
      grantList.append(row);
    }
    const all=el('button','Revoke all');all.type='button';all.id='revoke-all';
    all.addEventListener('click',()=>void revokeAllGrants().catch(error=>show(`Could not save revocation: ${error.message}`)));
    grantList.append(all);
  }
  async function start(){
    await loadGrants();
    if(running)return;
    url=String(await GM.getValue(K_URL,'')).replace(/\/$/,'');
    token=String(await GM.getValue(K_TOKEN,''));
    if(!url.startsWith('https://')||token.length<24)throw Error('Configure HTTPS gateway and 24+ character device token first');
    running=true;
    paused=document.visibilityState!=='visible';
    await GM.setValue(K_SITE,true);
    if(paused){show(PAUSED);return;}
    show('Connecting...');void pump();
  }
  const PAUSED=`${IDLE} Paused - tab not visible. Nothing will run until you return to this tab.`;
  // Safari throttles background timers well past the gateway's 45s freshness
  // window, so an unhandled hidden tab used to look dead. Pausing explicitly
  // makes the state legible AND tells the gateway, so a queued command fails
  // fast with a clear reason instead of timing out as "outcome uncertain".
  function onVisibilityChange(){
    if(!running)return;
    if(document.visibilityState==='visible'){
      if(!paused)return;
      paused=false;conflict=null;clearTimeout(timer);show('Resuming...');void pump();
      return;
    }
    if(paused)return;
    paused=true;loopId++;clearTimeout(timer);
    // An approval dialog left open in a tab that just went off screen must not
    // be answerable later. Without this the operator could switch away, let the
    // session follow to another tab (D-033), come back minutes afterwards and
    // approve a prompt for a command this tab no longer holds - which is the
    // "two tabs acting on one command" case restated. Refusing is also the only
    // fail-closed answer: consent given to an off-screen page is not consent.
    // Reported as 'hidden', not 'deny' - the operator made no decision here, and
    // recording one they did not make is the D-037 defect.
    if(pendingApproval)pendingApproval('hidden');
    show(PAUSED);
    // Best effort only: tells the gateway this tab is not a safe place to run.
    // Load-bearing for D-033 as well as for the pause itself - it is what lets
    // the next visible tab take the session immediately instead of waiting out
    // the 45s freshness window.
    if(url&&token)void request('/device/poll',identity()).catch(()=>{});
  }
  document.addEventListener('visibilitychange',onVisibilityChange);
  // bfcache/unload: retire the loop so a restored page starts one pump, not two.
  window.addEventListener('pagehide',()=>{if(running&&!paused){paused=true;loopId++;clearTimeout(timer);}});
  window.addEventListener('pageshow',()=>{if(running&&paused&&document.visibilityState==='visible')onVisibilityChange();});
  async function stop(){
    running=false;paused=false;conflict=null;loopId++;clearTimeout(timer);
    // Stop cancels execution and resets policy to read-only. Saved approvals
    // remain in isolated storage until explicitly revoked. Reported as
    // 'stopped' - unlike a timeout this IS a deliberate operator act, and the
    // log should say which one it was.
    if(pendingApproval)pendingApproval('stopped');
    policy=SAFARI_CORE.normalizePolicy(null);
    renderGrants();
    // Persist the explicit stop before asking the gateway to revoke this device.
    await GM.setValue(K_SITE,false);
    await GM.setValue(K_ACTIVE,false);
    show('Stopping and revoking queued commands...');
    try {
      if(url && token) await request('/device/disconnect',identity());
      show('Disconnected; queued commands revoked.');
    } catch (error) {
      // Local stop always wins. If offline, the gateway may retain an in-flight
      // request until timeout; no further local actions will be executed.
      show('Stopped locally. Remote revoke unavailable; pending calls will time out.');
    }
  }
  function mount(){
    const host=document.createElement('div');host.setAttribute('data-safari-ai-remote-host','');
    const shadow=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');style.textContent=`
      button,input{font:14px system-ui}button{cursor:pointer;padding:9px;border-radius:6px;border:1px solid #8da3bf}
      .toggle{position:fixed;bottom:65px;right:20px;background:#254c7c;color:white;z-index:2147483647}
      .panel{position:fixed;bottom:112px;right:12px;width:min(360px,calc(100vw - 24px));background:white;color:#17283e;border:1px solid #b7c3d1;z-index:2147483647;padding:12px;box-sizing:border-box;border-radius:10px;font:13px system-ui;box-shadow:0 4px 20px #0004}
      .panel[hidden]{display:none}label{display:block;margin-top:8px}input{width:100%;box-sizing:border-box;padding:9px;border:1px solid #bbc6d8;border-radius:5px}
      .actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}.status{padding-top:9px;line-height:1.3;word-break:break-word}
      /* D-038. Apple's HIG minimum touch target is 44x44pt. Every button in
         this dialog rendered 37px tall - including the Deny the operator
         mis-tapped for Allow once on real hardware. Measured, not guessed:
         tests/approval_layout.py renders the real dialog at four iPad
         viewports and fails below the minimum. This is the one dialog in
         the product where a mis-tap is a safety event, so it gets the
         floor rather than the default padding. */
      @keyframes agentpulse{
        0%,100%{border-color:#b8761a;box-shadow:0 4px 24px #0006}
        50%{border-color:#e8912a;box-shadow:0 0 0 6px #e8912a66,0 4px 24px #0006}
      }
      .approval.pulse{animation:agentpulse 0.7s ease-in-out 3}
      @media (prefers-reduced-motion:reduce){.approval.pulse{animation:none;border-color:#e8912a}}
      .soundrow{display:flex;align-items:center;gap:8px;margin-top:10px;font:13px system-ui}
      .soundrow input{width:auto;min-width:22px;min-height:22px}
      .approval button{min-height:44px}
      .escape{margin-top:10px;padding-top:9px;border-top:1px solid #d9c3a0}
      .escape button{width:100%;min-height:48px;background:#7a1f1f;color:white;border:1px solid #5d1414;font-weight:600}
      .approval{position:fixed;bottom:112px;right:12px;width:min(360px,calc(100vw - 24px));background:#fffdf5;color:#17283e;border:2px solid #b8761a;z-index:2147483647;padding:12px;box-sizing:border-box;border-radius:10px;font:13px system-ui;box-shadow:0 4px 24px #0006}
      .approval[hidden]{display:none}
      .approval .target{font-weight:700;word-break:break-word;margin:6px 0}
      .approval .where,.approval .why{color:#4b5a6e;font-size:12px;margin:2px 0;word-break:break-word}
      .mode{font-size:12px;color:#4b5a6e;padding-top:6px}
      .grants{border-top:1px solid #dde3ea;margin-top:9px;padding-top:7px;font-size:12px}
      .grants .muted{color:#4b5a6e;margin:0 0 5px}
      .grant{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:4px 0}
      .grants button{padding:4px 8px;font-size:12px}
    `;
    const root=document.createElement('div');root.innerHTML=`
      <button class="toggle" type="button">Remote AI</button><section class="panel" hidden>
      <b>Safari AI Agent Remote · 0.2.4</b><p>This page can be read by a connected AI. Full permission runs recognised navigation and page interactions automatically; submissions, data changes and unclear actions ask. Payment, account-deletion and credential controls are refused on every site.</p>
      <label>Gateway HTTPS URL</label><input id="gateway" autocomplete="off" placeholder="https://your-domain.example" />
      <label>Device token (never share with an AI)</label><input id="secret" type="password" autocomplete="off" />
      <div class="actions"><button id="save" type="button">Save</button><button id="connect" type="button">Connect</button><button id="stop" type="button">Stop</button><button id="takeover" type="button" hidden>Take over</button></div>
      <div class="mode">Site mode: read-only</div>
      <div class="status" role="status">Disabled on this site</div>
      <label class="soundrow"><input id="sound" type="checkbox" checked> Sound when approval is needed</label>
      <label class="soundrow"><input id="everywhere" type="checkbox" checked> Connect across websites (unlisted sites are read only)</label>
      <div class="grants"></div></section>
      <section class="approval" role="alertdialog" aria-modal="true" aria-label="Browser agent approval" hidden></section>`;
    shadow.append(style,root);document.documentElement.appendChild(host);
    const panel=root.querySelector('.panel');status=root.querySelector('.status');takeover=root.querySelector('#takeover');
    approvalBox=root.querySelector('.approval');grantList=root.querySelector('.grants');modeLine=root.querySelector('.mode');
    renderGrants();
    const soundBox=root.querySelector('#sound');
    const everywhereBox=root.querySelector('#everywhere');
    void GM.getValue(K_EVERYWHERE,true).then(value=>{everywhereBox.checked=value!==false;});
    everywhereBox.addEventListener('change',()=>void GM.setValue(K_EVERYWHERE,everywhereBox.checked));
    // Default ON. An approval nobody notices is the failure this exists to
    // prevent, so the quiet default is the unsafe one.
    void GM.getValue(K_SOUND,true).then(value=>{soundEnabled=value!==false;soundBox.checked=soundEnabled;});
    soundBox.addEventListener('change',()=>{
      soundEnabled=soundBox.checked;
      void GM.setValue(K_SOUND,soundEnabled);
      if(soundEnabled){unlockSound();alertSound();}   // confirm audibly, here and now
    });
    // Web Audio needs a real user gesture before it will ever make sound.
    // Capture-phase on the shadow root catches every tap in the panel - toggle,
    // Save, Connect - so by the time any approval can arrive, audio has been
    // unlocked by the operator's own actions (D-039).
    root.addEventListener('click',unlockSound,true);
    root.querySelector('.toggle').addEventListener('click',()=>{panel.hidden=!panel.hidden;});
    root.querySelector('#save').addEventListener('click',async()=>{
      try{const u=root.querySelector('#gateway').value.trim().replace(/\/$/,'');const t=root.querySelector('#secret').value.trim();
        if(new URL(u).protocol!=='https:'||t.length<24)throw Error('HTTPS URL and long device token required');
        await GM.setValue(K_URL,u);await GM.setValue(K_TOKEN,t);root.querySelector('#secret').value='';
        show('Configuration saved in Userscripts extension storage.');
      }catch(e){show(String(e.message||e));}
    });
    root.querySelector('#connect').addEventListener('click',async()=>{try{await GM.setValue(K_ACTIVE,true);await start()}catch(e){show(String(e.message||e))}});
    root.querySelector('#stop').addEventListener('click',()=>void stop());
    // Takeover is deliberately operator-driven: the gateway will never move a
    // session between tabs on its own, because the moving tab may be one the
    // operator is not looking at.
    takeover.addEventListener('click',async()=>{
      // Saved button approvals survive sessions; current policy still gates use.
      takeoverRequested=true;conflict=null;show('Taking over the device session...');
      if(!running){try{await start()}catch(e){show(String(e.message||e))}}
    });
    void (async()=>{try{
      root.querySelector('#gateway').value=String(await GM.getValue(K_URL,''));
      const active=await GM.getValue(K_ACTIVE,null);
      const siteEnabled=await GM.getValue(K_SITE,false);
      // Legacy per-site opt-ins remain valid until the first new Connect/Stop.
      // An explicit global Stop must outrank every old per-site opt-in.
      if((active===null&&siteEnabled) ||
         (active===true&&(siteEnabled||await GM.getValue(K_EVERYWHERE,true))))await start();
    }catch(e){show(String(e.message||e))}})();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
