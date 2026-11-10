// File: app/browser-host/Sources/BrowserHostView.swift
// Description: Shared browser-host controls and the local snapshot inspector for macOS and iOS.
// Author: Libor Ballaty, with Codex (swift-alternate seat, 2026-11-09)
// Created: 2026-11-09

import SwiftUI
import WebKit

struct BrowserHostView: View {
    @ObservedObject var browser: BrowserHostModel
    @State private var showInspector = false
    @State private var confirmClearData = false
    @State private var showApprovalAlert = false
    @FocusState private var focusedInput: BrowserHostInputField?

    var body: some View {
        VStack(spacing: 0) {
            gatewayBar
            browserBar
            HStack(spacing: 8) {
                Button("Inspect locally") {
                    browser.inspectPage()
                    showInspector = true
                }
                .disabled(browser.isLoading || browser.webView.url == nil)
                Button("Clear site data") { confirmClearData = true }
                    .disabled(browser.webView.url == nil)
                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            Text(browser.status)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 10)
                .padding(.bottom, 6)
            BrowserWebView(webView: browser.webView)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .sheet(isPresented: $showInspector) { inspector }
        .alert(approvalTitle, isPresented: $showApprovalAlert) {
            Button("Deny", role: .cancel) { browser.resolveApproval(false) }
                .accessibilityIdentifier("native-approval-deny")
            Button("Allow once") { browser.resolveApproval(true) }
                .accessibilityIdentifier("native-approval-allow-once")
        } message: {
            if let approval = browser.pendingApproval {
                Text("\(approval.target)\n\(approval.origin) · \(approval.tier.uppercased()) · \(approval.category)\n\(approval.reasons.joined(separator: " "))\nThis approval applies once and expires automatically.")
            }
        }
        .confirmationDialog("Clear stored data for this website?", isPresented: $confirmClearData) {
            Button("Clear site data", role: .destructive) { browser.clearCurrentSiteData() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes cookies and website storage for the currently open site's host. It does not affect other sites.")
        }
        .onChange(of: showInspector) { _, _ in syncOverlayState() }
        .onChange(of: confirmClearData) { _, _ in syncOverlayState() }
        .onChange(of: browser.pendingApproval?.id) { _, id in showApprovalAlert = id != nil }
        .background {
            BrowserWindowVisibilityProbe { browser.setWindowVisible($0) }
                .frame(width: 0, height: 0)
        }
        .frame(minWidth: 360, minHeight: 460)
    }

    private func syncOverlayState() {
        browser.setContentObscured(showInspector || confirmClearData)
    }

    private var approvalTitle: String {
        browser.pendingApproval.map { "Approve \($0.action)?" } ?? "Approval required"
    }

    private var gatewayBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                TextField("HTTPS gateway origin", text: $browser.gatewayAddress)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("gateway-origin-field")
                    .focused($focusedInput, equals: .gatewayOrigin)
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    #endif
                SecureField("Device token", text: $browser.deviceTokenDraft)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("device-token-field")
                    .focused($focusedInput, equals: .deviceToken)
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    #endif
                Button("Connect") {
                    focusedInput = nil
                    browser.connectGateway()
                }
                    .disabled(!browser.canConnectGateway || browser.isBridgeConnected || browser.isDisconnecting || browser.isDisconnectPending)
                if browser.isBridgeConnected {
                    Button(browser.isDisconnecting ? "Disconnecting…" : "Disconnect") { browser.disconnectGateway() }
                        .disabled(browser.isDisconnecting)
                } else if browser.canRetryDisconnect {
                    Button("Retry disconnect") { browser.disconnectGateway() }
                        .disabled(browser.isDisconnecting)
                }
            }
            Text(browser.bridgeStatus)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Page content sent through the gateway can be seen by the connected AI. Page changes follow site policy and request native approval when required.")
                .font(.caption2)
                .foregroundStyle(.secondary)
            if browser.isDisconnectPending {
                HStack {
                    Text("The gateway may retain the session until its lease expires.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Button("Forget token locally") { browser.forgetDeviceToken() }
                        .font(.caption2)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    private var browserBar: some View {
        HStack(spacing: 6) {
            Button { browser.goBack() } label: { Image(systemName: "chevron.left") }
                .disabled(!browser.canGoBack)
                .accessibilityLabel("Back")
            Button { browser.goForward() } label: { Image(systemName: "chevron.right") }
                .disabled(!browser.canGoForward)
                .accessibilityLabel("Forward")
            TextField("https://example.com", text: $browser.address)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
                .accessibilityIdentifier("browser-address-field")
                .focused($focusedInput, equals: .browserAddress)
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                .onSubmit { browser.loadAddress() }
            Button("Go") {
                focusedInput = nil
                browser.loadAddress()
            }
            Button { browser.reload() } label: { Image(systemName: "arrow.clockwise") }
                .disabled(browser.webView.url == nil || browser.isLoading)
                .accessibilityLabel("Reload")
        }
        .padding(10)
    }

    private var inspector: some View {
        NavigationStack {
            Group {
                if let page = browser.page {
                    List {
                        Section("Page") {
                            LabeledContent("Title", value: page.title.isEmpty ? "Untitled" : page.title)
                            LabeledContent("URL", value: page.url)
                            Text(page.textExcerpt.isEmpty ? "No visible text." : page.textExcerpt)
                                .textSelection(.enabled)
                        }
                        Section("Visible controls") {
                            if page.elements.isEmpty {
                                Text("No supported controls found.").foregroundStyle(.secondary)
                            }
                            ForEach(page.elements) { element in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(element.label.isEmpty ? "Unlabelled \(element.tag)" : element.label)
                                        .font(.body)
                                    Text("\(element.ref) · \(element.tag) · \(element.type)")
                                        .font(.caption.monospaced())
                                        .foregroundStyle(.secondary)
                                    if let href = element.href { Text(href).font(.caption).lineLimit(2) }
                                }
                            }
                        }
                        if page.truncated {
                            Section { Text("Snapshot reached the engine's control limit.").foregroundStyle(.secondary) }
                        }
                        Section {
                            Text("This is a local read-only proof. No page content is sent to the gateway or an AI provider.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .accessibilityIdentifier("local-inspection-privacy-note")
                        }
                    }
                } else {
                    ContentUnavailableView("No snapshot", systemImage: "doc.text.magnifyingglass",
                                           description: Text("Load a page and choose Inspect locally."))
                }
            }
            .navigationTitle("Local inspection")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showInspector = false }
                }
            }
        }
        .frame(minWidth: 320, minHeight: 360)
    }
}

private enum BrowserHostInputField: Hashable {
    case gatewayOrigin
    case deviceToken
    case browserAddress
}

#if os(iOS)
private struct BrowserWindowVisibilityProbe: UIViewRepresentable {
    let onChange: (Bool) -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        DispatchQueue.main.async {
            if view.window != nil && view.window?.windowScene?.activationState == .foregroundActive {
                onChange(true)
            }
        }
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        DispatchQueue.main.async {
            if view.window != nil && view.window?.windowScene?.activationState == .foregroundActive {
                onChange(true)
            }
        }
    }
}

