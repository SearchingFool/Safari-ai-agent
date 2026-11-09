// File: app/browser-host/Sources/BrowserHostModel.swift
// Description: Shared macOS/iOS WKWebView host with validated HTTP(S) navigation, isolated-world
//              inspection, active-only authenticated read-only gateway polling, and scoped data clearing.
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

    var canConnectGateway: Bool { !deviceTokenDraft.isEmpty || DeviceTokenStore.read() != nil }

    let webView: WKWebView
    private let agentWorld = WKContentWorld.world(name: "com.searchingfool.SafariAIAgent")
    private let defaults = UserDefaults.standard
    private var sceneIsActive = false
    private var contentIsObscured = false
    private var bridgeTask: Task<Void, Never>?
    private var gatewayBaseURL: URL?
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

        if let coreURL = Bundle.main.url(forResource: "core", withExtension: "js"),
           let core = try? String(contentsOf: coreURL, encoding: .utf8) {
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
        }
        configuration.userContentController = contentController
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
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
        guard webView.url != nil else {
            status = "NO_PAGE: Load a website before inspecting it."
            return
        }
        Task {
            do {
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
            bridgeTask?.cancel()
            if let origin = currentOrigin, isBridgeConnected {
                Task { await sendVisibilityUpdate(origin: origin, visible: false) }
            }
            if isBridgeConnected { bridgeStatus = "Paused: browser content is covered by an app sheet." }
        }
    }

    private var isBridgeVisible: Bool { sceneIsActive && !contentIsObscured }

    func connectGateway() {
        do {
            let url = try Self.gatewayURL(from: gatewayAddress)
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
        let origin = currentOrigin
        bridgeTask?.cancel()
        isBridgeConnected = false
        bridgeStatus = "Disconnected."
        if let origin, let gatewayBaseURL, let token = DeviceTokenStore.read() {
            let id = instanceId
            Task {
                _ = try? await Self.post(
                    to: gatewayBaseURL.appending(path: "/device/disconnect"), token: token,
                    body: Self.identity(origin: origin, instanceId: id, visible: false)
                )
            }
        }
        do { try DeviceTokenStore.delete() }
        catch { bridgeStatus = "DISCONNECT_WARNING: Token removal failed: \(error.localizedDescription)" }
        gatewayBaseURL = nil
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

    private static func gatewayURL(from text: String) throws -> URL {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme?.lowercased() == "https",
              url.host != nil, url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else { throw GatewaySetupError.invalidURL }
        return URL(string: "https://\(url.host!)\(url.port.map { ":\($0)" } ?? "")")!
    }

    private var currentOrigin: String? {
        guard let url = webView.url, url.scheme != nil, url.host != nil else { return nil }
        return normalizedOrigin(url)
    }

    private func beginPollingIfReady() {
        guard isBridgeConnected, isBridgeVisible, webView.url != nil, bridgeTask == nil else { return }
        bridgeTask = Task { await pollLoop() }
    }

    private func pollLoop() async {
        defer {
            bridgeTask = nil
            if isBridgeConnected && isBridgeVisible { beginPollingIfReady() }
        }
        guard let gatewayBaseURL, let token = DeviceTokenStore.read() else {
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
                if let command = poll["command"] as? [String: Any] {
                    var outcome = await handleReadOnlyCommand(command, origin: origin)
                    guard !Task.isCancelled, isBridgeConnected, isBridgeVisible else { break }
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
                }
                bridgeStatus = "Connected to \(origin); read-only inspection only."
            } catch is CancellationError {
                break
            } catch {
                bridgeStatus = "GATEWAY_ERROR: \(error.localizedDescription)"
            }
            try? await Task.sleep(for: .seconds(1))
        }
    }

    private func handleReadOnlyCommand(_ command: [String: Any], origin: String) async -> [String: Any] {
        guard let action = command["action"] as? String,
              let commandOrigin = command["origin"] as? String,
              let commandId = command["id"] as? String,
              commandId.range(of: "^[0-9a-fA-F-]{36}$", options: .regularExpression) != nil,
              commandOrigin == origin,
              let expiresAt = command["expiresAt"] as? Double,
              Date().timeIntervalSince1970 * 1000 < expiresAt else {
            return ["success": false, "error": "Invalid, expired, or wrong-origin command."]
        }
        guard action == "browser_inspect" else {
            return ["success": false, "error": "Unsupported remote action; this host only permits browser_inspect."]
        }
        guard (command["args"] as? [String: Any] ?? [:]).isEmpty else {
            return ["success": false, "error": "browser_inspect accepts no arguments."]
        }
        guard isBridgeConnected, isBridgeVisible, currentOrigin == commandOrigin, webView.url != nil else {
            return ["success": false, "error": "Host became inactive before inspection; no page data was read."]
        }
        do {
            let value = try await webView.callAsyncJavaScript(
                "return JSON.stringify(globalThis.__safariAIAgentCore.inspect({mode: 'read-only', values: false}));",
                arguments: [:], in: nil, contentWorld: agentWorld
            )
            guard isBridgeConnected, isBridgeVisible, currentOrigin == commandOrigin else {
                return ["success": false, "error": "Host became inactive or page origin changed before inspection completed; no page data was returned."]
            }
            guard let json = value as? String, let data = json.data(using: .utf8) else {
                return ["success": false, "error": "Isolated page engine returned no snapshot."]
            }
            let snapshot = try JSONSerialization.jsonObject(with: data)
            return ["success": true, "action": action, "data": snapshot]
        } catch {
            return ["success": false, "error": "Inspection failed: \(error.localizedDescription)"]
        }
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
        let delegate = SameOriginRedirectDelegate(origin: normalizedOrigin(url))
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
        refreshNavigationState()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        if let url = webView.url { address = url.absoluteString }
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
              normalizedOrigin(destination) == origin else {
            completionHandler(nil)
            return
        }
        completionHandler(request)
    }
}

private func normalizedOrigin(_ url: URL) -> String {
    "\(url.scheme?.lowercased() ?? "")://\(url.host?.lowercased() ?? "")\(url.port.map { ":\($0)" } ?? "")"
}

private enum GatewaySetupError: LocalizedError {
    case invalidURL, invalidToken, invalidResponse, resultRejected
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: "Enter an HTTPS gateway origin without a path, query, or credentials."
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
        decisionHandler(.allow)
    }
}
