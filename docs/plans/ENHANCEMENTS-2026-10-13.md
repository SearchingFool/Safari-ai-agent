# Safari AI Agent — enhancement work packages

Status: **Draft for owner approval.** Created 2026-10-13 by codex-01.
Peer acknowledgment: pending from claude-04. Proposed ownership is not a claim that the peer has accepted or started work.

## Goal and current baseline

Make the iPad connector easier to use and give the model better page evidence without losing the distinction between reading, routine interaction and consequential actions. Published baseline: remote script 0.2.4, category-based full permission, persistent per-button approvals, gateway controls, and 81 Node tests plus five browser suites passing. New permission behavior still needs physical iPad acceptance.

This document separates concrete connector proposals from feasibility work. The companion [discovery plan](enhancement-discovery-2026-10-13.yaml) contains exact evidence/validation commands; it does not execute an unverified integration or stand in for the implementation plan produced after a feasibility result. Repository-relative paths are intentional because this public repo forbids operator home paths and deployment addresses.

## Proposed division and order

| Package | Proposed owner | Deliverable | Dependency / stage |
|---|---|---|---|
| P0 — iPad acceptance | Claude lead; Codex fixes its code; owner operates device | Evidence for 0.2.4, remaining device cases and ten-run reliability | First priority; can run alongside design/research |
| P1 — richer page/source inspection | Codex | Rendered markup and bounded CSS/JS source tools | Contract first; implementation after approval and P0 permission smoke |
| P2 — page find, scrolling and website search | Codex | Find matches beyond the current excerpt; controlled scrolling; reliable search-form workflow | Sequential with P1 on shared integration files |
| P3 — visible action feedback | Codex | Optional highlight and action/status overlay in Safari | Use P1/P2 references; sequential shared-file integration |
| P4 — true screenshots | Claude | Verified iPad capture feasibility and provider image-delivery proposal | Research parallel with P1/P2; separate approval before implementation |
| P5 — local files | Claude | Separate plans for local HTML, Mac files and documents | Needs owner clarification; research can proceed independently |
| P6 — ChatGPT and Gemini | Claude | One account-specific eligibility/authentication plan per provider | Existing paid subscriptions; account checks before implementation |
| P7 — background operation | Claude | Evidence-based options for reducing the Split View requirement | Research only; current foreground requirement remains |
| INT — shared integration | Codex implements; Claude reviews/integrates | Tool routing, policy, builds, full gates and handoff | Serialize after each approved feature module |

These are proposed assignments under the owner's instruction to divide work. Claude remains collaborative lead and confirms scheduling, decision numbers and ownership. Neither agent silently starts an unapproved feature or edits the other's files.

## P0 — physical iPad acceptance

**Outcome:** confirm the published change actually works on the iPad before relying on more tools.

Claude maintains `docs/IPAD-DEVICE-RUN-SHEET.md` and a new `docs/plans/ipad-acceptance-results.md`; Codex fixes confirmed defects in its implementation. The owner installs 0.2.4 and operates the physical device. Run navigation under full permission without local prompts; denial and approval under Ask; actual submit confirmation; saved approval across reload/reconnect, different-button isolation and revocation. Check Stop with a queued command, recovery and ten repetitions of a representative workflow. Record observed failures and timings, including canceled/uncertain outcomes. A repeated denial must not be relabeled as a timeout or vice versa.

**Acceptance:** device evidence for each case; owner decides whether D2-01 is accepted. Test success alone does not close that gate. Claude performs an independent review of the approval/classification and persistent-grant changes. No gateway restart during a device run without coordinating with the owner.

## P1 — rendered HTML and CSS/JavaScript inspection

**Outcome:** let the model ask for structural or source evidence when the bounded text snapshot is insufficient.

Proposed new feature module: `src/page-markup.js`; tests: `tests/page-markup.test.cjs` and `tests/page-markup-browser.py`. Proposed tools: `browser_read_markup` for a selected subtree or bounded page segments, and `browser_resource_source` for a referenced stylesheet/script. Return source kind, URL/reference, capture time, size, truncation and continuation information. Distinguish current rendered markup from response source and refetched resources from bytes proven to have executed. Do not call a recreated image an actual screenshot.

Rendered markup removes protected field values, hidden/one-time-code/password/payment values, event-handler attributes and embedded script bodies by default. CSS/JS retrieval is an explicit source request bound to resources referenced by the paired page; preserve browser origin/CORS limits and return a clear unsupported result where necessary. No arbitrary gateway-side URL fetcher. Resource source may contain application data or credentials; the contract must state the disclosure limits and avoid claiming perfect redaction. No field values are made available merely because source inspection is enabled.

**Acceptance:** useful markup/CSS/JS on a harmless fixture; correct pagination/truncation; protected-value fixtures absent from rendered markup; unreferenced/resource-origin requests cannot turn the gateway into a general network proxy. Full gates and a real iPad read-only test. An implementation contract specifying arguments, limits and exclusions comes before coding.

## P2 — page find, scrolling and site search

**Outcome:** search beyond the existing bounded text excerpt and navigate long pages deliberately.

Proposed module: `src/page-search.js`; tests: `tests/page-search.test.cjs` and `tests/page-search-browser.py`. Proposed `browser_find` returns bounded matches, short context and stable match/control references from visible page text. It does not read excluded field values. Proposed `browser_scroll` moves the viewport by a bounded amount and returns the resulting position/state. Scrolling follows the approved page-interaction policy; finding text is a read operation. Handle stale matches after navigation or page changes. Website search remains a fill/click/verify workflow using the website's own form, with the button classified by its effect. A generic internet search engine or crawler is outside this package.

