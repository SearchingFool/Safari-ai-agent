// File: app/browser-host/Package.swift
// Description: Testable Swift package for browser-host gateway protocol validation.
// Author: Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent lead session, 2026-11-10)
// Created: 2026-11-10

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
            exclude: ["BrowserHostModel.swift", "BrowserHostView.swift", "DeviceTokenStore.swift", "SafariAIHostApp.swift"],
            sources: ["GatewayProtocol.swift"]
        ),
        .testTarget(
            name: "BrowserHostProtocolTests",
            dependencies: ["BrowserHostProtocol"],
            path: "Tests"
        )
    ]
)
