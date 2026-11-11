// File: app/browser-host/Sources/BrowserHostModel.swift
// Description: Self-contained macOS/iOS browser agent with direct ChatGPT inference and native approvals.
// Author: Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent-90e45e, 2026-11-11)
// Created: 2026-11-11

import Foundation
import SwiftUI
import WebKit

struct BrowserHostPage: Decodable {
    let schema: String
    let url: String
    let title: String
    let textExcerpt: String
    let elements: [BrowserHostElement]
    let truncated: Bool
}

struct BrowserHostElement: Decodable, Identifiable {
    let ref: String
    let tag: String
    let type: String
    let label: String
    let disabled: Bool
    let href: String?
    var id: String { ref }
}

struct BrowserHostApproval: Identifiable {
    let id: String
    let action: String
    let target: String
    let origin: String
    let tier: String
    let category: String
    let reasons: [String]
    let expiresAtMilliseconds: Double
}

private enum BrowserHostError: LocalizedError {
    case invalidAddress, noPage, engineUnavailable, invalidResponse, inactive
    case invalidArguments, inspectRequired, targetChanged, approvalDenied, invalidDestination, unsupported
    case refused(String)

    var errorDescription: String? {
        switch self {
        case .invalidAddress: "Enter a valid credential-free http:// or https:// website address."
        case .noPage: "Load a page before asking the browser agent to use it."
        case .engineUnavailable: "The isolated browser engine is unavailable. Reinstall the app build."
        case .invalidResponse: "The isolated browser engine returned malformed data."
        case .inactive: "The app or page changed before the operation could finish."
        case .invalidArguments: "The browser tool arguments were malformed or unsupported."
        case .inspectRequired: "Inspect the page before acting on a control."
        case .targetChanged: "The inspected control changed. Inspect the page again before acting."
        case .approvalDenied: "The local approval was denied, dismissed, or expired."
        case .invalidDestination: "Only credential-free same-origin HTTP(S) destinations are supported."
        case .unsupported: "The browser tool is not supported."
        case .refused(let reason): "Refused: \(reason)"
        }
    }
}

@MainActor
final class BrowserHostModel: NSObject, ObservableObject, WKNavigationDelegate {
    @Published var address = "https://example.com"
    @Published var status = "Ready. Sign in with ChatGPT to start a browser-agent session."
    @Published var page: BrowserHostPage?
    @Published var agentPrompt = ""
    @Published var allowPageAccessForCurrentTurn = false
    @Published private(set) var agentTranscript: [String] = []
    @Published private(set) var isLoading = false
    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published private(set) var isEngineAvailable = false
    @Published private(set) var isChatGPTSignedIn = false
    @Published private(set) var isChatGPTSigningIn = false
    @Published private(set) var chatGPTAccountLabel: String?
    @Published private(set) var isAgentRunning = false
    @Published private(set) var availableModels: [AvailableChatGPTModel] = []
    @Published var selectedModel = UserDefaults.standard.string(forKey: "chatGPTSelectedModel") ?? ""
    @Published private(set) var pendingApproval: BrowserHostApproval?

    let webView: WKWebView
    private let agentWorld = WKContentWorld.world(name: "com.searchingfool.SafariAIAgent")
    private let chatGPTAuthentication = ChatGPTSIWC()
    private var sceneIsActive = false
    private var windowIsVisible = false
    private var contentIsObscured = false
    private var inspectedSnapshot: [String: Any]?
    private var approvalContinuation: CheckedContinuation<Bool, Never>?
    private var approvalTimeoutTask: Task<Void, Never>?
    private var agentTask: Task<Void, Never>?

    override init() {
        let contentController = WKUserContentController()
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        do {
            guard let coreURL = Bundle.main.url(forResource: "core", withExtension: "js") else {
                throw CocoaError(.fileNoSuchFile)
            }
            let core = try String(contentsOf: coreURL, encoding: .utf8)
            contentController.addUserScript(WKUserScript(source: core, injectionTime: .atDocumentStart,
                forMainFrameOnly: true, in: agentWorld))
            contentController.addUserScript(WKUserScript(
                source: "globalThis.__safariAIAgentCore = globalThis.SafariAIAgentCore.createAgentCore(document, window);",
                injectionTime: .atDocumentStart, forMainFrameOnly: true, in: agentWorld))
            isEngineAvailable = true
        } catch {
            isEngineAvailable = false
        }
        configuration.userContentController = contentController
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        isChatGPTSignedIn = chatGPTAuthentication.canUseChatGPTPlan
        chatGPTAccountLabel = chatGPTAuthentication.accountLabel
        webView.navigationDelegate = self
        if !isEngineAvailable { status = BrowserHostError.engineUnavailable.localizedDescription }
    }

