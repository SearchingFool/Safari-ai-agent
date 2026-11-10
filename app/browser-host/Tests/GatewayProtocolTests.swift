// File: app/browser-host/Tests/GatewayProtocolTests.swift
// Description: Tests gateway URL normalization and fail-closed device-command validation.
// Author: Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent lead session, 2026-11-10)
// Created: 2026-11-10

import Foundation
import Testing
@testable import BrowserHostProtocol

@Suite("Gateway protocol validation")
struct GatewayProtocolTests {
    @Test("Accepts and normalizes an HTTPS gateway origin")
    func acceptsHTTPSOrigin() throws {
        let url = try GatewayProtocol.gatewayURL(from: "  https://Gateway.Example:8443/  ")
        #expect(url.absoluteString == "https://gateway.example:8443")
        #expect(try GatewayProtocol.gatewayURL(from: "https://gateway.example:443").absoluteString == "https://gateway.example")
    }

    @Test("Rejects non-origin gateway URLs")
    func rejectsUnsafeGatewayURLs() {
        for candidate in [
            "http://gateway.example", "https://user:secret@gateway.example",
            "https://gateway.example/path", "https://gateway.example/?token=x",
            "https://gateway.example/#fragment", "not a URL"
        ] {
            #expect(throws: GatewayProtocolError.invalidGatewayOrigin) {
                try GatewayProtocol.gatewayURL(from: candidate)
            }
        }
    }

    @Test("Accepts a fresh command for the exact browser origin")
    func acceptsFreshCommand() throws {
        let command = try GatewayCommandEnvelope.parse(
            ["id": "00000000-0000-4000-8000-000000000001", "action": "browser_inspect",
             "origin": "https://site.example", "expiresAt": 20_000.0],
            expectedOrigin: "https://site.example",
            nowMilliseconds: 10_000
        )
        #expect(command.action == "browser_inspect")
        #expect(command.arguments.isEmpty)
    }

    @Test("Rejects malformed, unsupported, wrong-origin and expired commands")
    func rejectsInvalidCommands() {
        let id = "00000000-0000-4000-8000-000000000001"
        let base: [String: Any] = ["id": id, "action": "browser_inspect", "origin": "https://site.example", "expiresAt": 20_000.0]
        #expect(throws: GatewayProtocolError.invalidCommand) {
            try GatewayCommandEnvelope.parse(["action": "browser_inspect"], expectedOrigin: "https://site.example", nowMilliseconds: 10_000)
        }
        #expect(throws: GatewayProtocolError.unsupportedAction) {
            var invalid = base
            invalid["action"] = "browser_delete"
            _ = try GatewayCommandEnvelope.parse(invalid, expectedOrigin: "https://site.example", nowMilliseconds: 10_000)
        }
        #expect(throws: GatewayProtocolError.wrongOrigin) {
            try GatewayCommandEnvelope.parse(base, expectedOrigin: "https://other.example", nowMilliseconds: 10_000)
        }
        #expect(throws: GatewayProtocolError.expiredCommand) {
            try GatewayCommandEnvelope.parse(base, expectedOrigin: "https://site.example", nowMilliseconds: 20_000)
        }
        #expect(throws: GatewayProtocolError.invalidCommand) {
            var invalid = base
            invalid["args"] = "unexpected"
            _ = try GatewayCommandEnvelope.parse(invalid, expectedOrigin: "https://site.example", nowMilliseconds: 10_000)
        }
    }

    @Test("Normalizes page URLs into exact origins")
    func normalizesPageOrigin() {
        #expect(GatewayProtocol.normalizedOrigin(URL(string: "HTTPS://Site.Example:8443/path")!) == "https://site.example:8443")
    }

    @Test("Validates each command's argument schema locally")
    func validatesActionArguments() throws {
        try GatewayCommandArguments.validate(action: "browser_inspect", arguments: [:])
        try GatewayCommandArguments.validate(action: "browser_verify", arguments: ["textIncludes": "Account"])
        try GatewayCommandArguments.validate(action: "browser_fill", arguments: ["ref": "e2", "value": "hello"])
        try GatewayCommandArguments.validate(action: "browser_click", arguments: ["ref": "e2"])
        try GatewayCommandArguments.validate(action: "browser_navigate", arguments: ["url": "https://site.example/path"])

        for (action, arguments) in [
            ("browser_inspect", ["unknown": "x"]),
            ("browser_verify", ["textIncludes": ""]),
            ("browser_verify", ["unexpected": "x"]),
            ("browser_fill", ["ref": "e0", "value": "x"]),
            ("browser_fill", ["ref": "e1", "value": 7]),
            ("browser_click", ["ref": "e1000"]),
            ("browser_navigate", ["url": "javascript:alert(1)"]),
            ("browser_navigate", ["url": "https://user:pass@site.example/"])
        ] as [(String, [String: Any])] {
            #expect(throws: GatewayProtocolError.invalidCommand) {
                try GatewayCommandArguments.validate(action: action, arguments: arguments)
            }
        }
    }
}
