/*
 * File: extension/lifetime-probe/wk-host/main.swift
 * Description: TEST-ONLY minimal WebKit host that loads extension/lifetime-probe/web
 *   through the public WKWebExtensionController API (macOS 15.4+). This exists ONLY
 *   because Safari's "Allow unsigned extensions" toggle is behind a Touch ID /
 *   password authorization that an agent cannot and must not satisfy.
 * Author: safari-ai-agent-sw-lifetime (Claude Code, Opus 5)
 * Created: 2026-10-11
 *
 * WHAT THIS DOES AND DOES NOT PROVE
 *   WKWebExtensionController is the SAME WebKit implementation Safari itself uses
 *   for web extensions - the background-content load/unload machinery
 *   (scheduleBackgroundContentToUnload / wakeUpBackgroundContentIfNecessary) lives
 *   in WebKit, not in Safari. So the lifetime numbers produced here are WebKit's.
 *   They are NOT a substitute for Safari.app, because Safari may layer its own
 *   policy on top (app-level backgrounding, App Nap, power state). Every number
 *   obtained this way MUST be labelled "WebKit host, not Safari.app".
 *
 * Usage:
 *   bash extension/lifetime-probe/build-wk-host.sh
 *   extension/lifetime-probe/wk-host/build/SWLifetimeProbeHost.app/Contents/MacOS/SWLifetimeProbeHost <abs path to web/>
 */
import AppKit
import WebKit

final class Delegate: NSObject, NSApplicationDelegate, WKWebExtensionControllerDelegate {
    var controller: WKWebExtensionController?
    var context: WKWebExtensionContext?
    var window: NSWindow?
    var webView: WKWebView?
    var signalSource: DispatchSourceSignal?

    func applicationDidFinishLaunching(_ note: Notification) {
        let args = CommandLine.arguments
        guard args.count > 1 else {
            FileHandle.standardError.write("usage: SWLifetimeProbeHost <resourceBaseURL>\n".data(using: .utf8)!)
            exit(2)
        }
        let base = URL(fileURLWithPath: args[1], isDirectory: true)

        Task { @MainActor in
            do {
                let ext = try await WKWebExtension(resourceBaseURL: base)
                print("loaded manifest v\(ext.manifestVersion) hasBackgroundContent=\(ext.hasBackgroundContent) persistent=\(ext.hasPersistentBackgroundContent)")

                let ctx = WKWebExtensionContext(for: ext)
                // Grant everything up front. A permission prompt would be another
                // human gate, and permission UX is not what is being measured.
                for p in ext.requestedPermissions {
                    ctx.setPermissionStatus(.grantedExplicitly, for: p)
                }
                for pattern in ext.allRequestedMatchPatterns {
                    ctx.setPermissionStatus(.grantedExplicitly, for: pattern)
                }
                if let all = try? WKWebExtension.MatchPattern(string: "<all_urls>") {
                    ctx.setPermissionStatus(.grantedExplicitly, for: all)
                }
                ctx.isInspectable = true
                ctx.inspectionName = "SWLifetimeProbe"

                let config = WKWebExtensionController.Configuration.default()
                let ctrl = WKWebExtensionController(configuration: config)
                ctrl.delegate = self
                try ctrl.load(ctx)
                self.controller = ctrl
                self.context = ctx
                print("extension context loaded; baseURL=\(ctx.baseURL)")

                // A tiny visible window. WebKit treats a controller with no UI
                // oddly in places, and having a real NSWindow keeps the host a
                // normal foreground app so App Nap behaviour is representative.
                let wcfg = WKWebViewConfiguration()
                wcfg.webExtensionController = ctrl
                let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: 480, height: 200), configuration: wcfg)
                let w = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 480, height: 200),
                                 styleMask: [.titled, .closable, .miniaturizable],
                                 backing: .buffered, defer: false)
                w.title = "SW Lifetime Probe Host (TEST ONLY)"
                w.contentView = wv
                w.makeKeyAndOrderFront(nil)
                self.window = w
                self.webView = wv
                wv.load(URLRequest(url: URL(string: "http://127.0.0.1:4037/wake")!))

                // SIGUSR1 reloads the page, which re-runs wake-content.js at
                // document_start and therefore sends a runtime message to the
                // background. That is how message-triggered wake-up latency is
                // measured on demand from a shell, with no GUI interaction.
                signal(SIGUSR1, SIG_IGN)
                let src = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)
                src.setEventHandler { [weak wv] in
                    wv?.load(URLRequest(url: URL(string: "http://127.0.0.1:4037/wake?r=\(Int(Date().timeIntervalSince1970))")!))
                }
                src.resume()
                self.signalSource = src
            } catch {
                FileHandle.standardError.write("FAILED: \(error)\n".data(using: .utf8)!)
                exit(1)
            }
        }
    }

    // Without a window/tab provider WebKit has no browser model; returning an
    // empty set is legal and keeps the background content as the only surface.
    func webExtensionController(_ controller: WKWebExtensionController,
                                openWindowsFor context: WKWebExtensionContext) -> [any WKWebExtensionWindow] { [] }

    func webExtensionController(_ controller: WKWebExtensionController,
                                promptForPermissions permissions: Set<WKWebExtension.Permission>,
                                in tab: (any WKWebExtensionTab)?,
                                for context: WKWebExtensionContext,
                                completionHandler: @escaping (Set<WKWebExtension.Permission>, Date?) -> Void) {
        completionHandler(permissions, nil)
    }
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
