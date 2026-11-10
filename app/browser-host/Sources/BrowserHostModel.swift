// File: app/browser-host/Sources/BrowserHostModel.swift
// Description: Shared macOS/iOS WKWebView host with validated HTTP(S) navigation, isolated-world
//              inspection, active-only authenticated gateway polling, and scoped data clearing.
// Author: Libor Ballaty, with Codex (swift-alternate seat, 2026-11-09)
// Created: 2026-11-09

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

private struct DeferredBrowserAction {
    enum Kind {
        case click(ref: String, summary: String, category: String, tier: String)
        case navigate(URL)
    }

    let origin: String
    let kind: Kind
    let policy: [String: Any]
    let expiresAtMilliseconds: Double
}

private enum CommandError: LocalizedError {
    case invalidArguments, inspectRequired, targetChanged, approvalDenied, inactive
    case invalidDestination, unsupported
    case refused(String)

    var errorDescription: String? {
        switch self {
        case .invalidArguments: "Command arguments are missing, malformed, or contain unsupported fields."
        case .inspectRequired: "Inspect the page before acting on a control."
        case .targetChanged: "The inspected control changed; inspect the page again before acting."
        case .approvalDenied: "The local approval was denied or expired."
        case .inactive: "The app became inactive or the page changed before the action."
        case .invalidDestination: "Only credential-free same-origin HTTP(S) destinations are allowed."
        case .unsupported: "Unsupported browser command."
        case .refused(let reason): "Refused: \(reason)"
        }
    }
}

private struct PreparedGatewayCommand {
    let result: [String: Any]
    let deferredAction: DeferredBrowserAction?
}

@MainActor
final class BrowserHostModel: NSObject, ObservableObject, WKNavigationDelegate {
    @Published var address = "https://example.com"
    @Published var status = "Ready. Page content stays on this device in this preview."
    @Published var page: BrowserHostPage?
    @Published var isLoading = false
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var gatewayAddress = UserDefaults.standard.string(forKey: "gatewayAddress") ?? ""
    @Published var deviceTokenDraft = ""
    @Published var bridgeStatus = "Gateway disconnected."
    @Published var isBridgeConnected = false
    @Published private(set) var pendingApproval: BrowserHostApproval?
    @Published private(set) var isDisconnecting = false
    @Published private(set) var isDisconnectPending = false
    @Published private(set) var isEngineAvailable = false

    var canConnectGateway: Bool { isEngineAvailable && (!deviceTokenDraft.isEmpty || DeviceTokenStore.read() != nil) }
    var canRetryDisconnect: Bool { isDisconnectPending && !isDisconnecting && DeviceTokenStore.read() != nil }

    let webView: WKWebView
    private let agentWorld = WKContentWorld.world(name: "com.searchingfool.SafariAIAgent")
    private let defaults = UserDefaults.standard
    private var sceneIsActive = false
    private var windowIsVisible = false
    private var contentIsObscured = false
    private var bridgeTask: Task<Void, Never>?
    private var gatewayBaseURL: URL?
    private var remoteSnapshot: [String: Any]?
    private var approvalContinuation: CheckedContinuation<Bool, Never>?
    private var approvalTimeoutTask: Task<Void, Never>?
    private var remoteNavigationOrigin: String?
    private var remoteNavigationGuardTask: Task<Void, Never>?
    private var currentPolicy: [String: Any] = ["mode": "read-only"]
    private var instanceId: String {
        if let existing = defaults.string(forKey: "gatewayInstanceId") { return existing }
        let created = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        defaults.set(created, forKey: "gatewayInstanceId")
        return created
    }

    override init() {
        let contentController = WKUserContentController()
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        do {
            guard let coreURL = Bundle.main.url(forResource: "core", withExtension: "js") else {
                throw CocoaError(.fileNoSuchFile)
            }
            let core = try String(contentsOf: coreURL, encoding: .utf8)
            contentController.addUserScript(WKUserScript(
                source: core,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true,
                in: agentWorld
            ))
            contentController.addUserScript(WKUserScript(
                source: "globalThis.__safariAIAgentCore = globalThis.SafariAIAgentCore.createAgentCore(document, window);",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true,
                in: agentWorld
            ))
            isEngineAvailable = true
        } catch {
            isEngineAvailable = false
        }
        configuration.userContentController = contentController
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        if !isEngineAvailable {
            status = "ENGINE_UNAVAILABLE: The bundled browser engine could not be loaded. Reinstall the app build."
        }
    }

