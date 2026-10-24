// File: app/llm-chat-spike/Tests/LLMChatCoreTests/AnthropicClientTests.swift
// Description: Request/response/error coverage for AnthropicClient using an injected transport,
//              so the whole path is exercised with no network call and no API key. Covers the
//              failure modes that actually happen in the field — a rejected key, a rate limit, a
//              200 with an unexpected body — not just the happy path.
// Author: claude-chatspike (Claude Code, Opus 5)
// Created: 2026-10-14

import Foundation
import Testing
@testable import LLMChatCore

// MARK: - Helpers

private func response(_ status: Int, headers: [String: String] = [:]) -> HTTPURLResponse {
    HTTPURLResponse(
        url: AnthropicClient.endpoint,
        statusCode: status,
        httpVersion: "HTTP/1.1",
        headerFields: headers
    )!
}

private func client(
    apiKey: String = "test-key-not-real",
    model: String = AnthropicModel.default,
    responder: @escaping @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)
) -> AnthropicClient {
    AnthropicClient(apiKey: apiKey, model: model, transport: responder)
}

private let oneUserTurn = [ChatMessage(role: .user, text: "Say hello.")]

/// Lock-guarded flag. A plain captured `var` cannot be mutated from a `@Sendable` transport
/// closure under Swift 6 strict concurrency, so observing "was the transport reached?" needs a
/// Sendable box rather than local mutable state.
private final class CallFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false

    func mark() {
        lock.lock()
        value = true
        lock.unlock()
    }

    var wasCalled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return value
    }
}

// MARK: - Request shaping

@Test("Request carries the auth header, pinned API version and JSON content type")
func requestHeaders() throws {
    let subject = AnthropicClient(apiKey: "key-abc", transport: { _ in
        (Data(), response(200))
    })
    let request = try subject.buildRequest(oneUserTurn)

    #expect(request.url == AnthropicClient.endpoint)
    #expect(request.httpMethod == "POST")
    #expect(request.value(forHTTPHeaderField: "x-api-key") == "key-abc")
    #expect(request.value(forHTTPHeaderField: "anthropic-version") == AnthropicClient.apiVersion)
    #expect(request.value(forHTTPHeaderField: "content-type") == "application/json")
}

@Test("Request body sends the full history in order, so the stateless API sees the conversation")
func requestBodyCarriesHistory() throws {
    let subject = AnthropicClient(apiKey: "k", model: AnthropicModel.opus, transport: { _ in
        (Data(), response(200))
    })
    let history = [
        ChatMessage(role: .user, text: "first"),
        ChatMessage(role: .assistant, text: "second"),
        ChatMessage(role: .user, text: "third"),
    ]
    let request = try subject.buildRequest(history)
    let body = try #require(request.httpBody)
    let json = try #require(try JSONSerialization.jsonObject(with: body) as? [String: Any])

    #expect(json["model"] as? String == AnthropicModel.opus)
    #expect(json["max_tokens"] as? Int == 1024)

    let messages = try #require(json["messages"] as? [[String: Any]])
    #expect(messages.count == 3)
    #expect(messages[0]["role"] as? String == "user")
    #expect(messages[0]["content"] as? String == "first")
    #expect(messages[1]["role"] as? String == "assistant")
    #expect(messages[2]["content"] as? String == "third")
}

@Test("System prompt is omitted entirely when not set, rather than sent as null")
func systemOmittedWhenNil() throws {
    let subject = AnthropicClient(apiKey: "k", transport: { _ in (Data(), response(200)) })
    let body = try #require(try subject.buildRequest(oneUserTurn).httpBody)
    let json = try #require(try JSONSerialization.jsonObject(with: body) as? [String: Any])
    #expect(json["system"] == nil)
}

// MARK: - Success

@Test("A normal reply yields its text, request id and token counts")
func successReply() async throws {
    let payload = """
    {
      "content": [{"type": "text", "text": "Hello there."}],
      "stop_reason": "end_turn",
      "usage": {"input_tokens": 11, "output_tokens": 4}
    }
    """.data(using: .utf8)!

    let subject = client { _ in
        (payload, response(200, headers: ["request-id": "req_abc123"]))
    }

    let reply = try await subject.send(oneUserTurn)
    #expect(reply.text == "Hello there.")
    #expect(reply.requestId == "req_abc123")
    #expect(reply.inputTokens == 11)
    #expect(reply.outputTokens == 4)
    #expect(reply.stopReason == "end_turn")
}

@Test("Multiple text blocks are concatenated, and non-text blocks are ignored")
func concatenatesTextBlocks() async throws {
    let payload = """
    {
      "content": [
        {"type": "text", "text": "part one "},
        {"type": "thinking"},
        {"type": "text", "text": "part two"}
      ],
      "stop_reason": "end_turn",
      "usage": {"input_tokens": 1, "output_tokens": 2}
    }
    """.data(using: .utf8)!

    let subject = client { _ in (payload, response(200)) }
    let reply = try await subject.send(oneUserTurn)
    #expect(reply.text == "part one part two")
    #expect(reply.requestId == nil)
}

