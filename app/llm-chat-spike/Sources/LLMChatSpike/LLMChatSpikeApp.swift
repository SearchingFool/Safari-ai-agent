// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/app/llm-chat-spike/Sources/LLMChatSpike/LLMChatSpikeApp.swift
// Description: App entry point. Must not be named main.swift — SwiftUI's @main attribute and an
//              SPM executable's implicit main.swift conflict, and the build fails if both exist.
// Author: claude-chatspike (Claude Code, Opus 5)
// Created: 2026-10-14

import SwiftUI

@main
struct LLMChatSpikeApp: App {
    var body: some Scene {
        WindowGroup("LLM Chat Spike") {
            ChatView()
        }
    }
}
