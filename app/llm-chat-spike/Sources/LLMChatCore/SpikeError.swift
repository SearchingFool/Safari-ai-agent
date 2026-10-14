// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/app/llm-chat-spike/Sources/LLMChatCore/SpikeError.swift
// Description: Structured error type for the chat spike. Every failure carries a machine-readable
//              code, a human message, and the provider's request id so a log line and the text the
//              user sees can be pivoted to the same event. Mirrors the repo's observability rule:
//              no bare print() in an error path, and no generic "request failed" without a ref.
// Author: claude-chatspike (Claude Code, Opus 5)
// Created: 2026-10-14

import Foundation
import os

/// A failure from the model call, shaped so the log surface and the user-visible surface agree.
///
/// `requestId` is the provider's `request-id` response header when one was returned. It is the
/// only correlation handle that is meaningful on both sides of the call, so it is carried
/// everywhere rather than logged and dropped.
public struct SpikeError: Error, Sendable, Equatable {
    /// Machine-readable, stable across message wording changes.
    public let code: Code
    /// Human-readable, safe to show.
    public let message: String
    /// Provider request id, when the response carried one.
    public let requestId: String?
    /// HTTP status, when the failure was an HTTP response rather than a transport fault.
    public let statusCode: Int?

    public enum Code: String, Sendable {
        /// No API key was supplied by the operator.
        case missingCredential = "MISSING_CREDENTIAL"
        /// Key present but rejected (401/403).
        case credentialRejected = "CREDENTIAL_REJECTED"
        /// Rate limited (429).
        case rateLimited = "RATE_LIMITED"
        /// Request was malformed (400/422).
        case invalidRequest = "INVALID_REQUEST"
        /// Provider-side fault (5xx).
        case providerFault = "PROVIDER_FAULT"
        /// Could not reach the provider at all — DNS, offline, TLS.
        case transportFailure = "TRANSPORT_FAILURE"
        /// 200 OK but the body did not match the expected shape.
        case malformedResponse = "MALFORMED_RESPONSE"
        /// 200 OK, well-formed, but contained no text block to show.
        case emptyResponse = "EMPTY_RESPONSE"
    }

    public init(code: Code, message: String, requestId: String? = nil, statusCode: Int? = nil) {
        self.code = code
        self.message = message
        self.requestId = requestId
        self.statusCode = statusCode
    }

    /// What to render in the UI. Includes the ref so the operator can quote it.
    public var userFacing: String {
        var line = "\(code.rawValue): \(message)"
        if let requestId {
            line += "  (ref \(requestId))"
        }
        return line
    }

    /// Map an HTTP status onto a code. Keeps the status→code decision in one place.
    public static func code(forStatus status: Int) -> Code {
        switch status {
        case 401, 403: return .credentialRejected
        case 429: return .rateLimited
        case 400, 404, 413, 422: return .invalidRequest
        case 500...599: return .providerFault
        default: return .providerFault
        }
    }
}

/// Logging surface. Separate from the thrown value so an error is always recorded, not only shown.
///
/// Deliberately never takes the API key as a parameter — there is no code path here that could
/// print it even by mistake.
public enum SpikeLog {
    private static let logger = Logger(
        subsystem: "io.labguide.llm-chat-spike",
        category: "model-call"
    )

    public static func failure(_ error: SpikeError, context: String) {
        logger.error("""
            model-call failed context=\(context, privacy: .public) \
            code=\(error.code.rawValue, privacy: .public) \
            status=\(error.statusCode.map(String.init) ?? "-", privacy: .public) \
            request_id=\(error.requestId ?? "-", privacy: .public) \
            message=\(error.message, privacy: .public)
            """)
    }

    public static func success(requestId: String?, inputTokens: Int?, outputTokens: Int?) {
        logger.info("""
            model-call ok \
            request_id=\(requestId ?? "-", privacy: .public) \
            input_tokens=\(inputTokens.map(String.init) ?? "-", privacy: .public) \
            output_tokens=\(outputTokens.map(String.init) ?? "-", privacy: .public)
            """)
    }
}