// MARK: - Failure modes

@Test("An empty key fails before any network call is attempted")
func missingKeyShortCircuits() async {
    let flag = CallFlag()
    let subject = AnthropicClient(apiKey: "", transport: { _ in
        flag.mark()
        return (Data(), response(200))
    })

    await #expect(throws: SpikeError(
        code: .missingCredential,
        message: "No API key. Set ANTHROPIC_API_KEY or paste a key in the app."
    )) {
        _ = try await subject.send(oneUserTurn)
    }
    #expect(flag.wasCalled == false)
}

@Test("An empty history is rejected locally")
func emptyHistoryRejected() async throws {
    let subject = client { _ in (Data(), response(200)) }
    let error = await #expect(throws: SpikeError.self) {
        _ = try await subject.send([])
    }
    #expect(error?.code == .invalidRequest)
}

@Test("A 401 maps to CREDENTIAL_REJECTED and keeps the provider message and ref")
func rejectedKey() async throws {
    let payload = """
    {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}
    """.data(using: .utf8)!

    let subject = client { _ in
        (payload, response(401, headers: ["request-id": "req_401"]))
    }

    let error = await #expect(throws: SpikeError.self) {
        _ = try await subject.send(oneUserTurn)
    }
    #expect(error?.code == .credentialRejected)
    #expect(error?.statusCode == 401)
    #expect(error?.requestId == "req_401")
    #expect(error?.message.contains("invalid x-api-key") == true)
    // The ref must reach the user-visible string, not just the log.
    #expect(error?.userFacing.contains("req_401") == true)
}

@Test("A 429 maps to RATE_LIMITED")
func rateLimited() async throws {
    let subject = client { _ in (Data(), response(429)) }
    let error = await #expect(throws: SpikeError.self) {
        _ = try await subject.send(oneUserTurn)
    }
    #expect(error?.code == .rateLimited)
}

@Test("A 500 maps to PROVIDER_FAULT")
func providerFault() async throws {
    let subject = client { _ in (Data(), response(503)) }
    let error = await #expect(throws: SpikeError.self) {
        _ = try await subject.send(oneUserTurn)
    }
    #expect(error?.code == .providerFault)
}

@Test("A 200 with an unparseable body is MALFORMED_RESPONSE, not a crash")
func malformedBody() async throws {
    let subject = client { _ in
        ("not json at all".data(using: .utf8)!, response(200, headers: ["request-id": "req_bad"]))
    }
    let error = await #expect(throws: SpikeError.self) {
        _ = try await subject.send(oneUserTurn)
    }
    #expect(error?.code == .malformedResponse)
    #expect(error?.requestId == "req_bad")
}

@Test("A 200 with no text block is EMPTY_RESPONSE and names the stop reason")
func emptyContent() async throws {
    let payload = """
    {"content": [], "stop_reason": "max_tokens", "usage": {"input_tokens": 9, "output_tokens": 0}}
    """.data(using: .utf8)!

    let subject = client { _ in (payload, response(200)) }
    let error = await #expect(throws: SpikeError.self) {
        _ = try await subject.send(oneUserTurn)
    }
    #expect(error?.code == .emptyResponse)
    #expect(error?.message.contains("max_tokens") == true)
}

@Test("A thrown transport error becomes TRANSPORT_FAILURE with no bogus request id")
func transportFailure() async throws {
    struct Offline: Error {}
    let subject = client { _ in throw Offline() }

    let error = await #expect(throws: SpikeError.self) {
        _ = try await subject.send(oneUserTurn)
    }
    #expect(error?.code == .transportFailure)
    #expect(error?.requestId == nil)
    #expect(error?.statusCode == nil)
}

// MARK: - Error surface contract

@Test("Status-to-code mapping is total and stable")
func statusMapping() {
    #expect(SpikeError.code(forStatus: 401) == .credentialRejected)
    #expect(SpikeError.code(forStatus: 403) == .credentialRejected)
    #expect(SpikeError.code(forStatus: 429) == .rateLimited)
    #expect(SpikeError.code(forStatus: 400) == .invalidRequest)
    #expect(SpikeError.code(forStatus: 422) == .invalidRequest)
    #expect(SpikeError.code(forStatus: 500) == .providerFault)
    #expect(SpikeError.code(forStatus: 418) == .providerFault)
}

@Test("userFacing omits the ref cleanly when there is none")
func userFacingWithoutRef() {
    let error = SpikeError(code: .transportFailure, message: "offline")
    #expect(error.userFacing == "TRANSPORT_FAILURE: offline")
    #expect(error.userFacing.contains("ref") == false)
}