    func loadAddress() {
        do {
            let url = try Self.httpURL(from: address)
            address = url.absoluteString
            page = nil
            status = "Loading \(url.host ?? url.absoluteString)…"
            webView.load(URLRequest(url: url))
        } catch {
            status = "INVALID_ADDRESS: Enter a valid http:// or https:// website address."
        }
    }

    func goBack() { if webView.canGoBack { webView.goBack() } }
    func goForward() { if webView.canGoForward { webView.goForward() } }
    func reload() { webView.reload() }

    func inspectPage() {
        guard isEngineAvailable else {
            status = "ENGINE_UNAVAILABLE: The bundled browser engine could not be loaded. Reinstall the app build."
            return
        }
        guard webView.url != nil else {
            status = "NO_PAGE: Load a website before inspecting it."
            return
        }
        Task {
            do {
                remoteSnapshot = nil
                let value = try await webView.callAsyncJavaScript(
                    "return JSON.stringify(globalThis.__safariAIAgentCore.inspect({mode: 'read-only'}));",
                    arguments: [:],
                    in: nil,
                    contentWorld: agentWorld
                )
                guard let json = value as? String,
                      let data = json.data(using: .utf8) else {
                    status = "INSPECT_FAILED: The isolated page engine returned no snapshot."
                    return
                }
                page = try JSONDecoder().decode(BrowserHostPage.self, from: data)
                status = "INSPECTED_LOCALLY: \(page?.elements.count ?? 0) controls; no page data was sent to a service."
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
        guard sceneIsActive != active else { return }
        sceneIsActive = active
        if active {
            beginPollingIfReady()
        } else {
            resolveApproval(false)
            // Send the gateway an ordered hidden-state update before suspending the poll loop.
            // It is best-effort because iOS can suspend an app shortly after backgrounding.
            bridgeTask?.cancel()
            if let origin = currentOrigin, isBridgeConnected {
                Task { await sendVisibilityUpdate(origin: origin, visible: false) }
            }
            if isBridgeConnected { bridgeStatus = "Paused: app is inactive; remote inspection is stopped." }
        }
    }

    func setContentObscured(_ obscured: Bool) {
        guard contentIsObscured != obscured else { return }
        contentIsObscured = obscured
        if isBridgeVisible {
            beginPollingIfReady()
        } else {
            resolveApproval(false)
            bridgeTask?.cancel()
            if let origin = currentOrigin, isBridgeConnected {
                Task { await sendVisibilityUpdate(origin: origin, visible: false) }
            }
            if isBridgeConnected { bridgeStatus = "Paused: browser content is covered by an app sheet." }
        }
    }

    func setWindowVisible(_ visible: Bool) {
        guard windowIsVisible != visible else { return }
        windowIsVisible = visible
        if isBridgeVisible {
            beginPollingIfReady()
        } else {
            resolveApproval(false)
            bridgeTask?.cancel()
            if let origin = currentOrigin, isBridgeConnected {
                Task { await sendVisibilityUpdate(origin: origin, visible: false) }
            }
            if isBridgeConnected { bridgeStatus = "Paused: the browser window is not visible." }
        }
    }

    private var isBridgeVisible: Bool { sceneIsActive && windowIsVisible && !contentIsObscured }

    func connectGateway() {
        guard !isDisconnecting && !isDisconnectPending else {
            bridgeStatus = "DISCONNECT_PENDING: Confirm gateway revocation or explicitly forget the saved token before reconnecting."
            return
        }
        do {
            let url = try GatewayProtocol.gatewayURL(from: gatewayAddress)
            let enteredToken = deviceTokenDraft.trimmingCharacters(in: .whitespacesAndNewlines)
            let token = enteredToken.isEmpty ? (DeviceTokenStore.read() ?? "") : enteredToken
            guard token.range(of: "^[0-9A-Fa-f]{24,}$", options: .regularExpression) != nil else {
                throw GatewaySetupError.invalidToken
            }
            try DeviceTokenStore.save(token)
            gatewayBaseURL = url
            gatewayAddress = url.absoluteString
            defaults.set(gatewayAddress, forKey: "gatewayAddress")
            deviceTokenDraft = ""
            isBridgeConnected = true
            bridgeStatus = "Paired. Waiting for an active page and app."
            beginPollingIfReady()
        } catch {
            bridgeStatus = "PAIRING_FAILED: \(error.localizedDescription)"
        }
    }

    func disconnectGateway() {
        guard !isDisconnecting else { return }
        let origin = currentOrigin
        let activePoll = bridgeTask
        resolveApproval(false)
        bridgeTask?.cancel()
        isBridgeConnected = false
        guard let origin, let gatewayBaseURL, let token = DeviceTokenStore.read() else {
            isDisconnectPending = true
            bridgeStatus = "DISCONNECT_PENDING: Local polling stopped, but the gateway could not confirm revocation because the active page or saved connection is unavailable."
            return
        }
        let id = instanceId
        let baseURL = gatewayBaseURL
        isDisconnecting = true
        bridgeStatus = "Disconnecting and waiting for gateway revocation…"
        Task {
            defer { isDisconnecting = false }
            await activePoll?.value
            do {
                let response = try await Self.post(
                    to: baseURL.appending(path: "/device/disconnect"), token: token,
                    body: Self.identity(origin: origin, instanceId: id, visible: false)
                )
                guard response["disconnected"] as? Bool == true else {
                    throw GatewaySetupError.resultRejected
                }
                try DeviceTokenStore.delete()
                self.gatewayBaseURL = nil
                isDisconnectPending = false
                bridgeStatus = "Disconnected. Gateway revocation was confirmed and the saved device token was removed."
            } catch {
                // Keep the token so the operator can retry revocation. The local poll loop is
                // stopped, but the gateway session may remain live until its lease expires.
                self.gatewayBaseURL = baseURL
                isDisconnectPending = true
                bridgeStatus = "DISCONNECT_PENDING: Local polling stopped, but the gateway did not confirm revocation. The saved token remains so you can retry. \(error.localizedDescription)"
            }
        }
    }

    func forgetDeviceToken() {
        guard !isDisconnecting else { return }
        do {
            try DeviceTokenStore.delete()
            isDisconnectPending = false
            gatewayBaseURL = nil
            bridgeStatus = "Token removed locally. Gateway revocation was not confirmed; its session may remain until it expires."
        } catch {
            bridgeStatus = "TOKEN_REMOVE_FAILED: \(error.localizedDescription)"
        }
    }

    static func httpURL(from text: String) throws -> URL {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw AddressError.invalid }
        let candidate = trimmed.contains("://") ? trimmed : "https://" + trimmed
        guard let url = URL(string: candidate),
              let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              url.host != nil, url.user == nil, url.password == nil else {
            throw AddressError.invalid
        }
        return url
    }

    private var currentOrigin: String? {
        guard let url = webView.url, url.scheme != nil, url.host != nil else { return nil }
        return GatewayProtocol.normalizedOrigin(url)
    }

    private func beginPollingIfReady() {
        guard isEngineAvailable, isBridgeConnected, isBridgeVisible, webView.url != nil, bridgeTask == nil else { return }
        bridgeTask = Task { await pollLoop() }
    }

    private func pollLoop() async {
        defer {
            bridgeTask = nil
            if isBridgeConnected && isBridgeVisible { beginPollingIfReady() }
        }
        guard isEngineAvailable, let gatewayBaseURL, let token = DeviceTokenStore.read() else {
            if !isEngineAvailable {
                bridgeStatus = "ENGINE_UNAVAILABLE: Remote browser commands are disabled because the bundled engine did not load."
                return
            }
            isBridgeConnected = false
            bridgeStatus = "PAIRING_FAILED: Saved device token is unavailable."
            return
        }
        while !Task.isCancelled && isBridgeConnected && isBridgeVisible {
            guard let origin = currentOrigin else {
                bridgeStatus = "Waiting for a page before pairing the browser session."
                try? await Task.sleep(for: .seconds(1))
                continue
            }
            do {
                let poll = try await Self.post(
                    to: gatewayBaseURL.appending(path: "/device/poll"), token: token,
                    body: Self.identity(origin: origin, instanceId: instanceId, visible: true)
                )
                guard !Task.isCancelled, isBridgeConnected, isBridgeVisible else { break }
                currentPolicy = Self.normalizedPolicy(poll["policy"] as? [String: Any])
                if let command = poll["command"] as? [String: Any] {
                    let prepared = await prepareCommand(command, origin: origin)
                    guard !Task.isCancelled, isBridgeConnected, isBridgeVisible else { break }
                    var outcome = prepared.result
                    if currentOrigin != origin {
                        outcome = ["success": false, "error": "Page origin changed before result submission; no snapshot was returned."]
                    }
                    let resultBody = Self.identity(origin: origin, instanceId: instanceId, visible: true)
                        .merging(["id": command["id"] ?? "", "result": outcome]) { _, new in new }
                    let acknowledgement = try await Self.post(
                        to: gatewayBaseURL.appending(path: "/device/result"), token: token,
                        body: resultBody
                    )
                    guard acknowledgement["accepted"] as? Bool == true else {
                        throw GatewaySetupError.resultRejected
                    }
                    if outcome["success"] as? Bool == true, let action = prepared.deferredAction {
                        await performDeferredAction(action)
                    }
                }
                if !bridgeStatus.hasPrefix("APPROVAL_UNAVAILABLE:") {
                    bridgeStatus = "Connected to \(origin); browser actions follow the page policy and require local approval when requested."
                }
            } catch is CancellationError {
                break
            } catch {
                bridgeStatus = "GATEWAY_ERROR: \(error.localizedDescription)"
            }
            try? await Task.sleep(for: .seconds(1))
        }
    }

    private func prepareCommand(_ command: [String: Any], origin: String) async -> PreparedGatewayCommand {
        let envelope: GatewayCommandEnvelope
        do {
            envelope = try GatewayCommandEnvelope.parse(command, expectedOrigin: origin)
            try GatewayCommandArguments.validate(action: envelope.action, arguments: envelope.arguments)
        } catch {
            return PreparedGatewayCommand(result: ["success": false, "error": "Invalid, expired, or wrong-origin command."], deferredAction: nil)
        }
        let action = envelope.action
        let commandOrigin = envelope.origin
        bridgeStatus = "PROCESSING: Validating the remote browser command."
        guard isBridgeConnected, isBridgeVisible, currentOrigin == commandOrigin, webView.url != nil else {
            return PreparedGatewayCommand(result: ["success": false, "error": "Host became inactive before the command; no page data was read."], deferredAction: nil)
        }
        do {
            switch action {
            case "browser_inspect":
                guard envelope.arguments.isEmpty else { throw CommandError.invalidArguments }
                let snapshot = try await inspectRemotePage()
                return PreparedGatewayCommand(result: ["success": true, "data": snapshot], deferredAction: nil)
            case "browser_verify":
                guard !envelope.arguments.isEmpty,
                      Set(envelope.arguments.keys).isSubset(of: Set(["textIncludes", "urlIncludes"])) else { throw CommandError.invalidArguments }
                let textIncludes: String? = try Self.optionalString(envelope.arguments, key: "textIncludes")
                let urlIncludes: String? = try Self.optionalString(envelope.arguments, key: "urlIncludes")
                guard textIncludes != nil || urlIncludes != nil else { throw CommandError.invalidArguments }
                let snapshot = try await inspectRemotePage()
                let text = snapshot["textExcerpt"] as? String ?? ""
                let pageURL = snapshot["url"] as? String ?? ""
                let matches = (textIncludes.map { text.contains($0) } ?? true) && (urlIncludes.map { pageURL.contains($0) } ?? true)
                var result: [String: Any] = ["success": matches,
                    "data": ["match": matches, "url": pageURL, "title": snapshot["title"] ?? ""]]
                if !matches { result["error"] = "Expected condition was not observed" }
                return PreparedGatewayCommand(result: result, deferredAction: nil)
            case "browser_fill":
                guard Set(envelope.arguments.keys) == Set(["ref", "value"]),
                      let ref = envelope.arguments["ref"] as? String,
                      let value = envelope.arguments["value"] as? String,
                      value.utf8.count <= 10_000 else { throw CommandError.invalidArguments }
                guard let prior = remoteSnapshot, try Self.snapshot(prior, containsRef: ref) else {
                    throw CommandError.inspectRequired
                }
                bridgeStatus = "PROCESSING: Refreshing the inspected field before approval."
                let fresh = try await inspectRemotePage()
                bridgeStatus = "PROCESSING: Checking the field and current site policy."
                guard try Self.sameControl(prior, fresh, ref: ref) else { throw CommandError.targetChanged }
                let verdict = try await coreCall("return JSON.stringify(core.decideFill(policy));", arguments: ["policy": currentPolicy])
                guard let decision = verdict["decision"] as? String, ["allow", "prompt"].contains(decision) else {
                    throw CommandError.refused(verdict["reason"] as? String ?? "Fill is not permitted by site policy.")
                }
                if decision == "prompt" {
                    bridgeStatus = "PROCESSING: Preparing the one-time field approval prompt."
                    let element = try Self.element(prior, ref: ref)
                    let label = element["label"] as? String ?? "Form field"
                    let approved = try await requestApproval(action: "fill field", target: "\(label)\nValue to fill: \(value)",
                        origin: origin, tier: "elevated", category: "field-fill",
                        reasons: ["This site's policy requires approval before filling a field."], expiresAt: envelope.expiresAtMilliseconds)
                    guard approved else { throw CommandError.approvalDenied }
                }
                guard commandIsAlive(envelope), isBridgeConnected, isBridgeVisible, currentOrigin == commandOrigin else { throw CommandError.inactive }
                let result = try await coreCall("return JSON.stringify(core.fill(ref, value));", arguments: ["ref": ref, "value": value])
                return PreparedGatewayCommand(result: ["success": true, "data": result], deferredAction: nil)
            case "browser_click":
                guard Set(envelope.arguments.keys) == Set(["ref"]), let ref = envelope.arguments["ref"] as? String,
                      let prior = remoteSnapshot, try Self.snapshot(prior, containsRef: ref) else { throw CommandError.inspectRequired }
                let fresh = try await inspectRemotePage()
                guard try Self.sameControl(prior, fresh, ref: ref) else { throw CommandError.targetChanged }
                let preview = try await coreCall("return JSON.stringify(core.previewClick(ref));", arguments: ["ref": ref])
                let verdict = try await coreCall("return JSON.stringify(core.decideClick(preview, policy));",
                                                 arguments: ["preview": preview, "policy": currentPolicy])
                guard let decision = verdict["decision"] as? String, ["allow", "prompt"].contains(decision) else {
                    throw CommandError.refused(verdict["reason"] as? String ?? "Click is not permitted by site policy.")
                }
                if let href = preview["href"] as? String {
                    guard let destination = URL(string: href), GatewayProtocol.normalizedOrigin(destination) == origin else {
                        throw CommandError.refused("Cross-site link blocked.")
                    }
                }
                if decision == "prompt" {
                    let approved = try await requestApproval(action: "click", target: preview["summary"] as? String ?? "Page control",
                        origin: origin, tier: preview["tier"] as? String ?? "elevated",
                        category: preview["category"] as? String ?? "unclassified-action",
                        reasons: preview["reasons"] as? [String] ?? [], expiresAt: envelope.expiresAtMilliseconds)
                    guard approved else { throw CommandError.approvalDenied }
                }
                let current = try await coreCall("return JSON.stringify(core.previewClick(ref));", arguments: ["ref": ref])
                guard current["category"] as? String == preview["category"] as? String,
                      current["summary"] as? String == preview["summary"] as? String,
                      current["tier"] as? String == preview["tier"] as? String,
                      commandIsAlive(envelope), isBridgeConnected, isBridgeVisible, currentOrigin == commandOrigin else { throw CommandError.targetChanged }
                let result: [String: Any] = ["success": true, "dispatched": true, "verified": false,
                    "action": "click", "approval": decision == "allow" ? "site-permission" : "once",
                    "category": preview["category"] ?? "", "target": preview["summary"] ?? "", "tier": preview["tier"] ?? ""]
                return PreparedGatewayCommand(result: result, deferredAction: DeferredBrowserAction(
                    origin: origin, kind: .click(ref: ref, summary: preview["summary"] as? String ?? "",
                                                 category: preview["category"] as? String ?? "",
                                                 tier: preview["tier"] as? String ?? ""), policy: currentPolicy,
                    expiresAtMilliseconds: envelope.expiresAtMilliseconds))
            case "browser_navigate":
                guard Set(envelope.arguments.keys) == Set(["url"]), let rawURL = envelope.arguments["url"] as? String,
                      let destination = URL(string: rawURL),
                      ["http", "https"].contains(destination.scheme?.lowercased() ?? ""),
                      destination.user == nil, destination.password == nil,
                      GatewayProtocol.normalizedOrigin(destination) == origin else { throw CommandError.invalidDestination }
                let verdict = try await coreCall("return JSON.stringify(core.decideNavigate(policy));", arguments: ["policy": currentPolicy])
                guard let decision = verdict["decision"] as? String, ["allow", "prompt"].contains(decision) else {
                    throw CommandError.refused(verdict["reason"] as? String ?? "Navigation is not permitted by site policy.")
                }
                if decision == "prompt" {
                    let approved = try await requestApproval(action: "navigate to", target: destination.absoluteString,
                        origin: origin, tier: "routine", category: "same-origin-navigation",
                        reasons: ["Same-origin navigation can be reversed with the back button."], expiresAt: envelope.expiresAtMilliseconds)
                    guard approved else { throw CommandError.approvalDenied }
                }
                guard commandIsAlive(envelope) else { throw CommandError.inactive }
                let result: [String: Any] = ["success": true, "dispatched": true, "verified": false,
                    "url": destination.absoluteString, "approval": decision == "allow" ? "site-permission" : "once"]
                return PreparedGatewayCommand(result: result, deferredAction: DeferredBrowserAction(
                    origin: origin, kind: .navigate(destination), policy: currentPolicy,
                    expiresAtMilliseconds: envelope.expiresAtMilliseconds))
            default:
                throw CommandError.unsupported
            }
        } catch {
            return PreparedGatewayCommand(result: ["success": false, "error": error.localizedDescription], deferredAction: nil)
        }
    }

    private func inspectRemotePage() async throws -> [String: Any] {
        let snapshot = try await coreCall("return JSON.stringify(core.inspect(policy));", arguments: ["policy": currentPolicy])
        guard isBridgeConnected, isBridgeVisible, currentOrigin != nil else { throw CommandError.inactive }
        remoteSnapshot = snapshot
        return snapshot
    }

    private func coreCall(_ script: String, arguments: [String: Any]) async throws -> [String: Any] {
        let value = try await webView.callAsyncJavaScript(
            "const core = globalThis.__safariAIAgentCore; if (!core) throw new Error('Bundled page engine is unavailable.');\n\(script)",
            arguments: arguments, in: nil, contentWorld: agentWorld)
        guard let json = value as? String, let data = json.data(using: .utf8),
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw GatewaySetupError.invalidResponse
        }
        return object
    }

