# Safari AI Agent — Product requirements and MVP contract

Status: **Proposed canonical baseline for review**  
Version: 0.1 | Updated: 2026-10-09  
Project: https://github.com/SearchingFool/Safari-ai-agent

## 1. Objective

Enable a user on iPad to give a natural-language task to an AI assistant that can **actually operate ordinary webpages in Safari**: observe the current page, search, navigate, identify elements, fill and edit form fields, activate links and buttons, verify outcomes, and continue through a multi-step workflow.

This is **not** a webpage summarizer, an AI chat pane, or a copy/paste bridge. The existing Userscripts "Browser Lab" is only an initial manually operated browser-interaction prototype; it is **not** the end-to-end AI MVP.

## 2. Constraints and principles

1. **iPad-first; Safari-first.** The user's iPad runs Userscripts today. No paid Apple Developer Program membership is assumed for MVP.
2. **No on-iPad LLM requirement.** Use an existing AI provider through a **supported integration**. Running a separate Mac controller must not be mandatory.
3. **Use existing subscriptions where provider terms and product APIs allow.** Eligibility, availability, account restrictions, mobile compatibility, quotas and billing **must be demonstrated**, not assumed. Installed ChatGPT, Claude and Gemini apps do not automatically expose their model APIs.
4. **MCP is a first-class target for browser tools**, not a claim that the current Userscripts prototype already speaks MCP. The supported AI client's ability to call an MCP service must be established before committing to a provider.
5. **Provider independence.** Browser capabilities are versioned separately from the selected AI/model client. Additional adapters may be additive.
6. **Browser execution is limited by iPadOS/Safari.** A foreground webpage/userscript cannot be assumed to receive background commands continuously, and cannot freely control Safari tabs or other apps.
7. **No unconstrained model execution.** Webpage text and model instructions are untrusted. The browser action executor accepts only validated commands. Do not execute arbitrary model-generated JavaScript.
8. **Basic safety for MVP; governance harness later.** Minimum authentication, origin scoping, action allowlist and human confirmation at consequential boundaries are necessary before remote AI execution. The general-purpose configurable policy/lease/audit governance harness is explicitly **post-MVP**.

## 3. Users and first workflow

**Primary user:** one owner/tester using Safari on an iPad, with Userscripts already installed and enabled.

**Primary task:** from an eligible AI client, say something equivalent to:

> On the currently open test website, inspect the page, find a product, follow the result, fill a harmless form with the details I provide, and stop before submitting.

The AI must operate the browser through structured tools and show the user the verified result. It must not depend on copying snapshots between applications by hand.

## 4. Functional requirements

| ID | Priority | Requirement | MVP acceptance evidence |
|---|---|---|---|
| FR-01 | Must | Read URL/title, bounded rendered text and visible interactive elements in the permitted tab | Snapshot shows actionable elements and does not disclose password values |
| FR-02 | Must | Identify an element using a scoped temporary reference; reject stale, missing, hidden or disabled targets | DOM-change negative test |
| FR-03 | Must | Fill ordinary text inputs, textareas, selects and time fields; respect native constraints | iPad form tests including invalid time |
| FR-04 | Must | Activate ordinary links/buttons and navigate HTTP(S) pages within allowed sites | Verified click/navigate result |
| FR-05 | Must | Handle at least one multi-page task with state retained/recovered on navigation | Test completes across page loads; no silent repeat of a submission |
| FR-06 | Must | Model receives observation, proposes a **structured** action, tool executes, returns outcome; model may iterate | Real end-to-end test without copying/pasting tool instructions |
| FR-07 | Must | Supported AI client reaches browser tools via a versioned contract. MCP is the default integration target. | Verified tool list, command invocation and response from actual client |
| FR-08 | Must | Controlled communication to/from the iPad without a compulsory Mac server | Authorized, scoped command and response on real iPad |
| FR-09 | Must | Human approval for cross-site access and submission or potentially consequential actions; no remote action on unauthorized site | Denied approval prevents action |
| FR-10 | Must | Allow cancel/stop; report failure and request a fresh observation when target changes | Cancellation and stale-reference tests |
| FR-11 | Must | No passwords/file inputs copied or filled; no implicit extraction of credentials/tokens; no provider keys in webpage scripts | Automated checks and security tests |
| FR-12 | Must | User-visible state, last action/result and intelligible errors | Device walkthrough and test evidence |
| FR-13 | Should | Basic session recovery when Safari suspends/resumes; report uncertainty rather than repeat unsafe action | Restart/resume scenario |
| FR-14 | Later | More than one supported AI provider and alternative adapters | Separate provider integration tests |
| FR-15 | Later | Cross-tab management, native WebExtension packaging, richer controls, multi-user and enterprise policies | Later release |

