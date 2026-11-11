// File: app/browser-host/Tests/ChatGPTSIWCTests.swift
// Description: Tests SIWC client-registration callback handling without network credentials.
// Author: Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent-90e45e, 2026-11-11)
// Created: 2026-11-11

import Foundation
import Network
import Testing
@testable import BrowserHostProtocol

@Suite("Sign in with ChatGPT client registration")
struct ChatGPTSIWCTests {
    @Test("Loopback callback listener starts with its connection handler installed")
    @MainActor
    func loopbackCallbackListenerStarts() async throws {
        let auth = ChatGPTSIWC()
        let callback = try await auth.startLoopbackCallback()
        #expect(callback.scheme == "http")
        #expect(callback.host == "127.0.0.1")
        #expect(callback.path == "/auth/callback")
        #expect(callback.port != nil)
    }

    @Test("Loopback callback rejects peers outside localhost")
    func loopbackEndpointPolicy() {
        let port = NWEndpoint.Port(rawValue: 8080)!
        #expect(LoopbackEndpointPolicy.accepts(.hostPort(host: .ipv4(.loopback), port: port)))
        #expect(LoopbackEndpointPolicy.accepts(.hostPort(host: .ipv6(.loopback), port: port)))
        #expect(!LoopbackEndpointPolicy.accepts(.hostPort(host: NWEndpoint.Host("192.0.2.1"), port: port)))
        #expect(!LoopbackEndpointPolicy.accepts(.hostPort(host: .name("localhost", nil), port: port)))
    }

    @Test("First registration requires and adopts a newly issued client ID")
    func newRegistrationRequiresIssuedClientID() throws {
        #expect(try ChatGPTSIWC.resolveIssuedClientID(callbackClientID: "client-issued-1",
                                                       registeredClientID: "dynamic_agent_client") == "client-issued-1")
        #expect(throws: ChatGPTAuthError.clientRegistration) {
            try ChatGPTSIWC.resolveIssuedClientID(callbackClientID: nil, registeredClientID: "dynamic_agent_client")
        }
        #expect(throws: ChatGPTAuthError.clientRegistration) {
            try ChatGPTSIWC.resolveIssuedClientID(callbackClientID: "dynamic_agent_client",
                                                   registeredClientID: "dynamic_agent_client")
        }
    }

    @Test("Returning authorization reuses the saved client ID when callback omits it")
    func returningAuthorizationMayOmitClientID() throws {
        #expect(try ChatGPTSIWC.resolveIssuedClientID(callbackClientID: nil,
                                                       registeredClientID: "client-issued-1") == "client-issued-1")
        #expect(try ChatGPTSIWC.resolveIssuedClientID(callbackClientID: "client-issued-1",
                                                       registeredClientID: "client-issued-1") == "client-issued-1")
        #expect(throws: ChatGPTAuthError.clientRegistration) {
            try ChatGPTSIWC.resolveIssuedClientID(callbackClientID: "other-client",
                                                   registeredClientID: "client-issued-1")
        }
    }
}