    private var isHostVisible: Bool { sceneIsActive && windowIsVisible && !contentIsObscured }
    private var currentOrigin: String? { Self.origin(of: webView.url) }

    func loadAddress() {
        do {
            let url = try Self.httpURL(from: address)
            address = url.absoluteString
            page = nil
            status = "Loading \(url.host ?? url.absoluteString)…"
            webView.load(URLRequest(url: url))
        } catch {
            status = "INVALID_ADDRESS: \(error.localizedDescription)"
        }
    }

    func goBack() { if webView.canGoBack { webView.goBack() } }
    func goForward() { if webView.canGoForward { webView.goForward() } }
    func reload() { webView.reload() }

    func inspectPage() {
        Task {
            do {
                let snapshot = try await inspectSnapshot()
                page = try Self.decodePage(snapshot)
                status = "INSPECTED_LOCALLY: \(page?.elements.count ?? 0) controls. This local view is not sent unless you enable page access for an agent request."
            } catch {
                status = "INSPECT_FAILED: \(error.localizedDescription)"
            }
        }
    }

    func clearCurrentSiteData() {
        guard let host = webView.url?.host?.lowercased() else {
            status = "NO_SITE: Load a website before clearing its stored data."
            return
        }
        let store = webView.configuration.websiteDataStore
        Task {
            let types = WKWebsiteDataStore.allWebsiteDataTypes()
            let records = await store.dataRecords(ofTypes: types).filter { record in
                let domain = record.displayName.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
                return domain == host || host.hasSuffix("." + domain)
            }
            await store.removeData(ofTypes: types, for: records)
            page = nil
            status = "SITE_DATA_CLEARED: Removed stored website data for \(host)."
        }
    }

    func setSceneActive(_ active: Bool) {
        sceneIsActive = active
        if !isHostVisible { pauseAgent(reason: "The app is inactive; browser-agent work paused.") }
    }

    func setWindowVisible(_ visible: Bool) {
        windowIsVisible = visible
        if !isHostVisible { pauseAgent(reason: "The browser window is not visible; browser-agent work paused.") }
    }

    func setContentObscured(_ obscured: Bool) {
        contentIsObscured = obscured
        if obscured { pauseAgent(reason: "A local sheet or dialog obscures the browser; browser-agent work paused.") }
    }

    private func pauseAgent(reason: String) {
        resolveApproval(false)
        agentTask?.cancel()
        if isAgentRunning { status = reason }
    }

    func signInToChatGPT() {
        guard !isChatGPTSigningIn else { return }
        isChatGPTSigningIn = true
        Task {
            defer { isChatGPTSigningIn = false }
            do {
                try await chatGPTAuthentication.signIn()
                isChatGPTSignedIn = chatGPTAuthentication.canUseChatGPTPlan
                chatGPTAccountLabel = chatGPTAuthentication.accountLabel
                if await refreshChatGPTModels() {
                    status = "Signed in with ChatGPT. Select an account-visible model to begin."
                }
            } catch {
                status = "CHATGPT_SIGN_IN_FAILED: \(error.localizedDescription)"
            }
        }
    }

    func signOutOfChatGPT() {
        pauseAgent(reason: "Signed out of ChatGPT; current agent work cancelled.")
        Task {
            let revoked = await chatGPTAuthentication.signOut()
            isChatGPTSignedIn = false
            chatGPTAccountLabel = nil
            availableModels = []
            selectedModel = ""
            agentTranscript = []
            status = revoked ? "Signed out. OpenAI revoked the saved refresh token."
                : "Signed out locally. OpenAI token revocation could not be confirmed."
        }
    }