private struct BrowserWebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
#elseif os(macOS)
private struct BrowserWindowVisibilityProbe: NSViewRepresentable {
    let onChange: (Bool) -> Void

    func makeNSView(context: Context) -> VisibilityProbeView {
        let view = VisibilityProbeView(frame: .zero)
        view.onChange = onChange
        return view
    }

    func updateNSView(_ view: VisibilityProbeView, context: Context) {
        view.onChange = onChange
        view.refresh()
    }
}

private final class VisibilityProbeView: NSView {
    var onChange: ((Bool) -> Void)?
    private var observers: [NSObjectProtocol] = []

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers.removeAll()
        if let window {
            let names: [Notification.Name] = [
                NSWindow.didChangeOcclusionStateNotification,
                NSWindow.didMiniaturizeNotification,
                NSWindow.didDeminiaturizeNotification,
                NSWindow.didBecomeKeyNotification,
                NSWindow.didResignKeyNotification
            ]
            observers = names.map { name in
                NotificationCenter.default.addObserver(forName: name, object: window, queue: .main) { [weak self] _ in
                    Task { @MainActor [weak self] in self?.refresh() }
                }
            }
        }
        refresh()
    }

    func refresh() {
        let visible = window.map { $0.isVisible && !$0.isMiniaturized && $0.occlusionState.contains(.visible) } ?? false
        onChange?(visible)
    }
}

private struct BrowserWebView: NSViewRepresentable {
    let webView: WKWebView
    func makeNSView(context: Context) -> WKWebView { webView }
    func updateNSView(_ view: WKWebView, context: Context) {}
}
#endif
