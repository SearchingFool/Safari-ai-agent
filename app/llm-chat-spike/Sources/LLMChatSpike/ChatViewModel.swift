// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/app/llm-chat-spike/Sources/LLMChatSpike/ChatViewModel.swift
// Description: Conversation state for the chat spike. Owns the transcript, the in-flight flag and
//              the last error. The API key lives here in memory only — it is never written to
//              disk, never put in UserDefaults and never logged, because this repo has already
//              had one credential-disclosure incident (docs/DECISIONS.md D-046).
// Author: claude-chatspike (Claude Code, Opus 5)
// Created: 2026-10-14

import Foundation
import Observation
import LLMChatCore

@MainActor
@Observable
final class ChatViewModel {
    var messages: [ChatMessage] = []
    var draft: String = ""
    var isSending: Bool = false
    var lastError: SpikeError?

    /// Last reply's correlation + cost, shown in the status line so a run is self-evidencing.
    var lastRequestId: String?
    var lastInputTokens: Int?
    var lastOutputTokens: Int?

    /// In-memory only. Seeded from the environment if the operator exported it.
    var apiKey: String

    var model: String = AnthropicModel.default

    init() {
        self.apiKey = ProcessInfo.processInfo.environment["ANTHROPIC_API_KEY"] ?? ""
    }

    var hasKey: Bool { !apiKey.isEmpty }

    var canSend: Bool {
        !isSending && hasKey && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }

        messages.append(ChatMessage(role: .user, text: text))
        draft = ""
        isSending = true
        lastError = nil

        let client = AnthropicClient(apiKey: apiKey, model: model)
        let history = messages

        do {
            let reply = try await client.send(history)
            messages.append(ChatMessage(role: .assistant, text: reply.text))
            lastRequestId = reply.requestId
            lastInputTokens = reply.inputTokens
            lastOutputTokens = reply.outputTokens
        } catch let error as SpikeError {
            // Already logged inside the client; surface it with its ref intact.
            lastError = error
            lastRequestId = error.requestId
        } catch {
            lastError = SpikeError(
                code: .transportFailure,
                message: error.localizedDescription
            )
        }

        isSending = false
    }

    func reset() {
        messages.removeAll()
        lastError = nil
        lastRequestId = nil
        lastInputTokens = nil
        lastOutputTokens = nil
    }
}