**Acceptance:** a match beyond the first 2,000 characters is found; no-match/multiple-match cases are clear; large pages are bounded; scrolling behaves correctly under Read only/Ask/Full permission; a site search returns verified results without silently submitting an unrelated form. Full gates plus iPad checks on a long page and a harmless search form.

## P3 — visible action feedback

**Outcome:** make the existing headed Safari operation easier to follow.

Proposed module: `src/action-feedback.js`; test: `tests/action-feedback-browser.py`. Add an optional overlay for inspecting, finding, filling, clicking, navigating, waiting for approval and verifying. Outline the target before a permitted action; show the action category and result; clear stale outlines after navigation. Keep feedback inside the isolated agent UI and never let an outline authorize an action. Use existing approvals and Stop rather than introducing a second permission system. A screenshot or screen recording is outside this package.

**Acceptance:** the owner can follow a sequence visually; highlights correspond to current references; the overlay does not cover page controls/approval/Stop, intercept page clicks or expose credentials; reduced motion and narrow Split View work. Full gates and a headed iPad walkthrough.

## P4 — actual page screenshots

**First deliverable:** `docs/plans/screenshot-feasibility.md`, owned by Claude. Verify installed Userscripts capabilities, Safari/iPad capture options and whether a native extension is required. Test an innocuous page on the physical iPad. Separately test whether each provider's actual native app can receive MCP image content. Treat capture and delivery as independent gates. Manual screenshot attachment is an interim workflow; DOM rasterization is an approximation and must be labeled as such.

**Acceptance for research:** primary-source evidence and device results; actual versus approximate capture clearly identified; viewport/full-page scope, sensitive pixels, permissions and installation requirements documented. Produce a priced/permission-scoped implementation proposal, including a bounded `browser_screenshot` contract if feasible. No new capture implementation, developer enrollment or purchases until owner approval.

## P5 — local HTML/files/documents

**First deliverable:** `docs/plans/local-files-feasibility.md`, owned by Claude. Resolve whether the owner means iPad HTML files, Mac HTML files or PDFs/documents. Check the actual iPad opening/injection path for direct files; separately test local pages served over HTTP. On iPad, localhost means the iPad, not the Mac. Compare direct file access, a user-selected bounded folder served from the Mac, and a user-selected document import. Do not make `origin: null` a global trust identity or expose the entire filesystem.

**Acceptance for research:** one demonstrated path per supported type and explicit limits for unsupported types; chosen-folder scope, path traversal protection, authentication and iPad reachability specified. New endpoints or local serving need a separate approved proposal. No filesystem-serving implementation starts from this draft.

## P6 — paid ChatGPT and Gemini accounts on iPad

**First deliverables:** `docs/plans/chatgpt-ipad-feasibility.md` and `docs/plans/gemini-ipad-feasibility.md`, owned by Claude. Use [existing provider research](../PROVIDER-IPAD-RESEARCH.md) as the starting point and recheck current official documentation. Inspect the owner's actual account settings with them. Record native-app versus Safari availability and exact supported authentication. Subscription entitlement is separate from API billing. Account/region eligibility is a gate, particularly for Gemini; do not bypass restrictions or remove gateway authentication.

**Acceptance for research:** one eligible/blocked result per provider; tested or explicitly unverified discovery/transport/authentication; a separate minimal adapter proposal if needed. After a later implementation approval, prove tools/list, browser_status, inspect, harmless action, denial and Stop on the native iPad app, not merely the provider web UI. OAuth, if needed, is a shared adapter contract integrated by Codex after approval; Claude does not concurrently edit gateway/server.mjs.

## P7 — operation without simultaneous foreground apps

**First deliverable:** `docs/plans/background-options.md`, owned by Claude. Reconcile `docs/SERVICE-WORKER-LIFETIME.md`, `docs/DECISIONS.md` and device behavior. Separate foreground DOM access from gateway uptime and extension-worker lifetime. Compare staying in Safari with the AI UI, user-triggered Shortcuts/native workflows, a native capture/executor path and a Mac-hosted browser. Make clear when an option changes which browser/device the model controls.

**Acceptance for research:** a capability/limit/cost table backed by primary sources and reproducible probes, with platform claims clearly distinguished from inference. Native packaging alone is not evidence of background DOM execution. Propose one bounded experiment for approval. No background bypass or new browser product is implemented from this draft.

## INT — ownership, contracts and verification

Only Codex edits shared implementation files: `src/core.js`, `src/remote.js`, `gateway/server.mjs`, `gateway/control.mjs`, `gateway/control-ui/`, `tools/build*.mjs`, `package.json`, generated userscripts, existing gateway/browser tests and canonical README/tracker updates. P1–P3 own their separate new feature/test modules. They integrate sequentially through INT; no overlapping writes by two agents. Claude owns the new research/result reports listed above, its mailbox and existing lead-owned decisions/run sheet. Registry reconciliation is Claude's responsibility. Every writer reserves its exact files with queuectl; generated artifacts follow the source owner's reservation.

Each new tool needs an agreed schema, reference/origin binding, bounds, policy disposition, failure/cancellation semantics and provider payload type before implementation. Each approved implementation adds new syntax targets, runs `npm run check`, `npm run test:browser` and `npm run diagnose`, performs its device checks, updates its tracker evidence and makes path-form commits pushed incrementally to main. Public reports contain no credentials, deployment addresses, process IDs or operator home paths.

## Approval choices

Recommended first wave: **P0 acceptance + P1/P2 contracts and implementation proposals**, while Claude researches **P4 screenshots and P6 provider eligibility**. P3 feedback follows the reference contracts; P5 needs the file-type answer; P7 remains a parallel research option. The owner can approve individual packages, their research stage only, or revise this order. This draft does not approve new implementations. Peer review and acknowledgment are pending; delivery through a mailbox is not evidence it has been read.
