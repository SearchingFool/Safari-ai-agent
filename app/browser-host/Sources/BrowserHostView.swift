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
        .confirmationDialog("Clear stored data for this website?", isPresented: $confirmClearData) {
            Button("Clear site data", role: .destructive) { browser.clearCurrentSiteData() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes cookies and website storage for the currently open site's host. It does not affect other sites.")
        }
        .onChange(of: showInspector) { _, _ in syncOverlayState() }
        .onChange(of: confirmClearData) { _, _ in syncOverlayState() }
        .frame(minWidth: 360, minHeight: 460)
    }

    private func syncOverlayState() {
        browser.setContentObscured(showInspector || confirmClearData)
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
                    .disabled(!browser.canConnectGateway || browser.isBridgeConnected)
                if browser.isBridgeConnected {
                    Button("Disconnect") { browser.disconnectGateway() }
                }
            }
            Text(browser.bridgeStatus)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Gateway commands are restricted to read-only inspection. Unsupported actions are refused.")
                .font(.caption2)
                .foregroundStyle(.secondary)
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
private struct BrowserWebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
#elseif os(macOS)
private struct BrowserWebView: NSViewRepresentable {
    let webView: WKWebView
    func makeNSView(context: Context) -> WKWebView { webView }
    func updateNSView(_ view: WKWebView, context: Context) {}
}
#endif