    private func requestApproval(action: String, target: String, origin: String, tier: String,
                                 category: String, reasons: [String], expiresAt: Double) async throws -> Bool {
        guard isBridgeVisible else {
            bridgeStatus = "APPROVAL_UNAVAILABLE: Keep this app in the foreground with the browser visible, then retry the action."
            throw CommandError.inactive
        }
        guard currentOrigin == origin else {
            bridgeStatus = "APPROVAL_UNAVAILABLE: The page changed before approval. Request the action again on the current page."
            throw CommandError.inactive
        }
        guard approvalContinuation == nil else {
            bridgeStatus = "APPROVAL_UNAVAILABLE: Another approval is already pending. Resolve it before retrying."
            throw CommandError.inactive
        }
        let id = UUID().uuidString
        let deadline = min(expiresAt - 1_500, Date().timeIntervalSince1970 * 1_000 + 120_000)
        guard deadline > Date().timeIntervalSince1970 * 1_000 else {
            bridgeStatus = "APPROVAL_UNAVAILABLE: The gateway command expired before approval could be shown. Request it again."
            throw CommandError.inactive
        }
        bridgeStatus = "APPROVAL_PENDING: Review the requested page change and allow it once or deny it."
        return await withCheckedContinuation { continuation in
            approvalContinuation = continuation
            pendingApproval = BrowserHostApproval(id: id, action: action, target: target, origin: origin,
                tier: tier, category: category, reasons: reasons, expiresAtMilliseconds: deadline)
            approvalTimeoutTask = Task { [weak self] in
                do {
                    try await Task.sleep(for: .milliseconds(Int(deadline - Date().timeIntervalSince1970 * 1_000)))
                } catch {
                    return
                }
                self?.resolveApproval(false)
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

    private func performDeferredAction(_ action: DeferredBrowserAction) async {
        guard Date().timeIntervalSince1970 * 1_000 < action.expiresAtMilliseconds,
              isBridgeConnected, isBridgeVisible, currentOrigin == action.origin else { return }
        do {
            switch action.kind {
            case .click(let ref, let summary, let category, let tier):
                let latest = try await coreCall("return JSON.stringify(core.previewClick(ref));", arguments: ["ref": ref])
                let verdict = try await coreCall("return JSON.stringify(core.decideClick(preview, policy));",
                    arguments: ["preview": latest, "policy": action.policy])
                guard latest["summary"] as? String == summary,
                      latest["category"] as? String == category,
                      latest["tier"] as? String == tier,
                      verdict["decision"] as? String != "refuse",
                      Date().timeIntervalSince1970 * 1_000 < action.expiresAtMilliseconds,
                      isBridgeConnected, isBridgeVisible, currentOrigin == action.origin else { return }
                beginRemoteNavigationGuard(origin: action.origin)
                _ = try await coreCall("const keep = event => { const link = event.target.closest && event.target.closest('a[target]'); if (link && link.target === '_blank') link.target = '_self'; }; document.addEventListener('click', keep, true); try { return JSON.stringify(core.click(ref, true)); } finally { document.removeEventListener('click', keep, true); }",
                    arguments: ["ref": ref])
            case .navigate(let url):
                guard GatewayProtocol.normalizedOrigin(url) == action.origin else { return }
                let verdict = try await coreCall("return JSON.stringify(core.decideNavigate(policy));", arguments: ["policy": action.policy])
                guard verdict["decision"] as? String != "refuse",
                      Date().timeIntervalSince1970 * 1_000 < action.expiresAtMilliseconds,
                      isBridgeConnected, isBridgeVisible, currentOrigin == action.origin else { return }
                beginRemoteNavigationGuard(origin: action.origin)
                _ = try await coreCall("return JSON.stringify(core.navigate(url));", arguments: ["url": url.absoluteString])
            }
        } catch {
            bridgeStatus = "ACTION_DISPATCH_FAILED: The gateway received a dispatch acknowledgement, but the page action could not be performed: \(error.localizedDescription)"
        }
    }

    private static func normalizedPolicy(_ raw: [String: Any]?) -> [String: Any] {
        let modes: Set<String> = ["read-only", "fill-only", "trusted", "ask"]
        var policy = raw ?? [:]
        if let mode = policy["mode"] as? String, modes.contains(mode) {
            policy["mode"] = mode
        } else {
            policy["mode"] = "read-only"
        }
        for key in ["values", "grants", "routineActions"] where !(policy[key] is Bool) { policy.removeValue(forKey: key) }
        return policy
    }

    private func commandIsAlive(_ command: GatewayCommandEnvelope) -> Bool {
        Date().timeIntervalSince1970 * 1_000 < command.expiresAtMilliseconds
    }

    private func beginRemoteNavigationGuard(origin: String) {
        remoteNavigationGuardTask?.cancel()
        remoteNavigationOrigin = origin
        remoteNavigationGuardTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(20))
            } catch {
                return
            }
            self?.clearRemoteNavigationGuard()
        }
    }

