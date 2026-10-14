// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/Safari-ai-agent/app/llm-chat-spike/Sources/LLMChatSpike/ChatView.swift
// Description: The chat surface. Transcript, composer, and a status line that shows the request id
//              and token counts so every run leaves visible evidence. Errors render with their
//              code and ref rather than as a generic failure message.
// Author: claude-chatspike (Claude Code, Opus 5)
// Created: 2026-10-14

import SwiftUI
import LLMChatCore

struct ChatView: View {
    @State private var model = ChatViewModel()

    var body: some View {
        VStack(spacing: 0) {
            transcript
            Divider()
            if !model.hasKey {
                keyPrompt
                Divider()
            }
            statusLine
            Divider()
            composer
        }
        .frame(minWidth: 420, minHeight: 520)
    }

    // MARK: - Transcript

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if model.messages.isEmpty {
                        Text("Ask something to test the round trip.")
                            .foregroundStyle(.secondary)
                            .padding(.top, 24)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                    ForEach(model.messages) { message in
                        bubble(message).id(message.id)
                    }
                    if model.isSending {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text("Thinking…").foregroundStyle(.secondary)
                        }
                    }
                }
                .padding()
            }
            .onChange(of: model.messages.count) {
                if let last = model.messages.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    private func bubble(_ message: ChatMessage) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(message.role == .user ? "You" : "Claude")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(message.text)
                .textSelection(.enabled)
                .padding(10)
                .background(
                    message.role == .user
                        ? Color.accentColor.opacity(0.12)
                        : Color.secondary.opacity(0.10),
                    in: RoundedRectangle(cornerRadius: 10)
                )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Key prompt

    private var keyPrompt: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("API key required")
                .font(.caption.weight(.semibold))
            SecureField("sk-ant-…", text: Binding(
                get: { model.apiKey },
                set: { model.apiKey = $0 }
            ))
            .textFieldStyle(.roundedBorder)
            Text("Held in memory for this run only. Not saved, not logged.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
    }

    // MARK: - Status

    private var statusLine: some View {
        HStack(spacing: 10) {
            if let error = model.lastError {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                Text(error.userFacing)
                    .font(.caption)
                    .textSelection(.enabled)
                    .lineLimit(3)
            } else {
                Text(model.model)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                if let requestId = model.lastRequestId {
                    Text("ref \(requestId)")
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                if let input = model.lastInputTokens, let output = model.lastOutputTokens {
                    Text("\(input) in / \(output) out")
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button("Clear") { model.reset() }
                .buttonStyle(.borderless)
                .font(.caption)
                .disabled(model.messages.isEmpty)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    // MARK: - Composer

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Message", text: Binding(
                get: { model.draft },
                set: { model.draft = $0 }
            ), axis: .vertical)
            .textFieldStyle(.roundedBorder)
            .lineLimit(1...5)
            .onSubmit { Task { await model.send() } }

            Button {
                Task { await model.send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill").font(.title2)
            }
            .buttonStyle(.borderless)
            .disabled(!model.canSend)
            .keyboardShortcut(.return, modifiers: .command)
        }
        .padding(12)
    }
}
