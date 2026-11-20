# Graph Report - /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent  (2026-11-19)

## Corpus Check
- 42 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 441 nodes · 710 edges · 32 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `BrowserHostModel` - 38 edges
2. `ChatGPTSIWC` - 21 edges
3. `BrowserHostError` - 14 edges
4. `ChatGPTAuthError` - 14 edges
5. `response()` - 13 edges
6. `Code` - 11 edges
7. `pump()` - 11 edges
8. `pump()` - 11 edges
9. `pump()` - 11 edges
10. `BrowserModel` - 10 edges

## Surprising Connections (you probably didn't know these)
- `ModelCatalog` --inherits--> `Decodable`  [EXTRACTED]
  /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/app/browser-host/Sources/ChatGPTResponses.swift →   _Bridges community 4 → community 8_
- `ChatMessage` --inherits--> `Identifiable`  [EXTRACTED]
  /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/app/llm-chat-spike/Sources/LLMChatCore/ChatMessage.swift →   _Bridges community 4 → community 2_
- `BrowserHostError` --inherits--> `LocalizedError`  [EXTRACTED]
  /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/app/browser-host/Sources/BrowserHostModel.swift →   _Bridges community 13 → community 8_
- `BrowserHostError` --case_of--> `refused`  [EXTRACTED]
  /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/app/browser-host/Sources/BrowserHostModel.swift → /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/app/browser-host/Sources/BrowserHostModel.swift  _Bridges community 13 → community 0_
- `ChatGPTAuthError` --inherits--> `LocalizedError`  [EXTRACTED]
  /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/app/browser-host/Sources/ChatGPTSIWC.swift →   _Bridges community 8 → community 1_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (3): refused, BrowserHostModel, WKNavigationDelegate

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (15): ChatGPTAuthError, accountChanged, callback, clientRegistration, denied, discovery, http, invalidToken (+7 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (28): CodingKeys, displayName, slug, visibility, ChatGPTCredential, AnthropicModel, ChatMessage, ChatReply (+20 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (30): addGrant(), alertAttention(), alertSound(), applyPolicy(), clickInThisTab(), el(), execute(), hasGrant() (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (21): AnthropicClient, Block, Inner, Usage, WireError, WireMessage, WireRequest, WireResponse (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (28): addGrant(), alertAttention(), alertSound(), applyPolicy(), clickInThisTab(), el(), execute(), hasGrant() (+20 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (12): BrowserHostInputField, browserAddress, BrowserHostView, BrowserWebView, BrowserWindowVisibilityProbe, VisibilityProbeView, ChatView, Hashable (+4 more)

### Community 7 - "Community 7"
Cohesion: 0.19
Nodes (24): beat(), boot(), callContent(), checkTab(), clearSession(), ensureInjected(), executeAgentTask(), getActiveTabId() (+16 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (12): AvailableChatGPTModel, BrowserAgentToolCall, ChatGPTResponsesClient, ChatGPTResponsesError, http, malformedTool, stream, tooManyToolRounds (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (16): CallFlag, client(), concatenatesTextBlocks(), emptyContent(), emptyHistoryRejected(), malformedBody(), missingKeyShortCircuits(), providerFault() (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (2): ObservableObject, BrowserModel

### Community 11 - "Community 11"
Cohesion: 0.28
Nodes (9): act(), message(), refresh(), render(), renderSafety(), renderSites(), request(), LLMChatSpikeApp (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (7): Delegate, NSApplicationDelegate, NSObject, init(), relaunchInsideBundleIfNeeded(), SpikeAppDelegate, WKWebExtensionControllerDelegate

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (12): BrowserHostError, approvalDenied, engineUnavailable, inactive, inspectRequired, invalidAddress, invalidArguments, invalidDestination (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.27
Nodes (9): call(), call_through_browser(), free_port(), parse(), post(), QuietHandler, Real Chromium DOM + mocked Userscripts GM extension + real HTTP MCP gateway.  Th, Keep the Playwright event loop responsive while the MCP request waits.      A br (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (5): approvalSheet(), askApproval(), execute(), teardown(), teardownSheet()

### Community 16 - "Community 16"
Cohesion: 0.38
Nodes (3): executeClick(), executeFill(), isSensitive()

### Community 17 - "Community 17"
Cohesion: 0.43
Nodes (5): createAgentCore(), mountPanel(), normalizeMode(), normalizePolicy(), start()

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (1): ChatGPTSIWCTests

### Community 19 - "Community 19"
Cohesion: 0.53
Nodes (4): applyMode(), report(), startTimer(), stopTimer()

### Community 20 - "Community 20"
Cohesion: 0.47
Nodes (2): renderStatus(), show()

### Community 21 - "Community 21"
Cohesion: 0.4
Nodes (3): main(), port(), Integration test: real Node HTTP MCP gateway -> GM transport shim -> real Chromi

### Community 22 - "Community 22"
Cohesion: 0.4
Nodes (2): SafariAIAgentHostUITests, XCTestCase

### Community 23 - "Community 23"
Cohesion: 0.4
Nodes (1): ChatViewModel

### Community 24 - "Community 24"
Cohesion: 0.5
Nodes (2): normalizeMode(), normalizePolicy()

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (3): main(), probe(), Rendered-geometry checks for the approval dialog (D-036, D-038).  The other brow

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (1): Run with: python tests/browser_e2e.py Integration smoke tests using Chromium. Th

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (1): Offline Chromium smoke test for the remote Userscripts bridge.  MCP gateway is t

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **42 isolated node(s):** `invalidAddress`, `noPage`, `engineUnavailable`, `invalidResponse`, `inactive` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 28`** (2 nodes): `bootstrap.js`, `start()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `panel.js`, `mountPanel()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `Package.swift`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `wake-content.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BrowserHostModel` connect `Community 0` to `Community 10`, `Community 4`, `Community 12`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `ChatGPTSIWC` connect `Community 1` to `Community 10`, `Community 4`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `ChatGPTAuthError` connect `Community 1` to `Community 8`, `Community 2`, `Community 4`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `invalidAddress`, `noPage`, `engineUnavailable` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._