    private func clearRemoteNavigationGuard() {
        remoteNavigationGuardTask?.cancel()
        remoteNavigationGuardTask = nil
        remoteNavigationOrigin = nil
    }

    private static func snapshot(_ snapshot: [String: Any], containsRef ref: String) throws -> Bool {
        let elements = snapshot["elements"] as? [[String: Any]] ?? []
        return elements.contains { $0["ref"] as? String == ref }
    }

    private static func element(_ snapshot: [String: Any], ref: String) throws -> [String: Any] {
        guard let item = (snapshot["elements"] as? [[String: Any]])?.first(where: { $0["ref"] as? String == ref }) else {
            throw CommandError.inspectRequired
        }
        return item
    }

    private static func optionalString(_ arguments: [String: Any], key: String) throws -> String? {
        guard let value = arguments[key] else { return nil }
        guard let string = value as? String, !string.isEmpty, string.count <= 2_000 else { throw CommandError.invalidArguments }
        return string
    }

    private static func sameControl(_ old: [String: Any], _ new: [String: Any], ref: String) throws -> Bool {
        let before = try element(old, ref: ref), after = try element(new, ref: ref)
        let keys = ["tag", "type", "label", "disabled", "href"]
        return keys.allSatisfy { String(describing: before[$0] ?? NSNull()) == String(describing: after[$0] ?? NSNull()) }
    }

