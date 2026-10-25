//
// File: app/llm-chat-spike/Sources/WebViewSpike/WebViewHost.swift
// Description: A WKWebView wrapped for SwiftUI on both macOS and iOS, deliberately using the
//              DEFAULT (persistent) website data store. This is the whole point of the spike:
//              the decisive question for the in-app browser path (D-047) is whether a login
//              performed by hand survives a full app restart. A non-persistent store would
//              answer "no" trivially and prove nothing about the architecture.
// Author: Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04, D-047)
// Created: 2026-10-25
//

import SwiftUI
import WebKit

#if canImport(UIKit)
import UIKit
typealias ViewRepresentable = UIViewRepresentable
#else
import AppKit
typealias ViewRepresentable = NSViewRepresentable
#endif

/// Shared across the app so the same web view (and therefore the same session) is reused
/// rather than rebuilt on every SwiftUI redraw — a fresh instance each render would look
/// like a lost session and produce a false negative.
@MainActor
final class BrowserModel: ObservableObject {
    // Defaults to a site that needs no account: Stage A of the test only needs ANY cookie,
    // and a login page implies credentials are required when they are not.
    @Published var address: String = "https://en.wikipedia.org"
    @Published var status: String = "Idle."
    @Published var cookieCount: Int = 0

    let webView: WKWebView

    init() {
        let config = WKWebViewConfiguration()
        // DEFAULT store = on-disk and persistent. `.nonPersistent()` would be an incognito
        // session that cannot survive a relaunch by design.
        config.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: config)
    }

    func load() {
        var text = address.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.contains("://") { text = "https://" + text }
        guard let url = URL(string: text), url.scheme?.hasPrefix("http") == true else {
            status = "Not a usable http(s) address."
            return
        }
        address = text
        webView.load(URLRequest(url: url))
        status = "Loading \(url.host ?? text)…"
    }

    /// Counts cookies the persistent store holds for the current host. This is the measurement:
    /// a logged-in session is cookies on disk, so a non-zero count after a relaunch — before
    /// loading anything — is the thing that decides whether this architecture is viable.
    func refreshCookies() async {
        let host = URL(string: address)?.host
        let all = await webView.configuration.websiteDataStore.httpCookieStore.allCookies()
        let mine = all.filter { cookie in
            guard let host else { return true }
            return host.hasSuffix(cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain)
        }
        cookieCount = mine.count
        status = mine.isEmpty
            ? "No cookies stored for this host yet."
            : "\(mine.count) cookie(s) stored for this host — a session exists on disk."
    }

    /// Deliberately offered, because proving persistence is only half the test: you must be able
    /// to show the count going to zero, or a non-zero count proves nothing about causation.
    func clearSiteData() async {
        let store = webView.configuration.websiteDataStore
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        let records = await store.dataRecords(ofTypes: types)
        await store.removeData(ofTypes: types, for: records)
        cookieCount = 0
        status = "Cleared all website data. Relaunching now should show you logged OUT."
    }
}

struct WebViewHost: ViewRepresentable {
    let webView: WKWebView

    #if canImport(UIKit)
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
    #else
    func makeNSView(context: Context) -> WKWebView { webView }
    func updateNSView(_ view: WKWebView, context: Context) {}
    #endif
}
