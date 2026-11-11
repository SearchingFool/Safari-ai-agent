// File: app/browser-host/Package.swift
// Description: Testable SIWC and direct Responses clients used by the shared browser-host app.
// Author: Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent-90e45e, 2026-11-11)
// Created: 2026-11-11

// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "SafariAIAgentBrowserHostProtocol",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "BrowserHostProtocol", targets: ["BrowserHostProtocol"])
    ],
    targets: [
        .target(
            name: "BrowserHostProtocol",
            path: "Sources",
            exclude: ["BrowserHostModel.swift", "BrowserHostView.swift", "SafariAIHostApp.swift"],
            sources: ["ChatGPTSIWC.swift", "ChatGPTResponses.swift"]
        ),
        .testTarget(
            name: "BrowserHostProtocolTests",
            dependencies: ["BrowserHostProtocol"],
            path: "Tests",
            exclude: ["SafariAIAgentHostUITests.swift"],
            sources: ["ChatGPTSIWCTests.swift"]
        )
    ]
)
