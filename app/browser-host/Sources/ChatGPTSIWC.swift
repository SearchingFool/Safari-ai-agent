// File: app/browser-host/Sources/ChatGPTSIWC.swift
// Description: Sign in with ChatGPT public-client OAuth, token validation, renewal, and Keychain storage.
// Author: Libor Ballaty <liborballaty@gmail.com>, with Codex (safari-ai-agent-90e45e, 2026-11-11)
// Created: 2026-11-11

import Foundation
import Network
import Security
import CryptoKit

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

struct ChatGPTCredential: Codable, Equatable {
    let subject: String
    let email: String?
    let clientID: String
    let idToken: String
    var accessToken: String
    var refreshToken: String
    var scopes: Set<String>
    var accessExpiresAt: Date
}

enum ChatGPTAuthError: LocalizedError {
    case discovery, callback, state, denied(String), clientRegistration
    case tokenExchange, invalidToken, missingPlanScope, accountChanged
    case keychain(OSStatus), http(Int, String)

    var errorDescription: String? {
        switch self {
        case .discovery: "Could not load Sign in with ChatGPT OpenID configuration."
        case .callback: "Sign in did not return a valid loopback callback."
        case .state: "The sign-in state did not match this authorization attempt."
        case .denied(let reason): "Sign in was not completed: \(reason)"
        case .clientRegistration: "OpenAI did not return an issued OAuth client ID. Start sign-in again."
        case .tokenExchange: "OpenAI did not return a usable token response."
        case .invalidToken: "The ID token could not be verified. Sign in again."
        case .missingPlanScope: "This ChatGPT account did not grant plan-based Responses access. Review and grant the requested scopes."
        case .accountChanged: "The verified account differs from the saved account. Sign out before connecting another account."
        case .keychain(let status): "Secure credential storage failed (Keychain status \(status))."
        case .http(let status, let detail): "OpenAI authentication returned HTTP \(status): \(detail)"
        }
    }
}

private struct OpenIDConfiguration: Decodable {
    let authorization_endpoint: URL
    let token_endpoint: URL
    let jwks_uri: URL
    let revocation_endpoint: URL?
}

private struct ChatGPTTokenResponse: Decodable {
    let access_token: String
    let refresh_token: String?
    let id_token: String?
    let token_type: String
    let expires_in: Double
    let scope: String
}

private struct JWKSet: Decodable {
    struct Key: Decodable {
        let kid: String
        let kty: String
        let n: String?
        let e: String?
        let alg: String?
        let use: String?
    }
    let keys: [Key]
}

private final class ContinuationGate: @unchecked Sendable {
    private let lock = NSLock()
    private var used = false

    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !used else { return false }
        used = true
        return true
    }
}

private enum LoopbackHTTP {
    static let queue = DispatchQueue(label: "com.searchingfool.safari-ai-agent.oauth-loopback")

    static func readRequest(_ connection: NWConnection, accumulated: Data = Data(),
                            completion: @escaping @Sendable (Data?) -> Void) {
        guard accumulated.count <= 16_384 else { completion(nil); return }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4_096) { data, _, _, error in
            guard error == nil, let data else { completion(nil); return }
            var all = accumulated
            all.append(data)
            if let headerEnd = all.range(of: Data("\r\n\r\n".utf8)) {
                completion(Data(all[..<headerEnd.lowerBound]))
            } else {
                readRequest(connection, accumulated: all, completion: completion)
            }
        }
    }

    static func reply(_ connection: NWConnection, status: String, body: String) {
        let bytes = Data(body.utf8)
        let header = "HTTP/1.1 \(status)\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: \(bytes.count)\r\n\r\n"
        connection.send(content: Data(header.utf8) + bytes, completion: .contentProcessed { _ in connection.cancel() })
    }
}

/// Implements OpenAI's documented open-source SIWC flow. It deliberately has no embedded client
/// secret or fixed client ID: first sign-in uses `dynamic_agent_client`, then saves the issued ID.
@MainActor
final class ChatGPTSIWC: ObservableObject {
    @Published private(set) var credential: ChatGPTCredential?
    @Published private(set) var isSigningIn = false

