// File: app/browser-host/Sources/SafariAIHostApp.swift
// Description: Cross-platform SwiftUI entry point for the Safari AI Agent browser-host proof.
// Author: Libor Ballaty, with Codex (swift-alternate seat, 2026-11-09)
// Created: 2026-11-09

import SwiftUI

@main
struct SafariAIHostApp: App {
    @StateObject private var browser = BrowserHostModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup("Safari AI Agent") {
            BrowserHostView(browser: browser)
                .preferredColorScheme(.light)
                .task {
                    browser.setSceneActive(scenePhase == .active)
                    if browser.isChatGPTSignedIn { await browser.refreshChatGPTModels() }
                }
                .onChange(of: scenePhase) { _, phase in
                    browser.setSceneActive(phase == .active)
                }
        }
    }
}