    @discardableResult
    func refreshChatGPTModels() async -> Bool {
        do {
            let models = try await ChatGPTResponsesClient.availableModels(authentication: chatGPTAuthentication)
            availableModels = models
            if !models.contains(where: { $0.slug == selectedModel }) { selectedModel = models.first?.slug ?? "" }
            UserDefaults.standard.set(selectedModel, forKey: "chatGPTSelectedModel")
            return !models.isEmpty
        } catch {
            availableModels = []
            selectedModel = ""
            status = "MODEL_CATALOG_FAILED: \(error.localizedDescription)"
            return false
        }
    }

    func selectChatGPTModel(_ model: String) {
        guard availableModels.contains(where: { $0.slug == model }) else { return }
        selectedModel = model
        UserDefaults.standard.set(model, forKey: "chatGPTSelectedModel")
    }

    func sendAgentPrompt() {
        let prompt = agentPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        let allowPageAccess = allowPageAccessForCurrentTurn
        guard !prompt.isEmpty, isChatGPTSignedIn, !isAgentRunning, isHostVisible,
              availableModels.contains(where: { $0.slug == selectedModel }) else { return }
        agentPrompt = ""
        allowPageAccessForCurrentTurn = false
        agentTranscript.append("You: \(prompt)")
        isAgentRunning = true
        let client = ChatGPTResponsesClient(authentication: chatGPTAuthentication, model: selectedModel)
        agentTask = Task {
            defer {
                isAgentRunning = false
                agentTask = nil
            }
            do {
                let answer = try await client.run(prompt: prompt, pageContext: nil) { [weak self] call in
                    guard let self else { return "The browser host is unavailable." }
                    return await self.performBrowserTool(call, pageAccessAllowed: allowPageAccess)
                }
                try Task.checkCancellation()
                agentTranscript.append("Assistant: \(answer)")
            } catch is CancellationError {
                agentTranscript.append("Assistant: Request cancelled because the browser is no longer active.")
            } catch {
                agentTranscript.append("Assistant: Request failed: \(error.localizedDescription)")
            }
        }
    }

    func resolveApproval(_ approved: Bool) {
        approvalTimeoutTask?.cancel()
        approvalTimeoutTask = nil
        pendingApproval = nil
        approvalContinuation?.resume(returning: approved)
        approvalContinuation = nil
    }