    private let session: URLSession
    private var listener: NWListener?
    private var callbackContinuation: CheckedContinuation<URL, Error>?
    private var callbackTimeout: Task<Void, Never>?

    init(session: URLSession = .shared) {
        self.session = session
        credential = CredentialVault.read()
    }

    var accountLabel: String? { credential?.email ?? credential?.subject }
    var canUseChatGPTPlan: Bool { credential?.scopes.contains("chatgpt.tokens.use.direct") == true }

    func signIn() async throws {
        guard !isSigningIn else { return }
        isSigningIn = true
        defer {
            isSigningIn = false
            callbackTimeout?.cancel()
            callbackTimeout = nil
            listener?.cancel()
            listener = nil
            callbackContinuation = nil
        }

        let discovery = try await loadConfiguration()
        let attempt = SIWCAuthorizationAttempt()
        let callback = try await startLoopbackCallback()
        let existing = credential
        let registeredClient = existing?.clientID ?? "dynamic_agent_client"
        var components = URLComponents(url: discovery.authorization_endpoint, resolvingAgainstBaseURL: false)!
        var items = [
            URLQueryItem(name: "client_id", value: registeredClient),
            URLQueryItem(name: "agent_name_hint", value: "Safari AI Agent"),
            URLQueryItem(name: "ext_agent_host_id", value: Self.stableHostID()),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "redirect_uri", value: callback.absoluteString),
            URLQueryItem(name: "scope", value: Self.requestedScopes.joined(separator: " ")),
            URLQueryItem(name: "resource", value: "https://api.openai.com/v1"),
            URLQueryItem(name: "state", value: attempt.state),
            URLQueryItem(name: "nonce", value: attempt.nonce),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "code_challenge", value: attempt.codeChallenge)
        ]
        if let existing {
            items.append(URLQueryItem(name: "id_token_hint", value: existing.idToken))
            if let email = existing.email { items.append(URLQueryItem(name: "login_hint", value: email)) }
        }
        components.queryItems = items
        guard let authorizationURL = components.url else { throw ChatGPTAuthError.discovery }
        let returnedURL = try await waitForCallback(authorizationURL: authorizationURL)
        let values = URLComponents(url: returnedURL, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let callbackValues = Dictionary(values.compactMap { item in item.value.map { (item.name, $0) } }, uniquingKeysWith: { _, last in last })
        guard callbackValues["state"] == attempt.state else { throw ChatGPTAuthError.state }
        if let error = callbackValues["error"] { throw ChatGPTAuthError.denied(callbackValues["error_description"] ?? error) }
        guard let code = callbackValues["code"], !code.isEmpty,
              let issuedClientID = callbackValues["client_id"],
              !issuedClientID.isEmpty,
              (registeredClient == "dynamic_agent_client" ? issuedClientID != registeredClient : issuedClientID == registeredClient) else {
            throw ChatGPTAuthError.clientRegistration
        }

        let token = try await exchangeCode(code, clientID: issuedClientID, redirectURI: callback.absoluteString,
                                           verifier: attempt.verifier, resource: "https://api.openai.com/v1",
                                           endpoint: discovery.token_endpoint)
        let granted = Set(token.scope.split(whereSeparator: { $0.isWhitespace }).map(String.init))
        guard Self.requiredScopes.isSubset(of: granted) else { throw ChatGPTAuthError.missingPlanScope }
        guard let idToken = token.id_token,
              let identity = try await validateIDToken(idToken, expectedClientID: issuedClientID,
                                                       nonce: attempt.nonce, jwksURL: discovery.jwks_uri) else {
            throw ChatGPTAuthError.invalidToken
        }
        if let existing, existing.subject != identity.subject { throw ChatGPTAuthError.accountChanged }
        guard let refresh = token.refresh_token, !refresh.isEmpty else { throw ChatGPTAuthError.tokenExchange }
        let saved = ChatGPTCredential(subject: identity.subject, email: identity.email, clientID: issuedClientID,
                                      idToken: idToken, accessToken: token.access_token, refreshToken: refresh,
                                      scopes: granted, accessExpiresAt: Date().addingTimeInterval(token.expires_in))
        try CredentialVault.save(saved)
        credential = saved
    }

    func validAccessToken() async throws -> String {
        guard var current = credential else { throw ChatGPTAuthError.missingPlanScope }
        guard Self.requiredScopes.isSubset(of: current.scopes) else { throw ChatGPTAuthError.missingPlanScope }
        if current.accessExpiresAt.timeIntervalSinceNow > 120 { return current.accessToken }
        let config = try await loadConfiguration()
        let body = Self.formBody([
            "grant_type": "refresh_token",
            "client_id": current.clientID,
            "refresh_token": current.refreshToken,
            "resource": "https://api.openai.com/v1"
        ])
        let response = try await tokenRequest(endpoint: config.token_endpoint, body: body)
        let granted = Set(response.scope.split(whereSeparator: { $0.isWhitespace }).map(String.init))
        guard Self.requiredScopes.isSubset(of: granted), let refresh = response.refresh_token, !refresh.isEmpty else {
            throw ChatGPTAuthError.missingPlanScope
        }
        current.accessToken = response.access_token
        current.refreshToken = refresh
        current.scopes = granted
        current.accessExpiresAt = Date().addingTimeInterval(response.expires_in)
        try CredentialVault.save(current)
        credential = current
        return current.accessToken
    }

    func signOut() async -> Bool {
        guard let current = credential else { return true }
        var revoked = false
        do {
            let config = try await loadConfiguration()
            guard let endpoint = config.revocation_endpoint else { throw ChatGPTAuthError.discovery }
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.httpBody = Self.formBody(["token": current.refreshToken,
                                              "token_type_hint": "refresh_token",
                                              "client_id": current.clientID])
            let (_, response) = try await session.data(for: request)
            revoked = (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            revoked = false
        }
        do { try CredentialVault.delete() } catch { return false }
        credential = nil
        return revoked
    }

    private static let requestedScopes = ["openid", "profile", "email", "offline_access", "resource.invoke", "chatgpt.tokens.use.direct"]
    private static let requiredScopes: Set<String> = ["openid", "offline_access", "resource.invoke", "chatgpt.tokens.use.direct"]
    private static let discoveryURL = URL(string: "https://auth.openai.com/.well-known/openid-configuration")!

    private func loadConfiguration() async throws -> OpenIDConfiguration {
        let (data, response) = try await session.data(from: Self.discoveryURL)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let config = try? JSONDecoder().decode(OpenIDConfiguration.self, from: data) else {
            throw ChatGPTAuthError.discovery
        }
        return config
    }

    private func startLoopbackCallback() async throws -> URL {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: .any)
        let server = try NWListener(using: parameters)
        listener = server
        return try await withCheckedThrowingContinuation { continuation in
            let gate = ContinuationGate()
            server.stateUpdateHandler = { [weak self] state in
                switch state {
                case .ready:
                    guard gate.claim(), let port = server.port, let self else { return }
                    Task { @MainActor in
                        let callback = URL(string: "http://127.0.0.1:\(port.rawValue)/auth/callback")!
                        self.startReceivingCallbacks(from: server)
                        continuation.resume(returning: callback)
                    }
                case .failed(let error):
                    guard gate.claim() else { return }
                    continuation.resume(throwing: error)
                default: break
                }
            }
            server.start(queue: LoopbackHTTP.queue)
        }
    }

    private func startReceivingCallbacks(from server: NWListener) {
        server.newConnectionHandler = { [weak self] connection in
            let owner = self
            connection.start(queue: LoopbackHTTP.queue)
            LoopbackHTTP.readRequest(connection) { requestLine in
                guard let requestLine,
                      let firstLine = String(data: requestLine, encoding: .utf8)?.components(separatedBy: "\r\n").first,
                      let rawTarget = firstLine.split(separator: " ").dropFirst().first,
                      let callbackURL = URL(string: "http://127.0.0.1" + rawTarget) else {
                    LoopbackHTTP.reply(connection, status: "400 Bad Request", body: "Invalid sign-in response.")
                    return
                }
                Task { @MainActor in
                    guard let owner, callbackURL.path == "/auth/callback" else {
                        LoopbackHTTP.reply(connection, status: "404 Not Found", body: "Unknown callback path.")
                        return
                    }
                    owner.callbackContinuation?.resume(returning: callbackURL)
                    owner.callbackContinuation = nil
                    LoopbackHTTP.reply(connection, status: "200 OK", body: "Sign-in returned to Safari AI Agent. You can close this page and return to the app.")
                }
            }
        }
    }

    private func waitForCallback(authorizationURL: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            callbackContinuation = continuation
            callbackTimeout = Task { [weak self] in
                try? await Task.sleep(for: .seconds(300))
                guard !Task.isCancelled else { return }
                self?.callbackContinuation?.resume(throwing: ChatGPTAuthError.callback)
                self?.callbackContinuation = nil
            }
            #if os(iOS)
            UIApplication.shared.open(authorizationURL, options: [:]) { opened in
                if !opened {
                    self.callbackContinuation?.resume(throwing: ChatGPTAuthError.callback)
                    self.callbackContinuation = nil
                }
            }
            #elseif os(macOS)
            guard NSWorkspace.shared.open(authorizationURL) else {
                callbackContinuation?.resume(throwing: ChatGPTAuthError.callback)
                callbackContinuation = nil
                return
            }
            #endif
        }
    }

    private func exchangeCode(_ code: String, clientID: String, redirectURI: String, verifier: String,
                              resource: String, endpoint: URL) async throws -> ChatGPTTokenResponse {
        try await tokenRequest(endpoint: endpoint, body: Self.formBody([
            "grant_type": "authorization_code", "client_id": clientID, "code": code,
            "code_verifier": verifier, "redirect_uri": redirectURI, "resource": resource
        ]))
    }

    private func tokenRequest(endpoint: URL, body: Data) async throws -> ChatGPTTokenResponse {
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ChatGPTAuthError.tokenExchange }
        guard http.statusCode == 200 else {
            let detail = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String ?? ""
            throw ChatGPTAuthError.http(http.statusCode, String(detail.prefix(160)))
        }
        guard let token = try? JSONDecoder().decode(ChatGPTTokenResponse.self, from: data),
              token.token_type.lowercased() == "bearer", !token.access_token.isEmpty,
              token.expires_in > 0 else { throw ChatGPTAuthError.tokenExchange }
        return token
    }

    private func validateIDToken(_ jwt: String, expectedClientID: String, nonce: String,
                                 jwksURL: URL) async throws -> (subject: String, email: String?)? {
        let parts = jwt.split(separator: ".")
        guard parts.count == 3,
              let headerData = Self.base64URLDecode(String(parts[0])),
              let payloadData = Self.base64URLDecode(String(parts[1])),
              let signature = Self.base64URLDecode(String(parts[2])),
              let header = try? JSONSerialization.jsonObject(with: headerData) as? [String: Any],
              header["alg"] as? String == "RS256",
              let keyID = header["kid"] as? String,
              let payload = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
              (payload["iss"] as? String) == "https://auth.openai.com",
              Self.audience(payload["aud"], contains: expectedClientID),
              let expiry = payload["exp"] as? Double, expiry > Date().timeIntervalSince1970,
              let tokenNonce = payload["nonce"] as? String, tokenNonce == nonce,
              let subject = payload["sub"] as? String, !subject.isEmpty else {
            throw ChatGPTAuthError.invalidToken
        }
        let (jwksData, response) = try await session.data(from: jwksURL)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let jwks = try? JSONDecoder().decode(JWKSet.self, from: jwksData),
              let key = jwks.keys.first(where: { $0.kid == keyID && $0.kty == "RSA" && ($0.alg == nil || $0.alg == "RS256") }),
              let modulus = key.n.flatMap(Self.base64URLDecode), let exponent = key.e.flatMap(Self.base64URLDecode) else {
            throw ChatGPTAuthError.invalidToken
        }
        let publicKeyData = Self.rsaPublicKeyDER(modulus: modulus, exponent: exponent)
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass as String: kSecAttrKeyClassPublic,
            kSecAttrKeySizeInBits as String: modulus.count * 8
        ]
        var cfError: Unmanaged<CFError>?
        guard let secKey = SecKeyCreateWithData(publicKeyData as CFData, attributes as CFDictionary, &cfError),
              SecKeyVerifySignature(secKey, .rsaSignatureMessagePKCS1v15SHA256,
                                    Data("\(parts[0]).\(parts[1])".utf8) as CFData,
                                    signature as CFData, &cfError) else { throw ChatGPTAuthError.invalidToken }
        return (subject, payload["email"] as? String)
    }

    private static func audience(_ value: Any?, contains expected: String) -> Bool {
        if let string = value as? String { return string == expected }
        if let strings = value as? [String] { return strings.contains(expected) }
        return false
    }

    private static func stableHostID() -> String {
        let key = "siwcHostID"
        if let existing = UserDefaults.standard.string(forKey: key) { return existing }
        let value = "urn:uuid:\(UUID().uuidString.lowercased())"
        UserDefaults.standard.set(value, forKey: key)
        return value
    }

    private static func formBody(_ values: [String: String]) -> Data {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        let encoded = values.keys.sorted().map { key in
            let k = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
            let v = values[key]!.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
            return "\(k)=\(v)"
        }.joined(separator: "&")
        return Data(encoded.utf8)
    }

    private static func base64URLDecode(_ string: String) -> Data? {
        let replaced = string.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let padded = replaced + String(repeating: "=", count: (4 - replaced.count % 4) % 4)
        return Data(base64Encoded: padded)
    }

    private static func rsaPublicKeyDER(modulus: Data, exponent: Data) -> Data {
        func integer(_ value: Data) -> Data {
            var bytes = [UInt8](value)
            while bytes.first == 0 { bytes.removeFirst() }
            if let first = bytes.first, first & 0x80 != 0 { bytes.insert(0, at: 0) }
            return Data([0x02]) + derLength(bytes.count) + Data(bytes)
        }
        let body = integer(modulus) + integer(exponent)
        return Data([0x30]) + derLength(body.count) + body
    }

    private static func derLength(_ length: Int) -> Data {
        if length < 128 { return Data([UInt8(length)]) }
        var value = length
        var bytes = [UInt8]()
        while value > 0 { bytes.insert(UInt8(value & 0xff), at: 0); value >>= 8 }
        return Data([0x80 | UInt8(bytes.count)] + bytes)
    }
}

