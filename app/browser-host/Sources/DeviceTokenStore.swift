// File: app/browser-host/Sources/DeviceTokenStore.swift
// Description: Stores the gateway device bearer token in the local Keychain.
// Author: Codex (swift-alternate seat, 2026-11-09)
// Created: 2026-11-09

import Foundation
import Security

enum DeviceTokenStore {
    private static let service = "com.searchingfool.SafariAIAgent.device-token"
    private static let account = "gateway"

    static func read() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) throws {
        guard let data = token.data(using: .utf8) else { throw TokenStoreError.encoding }
        let query = baseQuery
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            attributes.forEach { insert[$0.key] = $0.value }
            let addStatus = SecItemAdd(insert as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw TokenStoreError.keychain(addStatus) }
        } else if status != errSecSuccess {
            throw TokenStoreError.keychain(status)
        }
    }

    static func delete() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw TokenStoreError.keychain(status)
        }
    }

    private static var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }
}

enum TokenStoreError: LocalizedError {
    case encoding
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .encoding: "Could not encode the device token."
        case .keychain(let status): "Keychain operation failed (status \(status))."
        }
    }
}