    private func performBrowserTool(_ call: BrowserAgentToolCall, pageAccessAllowed: Bool) async -> String {
        do {
            guard let origin = currentOrigin, isHostVisible else { throw BrowserHostError.inactive }
            switch call.name {
            case "browser_inspect":
                try requirePageAccess(pageAccessAllowed)
                let snapshot = try await inspectSnapshot()
                guard currentOrigin == origin, isHostVisible else { throw BrowserHostError.inactive }
                inspectedSnapshot = snapshot
                return try Self.jsonString(snapshot)
            case "browser_verify":
                try requirePageAccess(pageAccessAllowed)
                guard !call.arguments.isEmpty,
                      Set(call.arguments.keys).isSubset(of: Set(["textIncludes", "urlIncludes"])) else { throw BrowserHostError.invalidArguments }
                let text = try Self.optionalString(call.arguments, key: "textIncludes")
                let url = try Self.optionalString(call.arguments, key: "urlIncludes")
                guard text != nil || url != nil else { throw BrowserHostError.invalidArguments }
                let snapshot = try await inspectSnapshot()
                guard currentOrigin == origin else { throw BrowserHostError.inactive }
                let matches = (text.map { (snapshot["textExcerpt"] as? String ?? "").contains($0) } ?? true) &&
                    (url.map { (snapshot["url"] as? String ?? "").contains($0) } ?? true)
                return try Self.jsonString(["match": matches, "title": snapshot["title"] as? String ?? ""])
            case "browser_fill":
                try requirePageAccess(pageAccessAllowed)
                guard Set(call.arguments.keys) == Set(["ref", "value"]),
                      let ref = call.arguments["ref"] as? String,
                      let value = call.arguments["value"] as? String, value.utf8.count <= 10_000,
                      let previous = inspectedSnapshot, try Self.containsRef(previous, ref: ref) else { throw BrowserHostError.inspectRequired }
                let beforeApproval = try await inspectSnapshot()
                guard currentOrigin == origin, try Self.sameControl(previous, beforeApproval, ref: ref) else { throw BrowserHostError.targetChanged }
                let element = try Self.element(beforeApproval, ref: ref)
                let label = element["label"] as? String ?? "Form field"
                let approved = try await requestApproval(action: "fill field", target: "\(label)\nValue to fill: \(value)",
                    origin: origin, tier: "elevated", category: "field-fill",
                    reasons: ["Every page change requires your one-time approval."])
                guard approved, currentOrigin == origin, isHostVisible else { throw BrowserHostError.approvalDenied }
                let afterApproval = try await inspectSnapshot()
                guard currentOrigin == origin, try Self.sameControl(beforeApproval, afterApproval, ref: ref) else { throw BrowserHostError.targetChanged }
                let result = try await coreCall("return JSON.stringify(core.fill(ref, value));", arguments: ["ref": ref, "value": value])
                return try Self.jsonString(result)
            case "browser_click":
                try requirePageAccess(pageAccessAllowed)
                guard Set(call.arguments.keys) == Set(["ref"]), let ref = call.arguments["ref"] as? String,
                      let previous = inspectedSnapshot, try Self.containsRef(previous, ref: ref) else { throw BrowserHostError.inspectRequired }
                let beforeApproval = try await inspectSnapshot()
                guard currentOrigin == origin, try Self.sameControl(previous, beforeApproval, ref: ref) else { throw BrowserHostError.targetChanged }
                let preview = try await coreCall("return JSON.stringify(core.previewClick(ref));", arguments: ["ref": ref])
                try Self.requireAllowedClick(preview)
                let approved = try await requestApproval(action: "click", target: preview["summary"] as? String ?? "Page control",
                    origin: origin, tier: preview["tier"] as? String ?? "elevated",
                    category: preview["category"] as? String ?? "unclassified-action",
                    reasons: preview["reasons"] as? [String] ?? [])
                guard approved, currentOrigin == origin, isHostVisible else { throw BrowserHostError.approvalDenied }
                let afterApproval = try await inspectSnapshot()
                guard currentOrigin == origin, try Self.sameControl(beforeApproval, afterApproval, ref: ref) else { throw BrowserHostError.targetChanged }
                let latest = try await coreCall("return JSON.stringify(core.previewClick(ref));", arguments: ["ref": ref])
                try Self.requireAllowedClick(latest)
                guard latest["summary"] as? String == preview["summary"] as? String,
                      latest["category"] as? String == preview["category"] as? String,
                      latest["tier"] as? String == preview["tier"] as? String,
                      currentOrigin == origin, isHostVisible else { throw BrowserHostError.targetChanged }
                let result = try await coreCall("return JSON.stringify(core.click(ref, true));", arguments: ["ref": ref])
                return try Self.jsonString(result)
            case "browser_navigate":
                try requirePageAccess(pageAccessAllowed)
                guard Set(call.arguments.keys) == Set(["url"]), let raw = call.arguments["url"] as? String,
                      let destination = URL(string: raw), ["http", "https"].contains(destination.scheme?.lowercased() ?? ""),
                      destination.user == nil, destination.password == nil,
                      Self.origin(of: destination) == origin else { throw BrowserHostError.invalidDestination }
                let approved = try await requestApproval(action: "navigate to", target: destination.absoluteString,
                    origin: origin, tier: "elevated", category: "same-origin-navigation",
                    reasons: ["Navigation changes the current page and requires your one-time approval."])
                guard approved, currentOrigin == origin, isHostVisible else { throw BrowserHostError.approvalDenied }
                webView.load(URLRequest(url: destination))
                return "Navigation started to \(destination.absoluteString)."
            default:
                throw BrowserHostError.unsupported
            }
        } catch {
            return "Tool refused or failed: \(error.localizedDescription)"
        }
    }

    private func requirePageAccess(_ allowed: Bool) throws {
        guard allowed else { throw BrowserHostError.refused("Enable page access for this request before letting the agent inspect page content.") }
    }

    private func inspectSnapshot() async throws -> [String: Any] {
        guard isEngineAvailable else { throw BrowserHostError.engineUnavailable }
        guard currentOrigin != nil, webView.url != nil else { throw BrowserHostError.noPage }
        let snapshot = try await coreCall("return JSON.stringify(core.inspect({mode: 'read-only'}));", arguments: [:])
        return snapshot
    }

