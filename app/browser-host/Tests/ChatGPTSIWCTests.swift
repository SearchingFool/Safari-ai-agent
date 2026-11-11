// File: app/browser-host/Tests/ChatGPTSIWCTests.swift
// Description: Tests SIWC client-registration callback handling without network credentials.
// Author: Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent-90e45e, 2026-11-11)
// Created: 2026-11-11

import Foundation
import Testing
@testable import BrowserHostProtocol

@Suite("Sign in with ChatGPT client registration")
struct ChatGPTSIWCTests {
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