    private func sendVisibilityUpdate(origin: String, visible: Bool) async {
        guard let gatewayBaseURL, let token = DeviceTokenStore.read() else { return }
        do {
            _ = try await Self.post(
                to: gatewayBaseURL.appending(path: "/device/poll"), token: token,
                body: Self.identity(origin: origin, instanceId: instanceId, visible: visible)
            )
        } catch {
            bridgeStatus = "VISIBILITY_UPDATE_FAILED: \(error.localizedDescription)"
        }
    }

    private static func identity(origin: String, instanceId: String, visible: Bool) -> [String: Any] {
        let defaults = UserDefaults.standard
        let sequence = defaults.integer(forKey: "gatewaySequence") + 1
        defaults.set(sequence, forKey: "gatewaySequence")
        return ["origin": origin, "instanceId": instanceId, "visibility": visible ? "visible" : "hidden",
                "seq": sequence]
    }

    private static func post(to url: URL, token: String, body: [String: Any]) async throws -> [String: Any] {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let delegate = SameOriginRedirectDelegate(origin: GatewayProtocol.normalizedOrigin(url) ?? "")
        let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw GatewaySetupError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8).map { String($0.prefix(300)) } ?? ""
            throw GatewaySetupError.http(http.statusCode, message)
        }
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw GatewaySetupError.invalidResponse
        }
        return value
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        page = nil
        remoteSnapshot = nil
        resolveApproval(false)
        refreshNavigationState()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        if let url = webView.url { address = url.absoluteString }
        clearRemoteNavigationGuard()
        status = "Loaded. Use Inspect to view a local, read-only snapshot."
        refreshNavigationState()
        beginPollingIfReady()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        navigationFailed(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        navigationFailed(error)
    }

    private func navigationFailed(_ error: Error) {
        isLoading = false
        let nsError = error as NSError
        let blockedRemoteDestination = remoteNavigationOrigin != nil &&
            nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
        if !blockedRemoteDestination { clearRemoteNavigationGuard() }
        status = "NAVIGATION_FAILED: \(error.localizedDescription)"
        refreshNavigationState()
    }

    private func refreshNavigationState() {
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
    }
}

private final class SameOriginRedirectDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let origin: String

    init(origin: String) { self.origin = origin }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        guard let destination = request.url,
              GatewayProtocol.normalizedOrigin(destination) == origin else {
            completionHandler(nil)
            return
        }
        completionHandler(request)
    }
}

private enum GatewaySetupError: LocalizedError {
    case invalidToken, invalidResponse, resultRejected
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidToken: "Device token must contain at least 24 hexadecimal characters."
        case .invalidResponse: "Gateway returned an invalid response."
        case .resultRejected: "Gateway did not accept the command result."
        case .http(let status, let body): "Gateway HTTP \(status): \(body)"
        }
    }
}

private enum AddressError: Error { case invalid }

extension BrowserHostModel {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              url.user == nil, url.password == nil else {
            decisionHandler(.cancel)
            status = "NAVIGATION_REFUSED: Only credential-free HTTP(S) pages are allowed."
            return
        }
        if let expectedOrigin = remoteNavigationOrigin,
           GatewayProtocol.normalizedOrigin(url) != expectedOrigin {
            decisionHandler(.cancel)
            status = "REMOTE_NAVIGATION_REFUSED: A remote page action attempted to leave the approved origin."
            return
        }
        decisionHandler(.allow)
    }
}
