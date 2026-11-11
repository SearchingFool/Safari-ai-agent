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
    @FocusState private var focusedInput: BrowserHostInputField?

    var body: some View {
        VStack(spacing: 0) {
            agentBar
            if let approval = browser.pendingApproval {
                approvalPrompt(approval)
            }
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
        .background {
            BrowserWindowVisibilityProbe { browser.setWindowVisible($0) }
                .frame(width: 0, height: 0)
        }
        .frame(minWidth: 360, minHeight: 460)
    }

    private func syncOverlayState() {
        browser.setContentObscured(showInspector || confirmClearData)
    }

    private func approvalPrompt(_ approval: BrowserHostApproval) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Review page change", systemImage: "hand.raised.fill")
                .font(.headline)
                .accessibilityIdentifier("native-approval-prompt")
            Text("Approve \(approval.action)?")
                .font(.title3.weight(.semibold))
            VStack(alignment: .leading, spacing: 6) {
                Text(approval.target).font(.body.weight(.medium))
                Text("\(approval.origin) · \(approval.tier.uppercased()) · \(approval.category)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(approval.reasons.joined(separator: " "))
                    .font(.callout)
                Text("This approval applies once and expires automatically.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Button("Deny", role: .cancel) { browser.resolveApproval(false) }
                    .accessibilityIdentifier("native-approval-deny")
                Spacer()
                Button("Allow once") { browser.resolveApproval(true) }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("native-approval-allow-once")
            }
        }
        .padding(16)
        .frame(maxWidth: 560, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    private var agentBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("ChatGPT plan", systemImage: "sparkles")
                    .font(.headline)
                Spacer()
                if browser.isChatGPTSignedIn {
                    Text(browser.chatGPTAccountLabel ?? "Signed in")
                        .font(.caption)
                        .lineLimit(1)
                    Button("Sign out") { browser.signOutOfChatGPT() }
                } else {
                    Button(browser.isChatGPTSigningIn ? "Signing in…" : "Continue with ChatGPT") { browser.signInToChatGPT() }
                        .buttonStyle(.borderedProminent)
                        .disabled(browser.isChatGPTSigningIn)
                }
            }
            if browser.isChatGPTSignedIn {
                HStack {
                    Picker("Model", selection: $browser.selectedModel) {
                        ForEach(browser.availableModels) { model in Text(model.displayName).tag(model.slug) }
                    }
                    .labelsHidden()
                    .disabled(browser.availableModels.isEmpty || browser.isAgentRunning)
                    Button("Refresh models") {
                        Task { await browser.refreshChatGPTModels() }
                    }
                    .disabled(browser.isAgentRunning)
                }
            }
            #if os(macOS)
            Text("Codex app-server is not bundled in this build. ChatGPT Responses mode is not Codex.")
                .font(.caption2)
                .foregroundStyle(.secondary)
            #else
            Text("Codex app-server is unavailable on iOS in this build. ChatGPT Responses mode is not Codex.")
                .font(.caption2)
                .foregroundStyle(.secondary)
            #endif
            if !browser.agentTranscript.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(browser.agentTranscript.suffix(6).enumerated()), id: \.offset) { _, line in
                            Text(line).font(.caption).frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .frame(maxHeight: 100)
            }
            HStack(alignment: .bottom, spacing: 6) {
                TextField("Ask the browser agent", text: $browser.agentPrompt, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...3)
                    .disabled(!browser.isChatGPTSignedIn || browser.isAgentRunning)
                    .accessibilityIdentifier("agent-prompt-field")
                Button(browser.isAgentRunning ? "Working…" : "Ask") {
                    browser.sendAgentPrompt()
                }
                .disabled(!browser.isChatGPTSignedIn || browser.availableModels.isEmpty || browser.agentPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || browser.isAgentRunning)
            }
            Toggle("Allow this request to inspect and send page content to OpenAI", isOn: $browser.allowPageAccessForCurrentTurn)
                .disabled(browser.isAgentRunning || browser.webView.url == nil)
            Text("Prompts are sent directly to OpenAI using ChatGPT plan access. Responses use store:false. Page access is opt-in for each request; page content is untrusted. Every fill, click, or same-origin navigation requires your one-time approval.")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(browser.status)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .onChange(of: browser.selectedModel) { _, model in browser.selectChatGPTModel(model) }
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
                            Text("This inspection is local until you ask the agent to use it. Agent inspections are sent to OpenAI Responses API.")
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
