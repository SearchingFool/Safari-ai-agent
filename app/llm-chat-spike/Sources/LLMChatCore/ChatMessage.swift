// File: app/llm-chat-spike/Sources/LLMChatCore/ChatMessage.swift
// Description: The conversation turn, and the model identifiers the spike can target.
//              Kept free of UI and transport types so the same value flows from the view model
//              into the wire encoder without translation.
// Author: claude-chatspike (Claude Code, Opus 5)
// Created: 2026-10-14

import Foundation

/// One turn of the conversation. `id` is stable so SwiftUI lists do not re-animate on append.
public struct ChatMessage: Identifiable, Sendable, Equatable {
    public enum Role: String, Sendable, Equatable {
        case user
        case assistant
    }

    public let id: UUID
    public let role: Role
    public var text: String

    public init(id: UUID = UUID(), role: Role, text: String) {
        self.id = id
        self.role = role
        self.text = text
    }
}

/// Model ids this spike targets.
///
/// `default` is Sonnet 5 rather than Opus 5 on purpose: this is a throwaway interface test and
/// API usage is metered, so the cheaper current-generation model is the honest default. Switching
/// is a one-line change — pass `AnthropicModel.opus` to `AnthropicClient`.
public enum AnthropicModel {
    public static let `default` = sonnet
    public static let sonnet = "claude-sonnet-5"
    public static let opus = "claude-opus-5"
    public static let haiku = "claude-haiku-4-5-20251001"
}

/// A successful reply, plus the correlation and cost handles that came back with it.
public struct ChatReply: Sendable, Equatable {
    public let text: String
    public let requestId: String?
    public let inputTokens: Int?
    public let outputTokens: Int?
    public let stopReason: String?

    public init(
        text: String,
        requestId: String? = nil,
        inputTokens: Int? = nil,
        outputTokens: Int? = nil,
        stopReason: String? = nil
    ) {
        self.text = text
        self.requestId = requestId
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.stopReason = stopReason
    }
}