private struct SIWCAuthorizationAttempt {
    let state = Self.randomURLSafe(bytes: 32)
    let nonce = Self.randomURLSafe(bytes: 32)
    let verifier = Self.randomURLSafe(bytes: 64)
    var codeChallenge: String {
        let digest = Data(SHA256.hash(data: Data(verifier.utf8)))
        return digest.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    private static func randomURLSafe(bytes: Int) -> String {
        var data = Data(count: bytes)
        let status = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, bytes, $0.baseAddress!) }
        precondition(status == errSecSuccess, "Secure random generation failed")
        return data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

private enum CredentialVault {
    private static let service = "com.searchingfool.safari-ai-agent.chatgpt"
    private static let account = "selected-account"

    static func read() -> ChatGPTCredential? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(ChatGPTCredential.self, from: data)
    }

    static func save(_ credential: ChatGPTCredential) throws {
        let data = try JSONEncoder().encode(credential)
        let attributes: [String: Any] = [kSecValueData as String: data,
                                         kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = baseQuery
            attributes.forEach { insert[$0.key] = $0.value }
            let addStatus = SecItemAdd(insert as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw ChatGPTAuthError.keychain(addStatus) }
        } else if status != errSecSuccess { throw ChatGPTAuthError.keychain(status) }
    }

    static func delete() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw ChatGPTAuthError.keychain(status) }
    }

    private static var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
}