A capability may remain unavailable on a particular website if the site requires trusted physical input, CAPTCHA, canvas-only controls, closed shadow roots or inaccessible cross-origin frames. Those exceptions must be reported clearly rather than represented as successful actions.

## 5. Target integration architecture (hypothesis to validate)

```text
User task in supported AI client (ChatGPT / Claude / Gemini as eligible)
            |
            | Provider-supported MCP client/tools or authorized adapter
            v
     Authenticated MCP gateway
    (browser tools; session and task routing)
            |
            | Secure, scoped outbound HTTPS communication
            | iPad cannot be assumed to accept inbound connections
            v
  Userscripts adapter in foreground Safari tab
            |
            v
    Shared DOM action engine -> current webpage
            |
            +--- verified result ---> gateway ---> AI client
```

**MCP's role:** A transport/tool interface for exposing browser actions to an LLM-capable client; **not** the browser engine itself or a guarantee that installed AI iPad apps can invoke custom tools. An iPad userscript is not automatically an MCP server. Whether the gateway is locally hosted, remotely hosted, or replaceable by a supported direct integration is an implementation decision subject to a feasibility gate.

**Initial candidate:** a provider-supported remote MCP client/connector, verified against the user's *actual iPad account*. Claude is worth testing first because we discussed its remote MCP integration, but compatibility and subscription coverage are **unverified for this project**. ChatGPT and Gemini require their own verification. We will not silently substitute paid API usage for an existing subscription.

**Minimum remote-execution controls:** authenticated pairing/session, HTTPS, origin allowlist, action schema allowlist, expiry/replay rejection, approvals tied to the specific action. These are MVP safety boundaries, **not** the proposed future flexible agent-governance harness.

## 6. Explicit non-goals for the end-to-end MVP

- An on-device LLM, mandatory Mac companion, or a full native iPad browser.
- General autonomous access to the device filesystem, other apps or arbitrary Safari tabs.
- Bypassing logins, CAPTCHA or websites' trusted-input restrictions.
- Direct integration with all three providers at once; **one verified provider is sufficient for MVP**.
- Background unattended execution when the browser is suspended.
- A configurable multi-tenant governance system with policy language, capability leases and full audit infrastructure. This is **a follow-on milestone**, as agreed.
- A copy/paste manual bridge as the end-state. Such a bridge can be a diagnostic fixture only and does not meet FR-06 or FR-07.

## 7. MVP release acceptance: all must pass

1. **Actual iPad:** Userscripts detects permitted page and can read, fill, click and navigate with observable results.
2. **Actual provider/account:** AI client can discover/invoke the declared browser tools through an authorized supported mechanism. Record exact eligibility and billing conditions.
3. **End-to-end, no manual relay:** One natural-language request initiates a test-site workflow comprising observe, form fill, click/navigation, observe again and verified completion.
4. **Cross-page continuity:** On at least one page load, task remains associated with the correct session, or resumes through an explicit user-restart flow without unsafe duplicate execution.
5. **Authorization:** Unapproved cross-site operations and form submissions are denied; expiry and stale references fail closed.
6. **Regression:** Build, syntax, integration, security-negative and iPad manual tests pass; results and known limitations are captured in the repository.
7. **No surprise costs:** If using subscriptions, confirm product eligibility/limits; if additional paid hosting/API access would be required, it must be separately approved before deployment.

Suggested reliability measurement: ten repetitions of the harmless end-to-end scenario, recording individual passes/failures and observed recovery. A release threshold will be agreed from these results rather than guessed.

## 8. Open feasibility questions (blocking)

- Which existing AI subscription and iPad application exposes **supported custom browser-tool/MCP calls** with the user's account and geography?
- Can the selected client reach an authenticated gateway, and what hosting/network cost and privacy model is needed?
- Can a foreground Userscripts page use the proposed secure outbound transport across navigation and Safari suspension? What does the user do to resume?
- What are the precise site permissions and UI affordances for the initial iPad implementation?

Do not answer these with speculative claims. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the short compatibility spike and required evidence. See [DECISIONS.md](DECISIONS.md) for decisions and change control.
