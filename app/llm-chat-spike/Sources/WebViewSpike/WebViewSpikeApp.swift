//
// File: app/llm-chat-spike/Sources/WebViewSpike/WebViewSpikeApp.swift
// Description: The WKWebView session-persistence spike — the decisive test for D-047's in-app
//              browser path. It answers one question and nothing else: does a login performed
//              by hand survive a full app restart? If it does not, an agent hosted in an app is
//              unusable regardless of model, auth or billing, and no later work repairs it.
//              Deliberately costs nothing to run: no API key, no token, no model, no gateway.
// Author: Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04, D-047)
// Created: 2026-10-25
//

import SwiftUI

@main
struct WebViewSpikeApp: App {
    @StateObject private var model = BrowserModel()

    var body: some Scene {
        WindowGroup("WKWebView session persistence — D-047") {
            VStack(spacing: 0) {
                // The instructions live in the app on purpose. A test whose protocol sits in a
                // separate document gets run wrongly, and a wrong run here reads as "the
                // architecture fails" rather than "the tester skipped step 3".
                VStack(alignment: .leading, spacing: 4) {
                    Text("Does a login survive an app restart?").font(.headline)
                    Text("1. Load a site and log in by hand.  2. Press “Check session”.  "
                       + "3. QUIT the app completely — not just close the window.  "
                       + "4. Reopen and press “Check session” BEFORE loading anything.")
                        .font(.caption).foregroundStyle(.secondary)
                    Text("Still logged in → the in-app browser path is viable. "
                       + "Logged out → it is not, and nothing else matters.")
                        .font(.caption).bold()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)

                HStack(spacing: 8) {
                    TextField("address", text: $model.address)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { model.load() }
                    Button("Go") { model.load() }
                    Button("Check session") { Task { await model.refreshCookies() } }
                    Button("Clear data") { Task { await model.clearSiteData() } }
                }
                .padding(.horizontal, 10)

                Text(model.status)
                    .font(.caption)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10).padding(.vertical, 6)

                WebViewHost(webView: model.webView)
            }
            .frame(minWidth: 700, minHeight: 560)
            // Checked at launch, before any navigation: cookies present here came off disk from
            // a previous run, which is exactly the evidence the test is after.
            .task { await model.refreshCookies() }
        }
    }
}
