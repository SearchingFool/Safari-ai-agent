// File: app/browser-host/Sources/GatewayProtocol.swift
// Description: Validates the gateway origin and device-command envelope shared by the browser host.
// Author: Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent lead session, 2026-11-10)
// Created: 2026-11-10

import Foundation

enum GatewayProtocolError: Error, Equatable {
    case invalidGatewayOrigin
    case invalidCommand
    case wrongOrigin
    case expiredCommand
    case unsupportedAction
}

struct GatewayCommandEnvelope {
    let id: String
    let action: String
    let origin: String
    let expiresAtMilliseconds: Double
    let arguments: [String: Any]

    static let supportedActions: Set<String> = [
        "browser_inspect", "browser_verify", "browser_fill", "browser_click", "browser_navigate"
    ]

    static func parse(
        _ value: [String: Any],
        expectedOrigin: String,
        nowMilliseconds: Double = Date().timeIntervalSince1970 * 1_000
    ) throws -> GatewayCommandEnvelope {
        guard let id = value["id"] as? String,
              UUID(uuidString: id) != nil,
              let action = value["action"] as? String,
              let origin = value["origin"] as? String,
              let expiresAt = value["expiresAt"] as? Double else {
            throw GatewayProtocolError.invalidCommand
        }
        guard supportedActions.contains(action) else { throw GatewayProtocolError.unsupportedAction }
        guard origin == expectedOrigin else { throw GatewayProtocolError.wrongOrigin }
        guard expiresAt.isFinite, nowMilliseconds.isFinite, nowMilliseconds < expiresAt else {
            throw GatewayProtocolError.expiredCommand
        }
        let arguments: [String: Any]
        if let rawArguments = value["args"] {
            guard let object = rawArguments as? [String: Any] else { throw GatewayProtocolError.invalidCommand }
            arguments = object
        } else {
            arguments = [:]
        }
        return GatewayCommandEnvelope(
            id: id,
            action: action,
            origin: origin,
            expiresAtMilliseconds: expiresAt,
            arguments: arguments
        )
    }
}

enum GatewayProtocol {
    static func gatewayURL(from text: String) throws -> URL {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              url.scheme?.lowercased() == "https",
              let host = url.host, !host.isEmpty,
              url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else {
            throw GatewayProtocolError.invalidGatewayOrigin
        }
        var components = URLComponents()
        components.scheme = "https"
        components.host = host.lowercased()
        components.port = url.port == 443 ? nil : url.port
        guard let normalized = components.url else { throw GatewayProtocolError.invalidGatewayOrigin }
        return normalized
    }

    static func normalizedOrigin(_ url: URL) -> String? {
        guard let scheme = url.scheme?.lowercased(),
              let host = url.host?.lowercased() else { return nil }
        let usesDefaultPort = (scheme == "https" && url.port == 443) || (scheme == "http" && url.port == 80)
        let port = usesDefaultPort ? "" : (url.port.map { ":\($0)" } ?? "")
        return "\(scheme)://\(host)\(port)"
    }
}

enum GatewayCommandArguments {
    static func validate(action: String, arguments: [String: Any]) throws {
        let keys = Set(arguments.keys)
        switch action {
        case "browser_inspect":
            guard keys.isEmpty else { throw GatewayProtocolError.invalidCommand }
        case "browser_verify":
            guard !keys.isEmpty, keys.isSubset(of: Set(["textIncludes", "urlIncludes"])) else {
                throw GatewayProtocolError.invalidCommand
            }
            for key in keys {
                guard let value = arguments[key] as? String, !value.isEmpty, value.count <= 2_000 else {
                    throw GatewayProtocolError.invalidCommand
                }
            }
        case "browser_fill":
            guard keys == Set(["ref", "value"]),
                  let ref = arguments["ref"] as? String, ref.range(of: "^e[1-9][0-9]{0,2}$", options: .regularExpression) != nil,
                  let value = arguments["value"] as? String, value.utf8.count <= 10_000 else {
                throw GatewayProtocolError.invalidCommand
            }
        case "browser_click":
            guard keys == Set(["ref"]), let ref = arguments["ref"] as? String,
                  ref.range(of: "^e[1-9][0-9]{0,2}$", options: .regularExpression) != nil else {
                throw GatewayProtocolError.invalidCommand
            }
        case "browser_navigate":
            guard keys == Set(["url"]), let raw = arguments["url"] as? String, raw.utf8.count <= 2_048,
                  let url = URL(string: raw), ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                  url.host != nil, url.user == nil, url.password == nil else {
                throw GatewayProtocolError.invalidCommand
            }
        default:
            throw GatewayProtocolError.unsupportedAction
        }
    }
}
