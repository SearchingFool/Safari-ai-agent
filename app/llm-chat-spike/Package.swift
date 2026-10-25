// swift-tools-version: 6.0
//
// File: app/llm-chat-spike/Package.swift
// Description: Package manifest for the LLM chat spike — a minimal SwiftUI chat client that
//              proves an app can hold the agent loop itself and talk to a cloud model over
//              plain outbound HTTPS, with no gateway, controller or Mac in the path.
//              LLMChatCore is deliberately UI-free so it is testable without a network or a key.
// Author: claude-chatspike (Claude Code, Opus 5)
// Created: 2026-10-14

import PackageDescription

let package = Package(
    name: "LLMChatSpike",
    platforms: [
        .macOS(.v14),
        .iOS(.v17),
    ],
    products: [
        .library(name: "LLMChatCore", targets: ["LLMChatCore"]),
        .executable(name: "LLMChatSpike", targets: ["LLMChatSpike"]),
        .executable(name: "WebViewSpike", targets: ["WebViewSpike"]),
    ],
    targets: [
        // Transport + wire types + structured errors. No SwiftUI, no URLSession at test time.
        .target(
            name: "LLMChatCore",
            path: "Sources/LLMChatCore"
        ),
        // SwiftUI shell. Thin on purpose: everything worth testing lives in LLMChatCore.
        .executableTarget(
            name: "LLMChatSpike",
            dependencies: ["LLMChatCore"],
            path: "Sources/LLMChatSpike"
        ),
        // D-047's decisive test: does a hand-performed login survive an app restart inside a
        // WKWebView? Separate target on purpose — it shares no code with the chat spike, needs
        // no key, no token and no network beyond the site itself, so it can be run for free
        // before any decision about model billing is made.
        .executableTarget(
            name: "WebViewSpike",
            path: "Sources/WebViewSpike"
        ),
        .testTarget(
            name: "LLMChatCoreTests",
            dependencies: ["LLMChatCore"],
            path: "Tests/LLMChatCoreTests"
        ),
    ]
)
