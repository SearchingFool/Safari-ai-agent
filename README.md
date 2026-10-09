# Safari AI Agent

A browser-action prototype for **iPad Safari via Userscripts**. The first milestone is deliberately **local and manual**: it does not require an Apple Developer Program membership, an LLM, API credentials, a Mac-hosted server, or a cloud account.

## What works in 0.1.1

- Inspect the visible page and enumerate links, buttons, form controls and accessible labels.
- Show temporary element references (`e1`, `e2`, …) and a bounded page-text excerpt.
- Highlight a referenced element.
- Fill ordinary text inputs, time inputs, textareas, contenteditable regions and `<select>` controls. Browser min/max/step constraints are enforced for time fields.
- Click links and click controls; request an explicit confirmation before forms or potentially consequential actions.
- Navigate to HTTP(S) URLs, confirming cross-site navigation.
- View and optionally copy the *local* snapshot. **Nothing is sent to an AI service.**

**Not yet implemented:** autonomous AI, workflows across navigation, cross-tab control, external command transport, model integrations, durable action logs, full Safari WebExtension packaging. Never use this early prototype on sensitive production workflows.

## Install on an iPad (no developer membership)

1. Install and enable the free [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) app and its Safari extension.
2. **Easiest:** Open the [raw `.user.js` file](https://raw.githubusercontent.com/SearchingFool/Safari-ai-agent/main/scripts/safari-ai-agent.user.js) in **Safari**. Open the **Userscripts** extension popup; accept its install prompt. If Safari instead downloads the file, use step 3.
3. **Alternative:** In the **Files** app, save [`safari-ai-agent.user.js`](scripts/safari-ai-agent.user.js) into the scripts directory selected in the Userscripts app. The script must retain its `.user.js` extension.
4. Enable **Safari AI Agent Lab** in the Userscripts popup. Allow Userscripts access to your chosen test website in Safari's extension website permissions.
5. Visit [httpbin test form](https://httpbin.org/forms/post) or another nonsensitive HTML page, refresh if necessary, and tap the floating **Browser Lab** button near the bottom-right.
6. On HTTPBin, **Preferred delivery time** must use 24-hour `HH:mm` notation, be between `11:00` and `21:00`, and use 15-minute increments, e.g. `14:30`. If an invalid value is entered, the extension now reports why and preserves the previous time.
7. Tap **Inspect page**. The output contains references like `e3` for visible controls. Enter a reference in **Element reference**, text in **Text or select-option value**, and tap **Fill**, **Highlight**, or **Click**.
8. For **Navigate**, enter a full HTTPS URL and tap **Navigate**. The panel should reappear on the next website if Userscripts has permission there.

**Security:** Keep Userscripts website permissions limited to sites you choose while testing. Snapshot text may contain personal or confidential page information; do not copy it into untrusted apps. Confirmation dialogs do not make every action reversible, and site-defined JavaScript can behave unpredictably. Password fields and file inputs are deliberately excluded from automation.

## Local development

Requirements: Node.js 20+ (no npm packages required).

```bash
npm run build    # generate installable scripts/safari-ai-agent.user.js
npm run check    # metadata, offline security, syntax tests
```

For browser integration smoke testing, with Python Playwright and Chromium installed:

```bash
python tests/browser_e2e.py
```

The Chromium smoke test checks the generated userscript against a local, harmless form. It is **not** a substitute for testing the actual iPad Safari/Userscripts combination.

## Source layout

- `src/core.js`: reusable inspect / reference / fill / click / navigate engine.
- `src/panel.js`: manual test UI using Shadow DOM to isolate styling.
- `src/bootstrap.js`: inject the panel into the top-level page.
- `tools/build.mjs`: produces a self-contained userscript without runtime dependencies.
- `scripts/safari-ai-agent.user.js`: **the file to install**; generated but committed for direct installation.
- `tests/fixtures/`: harmless example website; `tests/browser_e2e.py`: integration smoke test.
- `docs/TRACKER.md`: feature milestones, dependencies and limitations.

## Architecture direction

The browser action engine must remain independent from model providers. A future WebExtension adapter will reuse it with per-site permissions, persistent/resumable task state and a tool contract; independent, audited agent policy will authorize model-proposed actions. We will evaluate ChatGPT, Claude and Gemini subscription-based integration individually, rather than assuming that installing those apps on iPad gives another app direct API access.

## Limitations

Page-provided interaction elements may be inside cross-origin iframes, closed shadow roots or canvas UIs. Some sites require trusted user input and will reject synthetic clicks. Changes to the page invalidate element references; use Inspect again. The prototype does not control other apps, browser tabs, downloads, login UI, or Safari itself. Running it on a new site always depends on Safari's permission settings.
