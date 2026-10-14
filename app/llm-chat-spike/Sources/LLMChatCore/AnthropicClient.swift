// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/app/llm-chat-spike/Sources/LLMChatCore/AnthropicClient.swift
// Description: Minimal Messages API client. One outbound HTTPS POST, no streaming, no SDK, no
//              dependencies. Transport is injectable so the whole request/response/error path is
//              testable without a network call or a real key. This is the hop the spike exists to
//              prove: app -> model, with nothing in between.
// Author: claude-chatspike (Claude Code, Opus 5)
// Created: 2026-10-14

import Foundation

public struct AnthropicClient: Sendable {
    /// Injection seam. Production uses `URLSession`; tests supply a canned response.
    public typealias Transport = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)

    public static let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!
    /// Pinned deliberately — the API version is a contract, not something to float.
    public static let apiVersion = "2023-06-01"

    private let apiKey: String
    private let model: String
    private let maxTokens: Int
    private let system: String?
    private let transport: Transport

    public init(
        apiKey: String,
        model: String = AnthropicModel.default,
        maxTokens: Int = 1024,
        system: String? = nil,
        transport: Transport? = nil
    ) {
        self.apiKey = apiKey
        self.model = model
        self.maxTokens = maxTokens
        self.system = system
        self.transport = transport ?? AnthropicClient.urlSessionTransport
    }

    private static let urlSessionTransport: Transport = { request in
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SpikeError(
                code: .transportFailure,
                message: "Response was not HTTP."
            )
        }
        return (data, http)
    }

    /// Send the whole conversation and return the assistant's reply.
    ///
    /// The full history is sent every time — the Messages API is stateless, so the client is the
    /// only thing that remembers. That is also exactly how the eventual agent loop will work.
    public func send(_ messages: [ChatMessage]) async throws -> ChatReply {
        guard !apiKey.isEmpty else {
            let error = SpikeError(
                code: .missingCredential,
                message: "No API key. Set ANTHROPIC_API_KEY or paste a key in the app."
            )
            SpikeLog.failure(error, context: "send")
            throw error
        }
        guard !messages.isEmpty else {
            let error = SpikeError(code: .invalidRequest, message: "No messages to send.")
            SpikeLog.failure(error, context: "send")
            throw error
        }

        let request = try buildRequest(messages)

        let data: Data
        let http: HTTPURLResponse
        do {
            (data, http) = try await transport(request)
        } catch let error as SpikeError {
            SpikeLog.failure(error, context: "transport")
            throw error
        } catch {
            // Offline, DNS, TLS. No request id exists because nothing was answered.
            let wrapped = SpikeError(
                code: .transportFailure,
                message: "Could not reach the API: \(error.localizedDescription)"
            )
            SpikeLog.failure(wrapped, context: "transport")
            throw wrapped
        }

        // Case-insensitive: header casing is not guaranteed.
        let requestId = http.value(forHTTPHeaderField: "request-id")

        guard (200...299).contains(http.statusCode) else {
            let error = SpikeError(
                code: SpikeError.code(forStatus: http.statusCode),
                message: Self.providerMessage(from: data)
                    ?? "HTTP \(http.statusCode) with no parseable error body.",
                requestId: requestId,
                statusCode: http.statusCode
            )
            SpikeLog.failure(error, context: "http-status")
            throw error
        }

        let decoded: WireResponse
        do {
            decoded = try JSONDecoder().decode(WireResponse.self, from: data)
        } catch {
            let wrapped = SpikeError(
                code: .malformedResponse,
                message: "200 OK but the body did not decode: \(error.localizedDescription)",
                requestId: requestId,
                statusCode: http.statusCode
            )
            SpikeLog.failure(wrapped, context: "decode")
            throw wrapped
        }

        let text = decoded.content
            .filter { $0.type == "text" }
            .compactMap(\.text)
            .joined()

        guard !text.isEmpty else {
            let error = SpikeError(
                code: .emptyResponse,
                message: "Reply contained no text block (stop reason: \(decoded.stop_reason ?? "none")).",
                requestId: requestId,
                statusCode: http.statusCode
            )
            SpikeLog.failure(error, context: "empty-content")
            throw error
        }

        SpikeLog.success(
            requestId: requestId,
            inputTokens: decoded.usage?.input_tokens,
            outputTokens: decoded.usage?.output_tokens
        )

        return ChatReply(
            text: text,
            requestId: requestId,
            inputTokens: decoded.usage?.input_tokens,
            outputTokens: decoded.usage?.output_tokens,
            stopReason: decoded.stop_reason
        )
    }

    // MARK: - Request

    func buildRequest(_ messages: [ChatMessage]) throws -> URLRequest {
        var request = URLRequest(url: Self.endpoint)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(Self.apiVersion, forHTTPHeaderField: "anthropic-version")
        request.setValue("application/json", forHTTPHeaderField: "content-type")

        let body = WireRequest(
            model: model,
            max_tokens: maxTokens,
            system: system,
            messages: messages.map { WireMessage(role: $0.role.rawValue, content: $0.text) }
        )

        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            throw SpikeError(
                code: .invalidRequest,
                message: "Could not encode the request: \(error.localizedDescription)"
            )
        }
        return request
    }

    /// Pull the provider's own error text out of the body when it is shaped as expected.
    static func providerMessage(from data: Data) -> String? {
        guard let envelope = try? JSONDecoder().decode(WireError.self, from: data) else {
            return nil
        }
        return "\(envelope.error.type): \(envelope.error.message)"
    }
}

// MARK: - Wire types

struct WireRequest: Encodable {
    let model: String
    let max_tokens: Int
    let system: String?
    let messages: [WireMessage]
}

struct WireMessage: Encodable {
    let role: String
    let content: String
}

struct WireResponse: Decodable {
    struct Block: Decodable {
        let type: String
        let text: String?
    }

    struct Usage: Decodable {
        let input_tokens: Int?
        let output_tokens: Int?
    }

    let content: [Block]
    let stop_reason: String?
    let usage: Usage?
}

struct WireError: Decodable {
    struct Inner: Decodable {
        let type: String
        let message: String
    }

    let error: Inner
}
