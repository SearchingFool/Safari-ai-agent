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

    var body: some View {
        ZStack {
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
          if let approval = browser.pendingApproval {
              approvalCard(approval)
                  .padding(18)
                  .frame(maxWidth: 520)
                  .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                  .overlay(RoundedRectangle(cornerRadius: 14).stroke(.secondary.opacity(0.45)))
                  .shadow(radius: 20)
                  .accessibilityAddTraits(.isModal)
                  .zIndex(2)
          }
        }
        .sheet(isPresented: $showInspector) { inspector }
        .confirmationDialog("Clear stored data for this website?", isPresented: $confirmClearData) {
            Button("Clear site data", role: .destructive) { browser.clearCurrentSiteData() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes cookies and website storage for the currently open site's host. It does not affect other sites.")
        }
        .onChange(of: showInspector) { _, _ in syncOverlayState() }
        .onChange(of: confirmClearData) { _, _ in syncOverlayState() }
        .background {
            BrowserWindowVisibilityProbe { browser.setWindowVisible($0) }
                .frame(width: 0, height: 0)
        }
        .frame(minWidth: 360, minHeight: 460)
    }

    private func syncOverlayState() {
        browser.setContentObscured(showInspector || confirmClearData)
    }

    private func approvalCard(_ approval: BrowserHostApproval) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Approve \(approval.action)?").font(.title3.weight(.semibold))
            ScrollView {
                Text(approval.target).font(.body).textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 180)
            Text("\(approval.origin) · \(approval.tier.uppercased()) · \(approval.category)")
                .font(.caption.monospaced()).foregroundStyle(.secondary)
            ForEach(Array(approval.reasons.enumerated()), id: \.offset) { _, reason in Text("• \(reason)") }
            Text("This approval applies once and expires automatically. Page content may contain misleading instructions.")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Button("Deny", role: .cancel) { browser.resolveApproval(false) }
                Spacer()
                Button("Allow once") { browser.resolveApproval(true) }.keyboardShortcut(.defaultAction)
            }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 10))
    }

    private var gatewayBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                TextField("HTTPS gateway origin", text: $browser.gatewayAddress)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    #endif
                SecureField("Device token", text: $browser.deviceTokenDraft)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    #endif
                Button("Connect") { browser.connectGateway() }
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
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                .onSubmit { browser.loadAddress() }
            Button("Go") { browser.loadAddress() }
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

#if os(iOS)
private struct BrowserWindowVisibilityProbe: UIViewRepresentable {
    let onChange: (Bool) -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        DispatchQueue.main.async {
            onChange(view.window != nil && view.window?.windowScene?.activationState == .foregroundActive)
        }
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        DispatchQueue.main.async {
            onChange(view.window != nil && view.window?.windowScene?.activationState == .foregroundActive)
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