    private func coreCall(_ script: String, arguments: [String: Any]) async throws -> [String: Any] {
        let value = try await webView.callAsyncJavaScript(
            "const core = globalThis.__safariAIAgentCore; if (!core) throw new Error('Bundled page engine is unavailable.');\n\(script)",
            arguments: arguments, in: nil, contentWorld: agentWorld)
        guard let json = value as? String, let data = json.data(using: .utf8),
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw BrowserHostError.invalidResponse
        }
        return object
    }

    private func requestApproval(action: String, target: String, origin: String, tier: String,
                                 category: String, reasons: [String]) async throws -> Bool {
        guard isHostVisible, currentOrigin == origin, approvalContinuation == nil else { throw BrowserHostError.inactive }
        let expires = Date().addingTimeInterval(120).timeIntervalSince1970 * 1_000
        let id = UUID().uuidString
        return await withCheckedContinuation { continuation in
            approvalContinuation = continuation
            pendingApproval = BrowserHostApproval(id: id, action: action, target: target,
                origin: origin, tier: tier, category: category, reasons: reasons,
                expiresAtMilliseconds: expires)
            approvalTimeoutTask = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(120)) } catch { return }
                self?.resolveApproval(false)
            }
        }
    }

    private static func requireAllowedClick(_ preview: [String: Any]) throws {
        guard preview["tier"] as? String != "blocked",
              (preview["control"] as? [String: Any])?["external"] as? Bool != true else {
            throw BrowserHostError.refused("This control is blocked or would leave the current origin.")
        }
    }

    private static func httpURL(from text: String) throws -> URL {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidate = trimmed.contains("://") ? trimmed : "https://" + trimmed
        guard !trimmed.isEmpty, let url = URL(string: candidate),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.host != nil,
              url.user == nil, url.password == nil else { throw BrowserHostError.invalidAddress }
        return url
    }

    private static func origin(of url: URL?) -> String? {
        guard let url, let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased(),
              ["http", "https"].contains(scheme) else { return nil }
        let port = url.port.map { ":\($0)" } ?? ""
        return "\(scheme)://\(host)\(port)"
    }

    private static func decodePage(_ snapshot: [String: Any]) throws -> BrowserHostPage {
        let data = try JSONSerialization.data(withJSONObject: snapshot)
        return try JSONDecoder().decode(BrowserHostPage.self, from: data)
    }

    private static func jsonString(_ object: Any) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.fragmentsAllowed, .sortedKeys])
        return String(decoding: data, as: UTF8.self)
    }

    private static func optionalString(_ arguments: [String: Any], key: String) throws -> String? {
        guard let value = arguments[key] else { return nil }
        guard let string = value as? String, !string.isEmpty, string.count <= 2_000 else { throw BrowserHostError.invalidArguments }
        return string
    }

    private static func containsRef(_ snapshot: [String: Any], ref: String) throws -> Bool {
        let elements = snapshot["elements"] as? [[String: Any]] ?? []
        return elements.contains { $0["ref"] as? String == ref }
    }

    private static func element(_ snapshot: [String: Any], ref: String) throws -> [String: Any] {
        guard let item = (snapshot["elements"] as? [[String: Any]])?.first(where: { $0["ref"] as? String == ref }) else {
            throw BrowserHostError.inspectRequired
        }
        return item
    }

    private static func sameControl(_ before: [String: Any], _ after: [String: Any], ref: String) throws -> Bool {
        let first = try element(before, ref: ref)
        let second = try element(after, ref: ref)
        return ["tag", "type", "label", "disabled", "href"].allSatisfy {
            String(describing: first[$0] ?? NSNull()) == String(describing: second[$0] ?? NSNull())
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        page = nil
        inspectedSnapshot = nil
        resolveApproval(false)
        refreshNavigationState()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        if let url = webView.url { address = url.absoluteString }
        status = "Loaded. Inspect locally or enable per-request page access to ask the agent."
        refreshNavigationState()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        navigationFailed(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        navigationFailed(error)
    }

    private func navigationFailed(_ error: Error) {
        isLoading = false
        status = "NAVIGATION_FAILED: \(error.localizedDescription)"
        refreshNavigationState()
    }

    private func refreshNavigationState() {
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
    }
}
