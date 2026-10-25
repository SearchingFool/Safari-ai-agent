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

    /// Step 1 of `docs/SWIFT-APP-DESIGN.md` §6, part one: does the web view even EXPOSE WebAuthn?
    /// Entirely inert — it asks the API about itself and starts no ceremony, so it cannot raise a
    /// system sheet. Kept separate from `attemptPasskey()` on purpose: "the API is missing" and
    /// "the API is present but refuses this app" are different findings with different
    /// consequences, and a single button that did both would conflate them.
    func probePasskeyAPI() async {
        let js = """
        (async () => {
          const out = { origin: location.origin, secure: window.isSecureContext };
          out.hasPublicKeyCredential = typeof window.PublicKeyCredential !== 'undefined';
          if (!out.hasPublicKeyCredential) return JSON.stringify(out);
          try {
            out.platformAuthenticator =
              await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          } catch (e) { out.platformAuthenticator = 'threw: ' + e.name; }
          try {
            out.conditionalMediation =
              typeof PublicKeyCredential.isConditionalMediationAvailable === 'function'
                ? await PublicKeyCredential.isConditionalMediationAvailable()
                : 'unsupported';
          } catch (e) { out.conditionalMediation = 'threw: ' + e.name; }
          return JSON.stringify(out);
        })()
        """
        status = await evaluate(js, label: "Passkey API")
    }

    /// Step 1, part two: start a real `navigator.credentials.get()` against the CURRENT page's
    /// origin and report what comes back.
    ///
    /// The expected outcome is a fast `NotAllowedError`: WebAuthn in a third-party `WKWebView`
    /// requires the app to be associated with the relying-party domain (Associated Domains +
    /// `apple-app-site-association` served by that site), which is impossible for sites the
    /// operator does not own. If that is what happens, framing B cannot log into passkey sites and
    /// `docs/SWIFT-APP-DESIGN.md` §4 is confirmed. A ceremony that actually starts would be the
    /// surprising — and much better — result.
    ///
    /// A short timeout is passed so a sheet, if one ever did appear, dismisses itself rather than
    /// wedging the app.
    func attemptPasskey() async {
        let js = """
        (async () => {
          const out = { origin: location.origin, rpId: location.hostname };
          if (typeof window.PublicKeyCredential === 'undefined') {
            out.result = 'no WebAuthn API at all'; return JSON.stringify(out);
          }
          // Recorded because WebKit rejects an unfocused document with the SAME NotAllowedError
          // it uses for a disallowed relying party. Without this field the two are
          // indistinguishable and the result means nothing.
          out.documentFocused = document.hasFocus();
          const challenge = new Uint8Array(32);
          crypto.getRandomValues(challenge);
          const started = Date.now();
          try {
            await navigator.credentials.get({
              publicKey: {
                challenge,
                rpId: location.hostname,
                timeout: 10000,
                userVerification: 'preferred',
                allowCredentials: []
              }
            });
            out.result = 'CEREMONY COMPLETED — a credential was returned';
          } catch (e) {
            out.result = 'rejected: ' + e.name;
            out.message = String(e.message || '').slice(0, 200);
          }
          out.elapsedMs = Date.now() - started;
          return JSON.stringify(out);
        })()
        """
        status = "Attempting a passkey ceremony…"
        status = await evaluate(js, label: "Passkey attempt")
    }

    /// `callAsyncJavaScript` rather than `evaluateJavaScript` because the probes await promises;
    /// `evaluateJavaScript` would hand back an opaque `[object Promise]` and the test would read
    /// as inconclusive when it is not.
    private func evaluate(_ js: String, label: String) async -> String {
        do {
            let value = try await webView.callAsyncJavaScript(
                "return await (\(js));", arguments: [:], in: nil, contentWorld: .page)
            return "\(label): \(value.map { String(describing: $0) } ?? "no result")"
        } catch {
            return "\(label): could not run — \(error.localizedDescription). "
                 + "Load an https:// page first; WebAuthn needs a secure origin."
        }
    }

    /// Runs the whole of step 1 unattended and writes the result to stderr, so the finding is a
    /// reproducible command rather than a report of what somebody saw. Opt-in via
    /// `SPIKE_PASSKEY_PROBE=1`, because it starts a real ceremony and that should never happen to
    /// an operator who only wanted to open the window.
    ///
    /// The watchdog is not decoration: if a system sheet ever DID appear it would block the main
    /// actor and the run would hang forever, which is indistinguishable from a crash. Timing out
    /// loudly is a usable result; hanging is not.
    func runUnattendedPasskeyProbe() async {
        func emit(_ line: String) { FileHandle.standardError.write(Data((line + "\n").utf8)) }

        let watchdog = Task {
            try? await Task.sleep(for: .seconds(45))
            emit("PASSKEY-PROBE: TIMED OUT after 45s — something blocked, most likely a UI sheet.")
            exit(2)
        }

        emit("PASSKEY-PROBE: loading \(address)")
        load()
        // No navigation delegate: the spike has none, and adding one for a diagnostic would
        // change the object under test. Polling `isLoading` is enough for a one-shot probe.
        for _ in 0..<120 {
            try? await Task.sleep(for: .milliseconds(250))
            if !webView.isLoading, webView.url != nil { break }
        }
        emit("PASSKEY-PROBE: loaded \(webView.url?.absoluteString ?? "nothing")")

        await probePasskeyAPI()
        emit("PASSKEY-PROBE: " + status)

        // Focus the app and the web view before the ceremony. WebKit refuses WebAuthn on an
        // unfocused document with the same NotAllowedError it uses for a disallowed relying
        // party, so an unfocused run produces a result that looks like the finding but is not.
        #if canImport(AppKit)
        NSApp.activate(ignoringOtherApps: true)
        webView.window?.makeKeyAndOrderFront(nil)
        webView.window?.makeFirstResponder(webView)
        try? await Task.sleep(for: .seconds(1))
        #endif

        await attemptPasskey()
        emit("PASSKEY-PROBE: " + status)

        watchdog.cancel()
        exit(0)
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
