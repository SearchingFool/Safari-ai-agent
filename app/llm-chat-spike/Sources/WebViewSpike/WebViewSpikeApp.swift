//
// File: app/llm-chat-spike/Sources/WebViewSpike/WebViewSpikeApp.swift
// Description: The WKWebView session-persistence spike — the decisive test for D-047's in-app
//              browser path. It answers one question and nothing else: does a login performed
//              by hand survive a full app restart? If it does not, an agent hosted in an app is
//              unusable regardless of model, auth or billing, and no later work repairs it.
//              Deliberately costs nothing to run: no API key, no token, no model, no gateway.
// Author: Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04, D-047)
// Created: 2026-10-25
//

import SwiftUI

#if canImport(AppKit)
import AppKit

/// A SwiftPM executable has no .app bundle, so macOS launches it as a background accessory:
/// the process runs, the window exists, and nothing ever appears on screen. Promoting the
/// activation policy at launch is what makes it a normal, focusable app. Without this the
/// spike looks broken when it is merely invisible — which is a false negative on a test whose
/// entire purpose is to produce a trustworthy yes or no.
final class SpikeAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
#endif

/// `swift run` launches a bundle-less binary, which macOS refuses to show a window for. Rather
/// than require a separate launcher script that nobody will remember, the binary detects that
/// it is unbundled, wraps ITSELF in a minimal .app, opens that, and exits. The re-launched copy
/// runs inside a bundle, so `bundleIdentifier` is non-nil and it proceeds normally — no
/// recursion. This exists because the operator ran `swift run` six times and saw nothing: a
/// command people actually type should work, not be corrected.
#if canImport(AppKit)
@MainActor
func relaunchInsideBundleIfNeeded() -> Bool {
    guard Bundle.main.bundleIdentifier == nil else { return false }   // already bundled
    let exe = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
    let app = exe.deletingLastPathComponent().appendingPathComponent("WebViewSpike.app")
    let macos = app.appendingPathComponent("Contents/MacOS")
    let fm = FileManager.default
    do {
        try fm.createDirectory(at: macos, withIntermediateDirectories: true)
        let dest = macos.appendingPathComponent("WebViewSpike")
        if fm.fileExists(atPath: dest.path) { try fm.removeItem(at: dest) }
        try fm.copyItem(at: exe, to: dest)
        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0"><dict>
          <key>CFBundleName</key><string>WebViewSpike</string>
          <key>CFBundleIdentifier</key><string>com.searchingfool.webviewspike</string>
          <key>CFBundleExecutable</key><string>WebViewSpike</string>
          <key>CFBundlePackageType</key><string>APPL</string>
          <key>CFBundleVersion</key><string>1</string>
          <key>NSHighResolutionCapable</key><true/>
        </dict></plist>
        """
        try plist.write(to: app.appendingPathComponent("Contents/Info.plist"), atomically: true, encoding: .utf8)
        // `open` detaches, which is right for a human but wrong for the unattended probe: it
        // would discard the probe's stderr and drop the environment that switches it on. So in
        // probe mode the bundled copy is executed DIRECTLY and waited on — still inside the
        // bundle, so `bundleIdentifier` is non-nil and WebAuthn is not judged on an unbundled
        // process, which would be a confounded result rather than a finding.
        let probing = ProcessInfo.processInfo.environment["SPIKE_PASSKEY_PROBE"] == "1"
        let child = Process()
        if probing {
            child.executableURL = dest
        } else {
            child.executableURL = URL(fileURLWithPath: "/usr/bin/open")
            child.arguments = [app.path]
        }
        try child.run()
        if probing {
            child.waitUntilExit()
            exit(child.terminationStatus)
        }
        FileHandle.standardError.write(Data("Launched \(app.lastPathComponent) — window should appear.\n".utf8))
        return true
    } catch {
        FileHandle.standardError.write(Data("Could not self-bundle: \(error)\n".utf8))
        return false
    }
}
#endif

@main
struct WebViewSpikeApp: App {
    init() {
        #if canImport(AppKit)
        if MainActor.assumeIsolated({ relaunchInsideBundleIfNeeded() }) { exit(0) }
        #endif
    }

    @StateObject private var model = BrowserModel()
    #if canImport(AppKit)
    @NSApplicationDelegateAdaptor(SpikeAppDelegate.self) private var appDelegate
    #endif

    var body: some Scene {
        WindowGroup("WKWebView session persistence — D-047") {
            VStack(spacing: 0) {
                // The instructions live in the app on purpose. A test whose protocol sits in a
                // separate document gets run wrongly, and a wrong run here reads as "the
                // architecture fails" rather than "the tester skipped step 3".
                VStack(alignment: .leading, spacing: 4) {
                    Text("Does a login survive an app restart?").font(.headline)
                    Text("1. Load a site and log in by hand.  2. Press “Check session”.  "
                       + "3. QUIT the app completely — not just close the window.  "
                       + "4. Reopen and press “Check session” BEFORE loading anything.")
                        .font(.caption).foregroundStyle(.secondary)
                    Text("Still logged in → the in-app browser path is viable. "
                       + "Logged out → it is not, and nothing else matters.")
                        .font(.caption).bold()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)

                HStack(spacing: 8) {
                    TextField("address", text: $model.address)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { model.load() }
                    Button("Go") { model.load() }
                    Button("Check session") { Task { await model.refreshCookies() } }
                    Button("Clear data") { Task { await model.clearSiteData() } }
                }
                .padding(.horizontal, 10)

                // Step 1 of docs/SWIFT-APP-DESIGN.md §6 — the test that can end the in-app
                // browser path outright, and therefore the one to run before anything is built
                // on top of it. Two buttons, not one: "Passkey API?" is inert and cannot raise a
                // system sheet, while "Try passkey login" starts a real ceremony. Separating them
                // keeps "the API is absent" distinct from "the API refuses this app" — different
                // findings, different consequences.
                HStack(spacing: 8) {
                    Text("Passkeys:").font(.caption).foregroundStyle(.secondary)
                    Button("Passkey API?") { Task { await model.probePasskeyAPI() } }
                    Button("Try passkey login") { Task { await model.attemptPasskey() } }
                    Text("Load an https:// page first. Expected: NotAllowedError — see §4.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 10).padding(.top, 6)

                Text(model.status)
                    .font(.caption)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10).padding(.vertical, 6)

                WebViewHost(webView: model.webView)
            }
            .frame(minWidth: 700, minHeight: 560)
            // Checked at launch, before any navigation: cookies present here came off disk from
            // a previous run, which is exactly the evidence the test is after.
            .task {
                await model.refreshCookies()
                if ProcessInfo.processInfo.environment["SPIKE_PASSKEY_PROBE"] == "1" {
                    // Overridable so the probe can be pointed at a site the operator actually
                    // uses, rather than only at the default.
                    if let url = ProcessInfo.processInfo.environment["SPIKE_PASSKEY_URL"] {
                        model.address = url
                    }
                    await model.runUnattendedPasskeyProbe()
                }
            }
        }
    }
}
