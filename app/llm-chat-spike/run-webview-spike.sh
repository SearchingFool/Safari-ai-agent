#!/usr/bin/env bash
# File: app/llm-chat-spike/run-webview-spike.sh
# Description: Build the WKWebView session-persistence spike and launch it as a real .app
#   bundle. `swift run` is not usable here: a SwiftPM executable has no bundle, so macOS
#   treats it as a background accessory and - launched from a non-interactive shell - it
#   exits immediately without ever showing a window. That reads as "the spike is broken"
#   when the architecture under test has not been exercised at all, which is the one
#   outcome this spike must never produce.
# Author: Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04, D-047)
# Created: 2026-10-25
set -euo pipefail
cd "$(dirname "$0")"

swift build --product WebViewSpike
BIN="$(swift build --product WebViewSpike --show-bin-path)/WebViewSpike"
[ -x "$BIN" ] || { echo "Build produced no binary at $BIN" >&2; exit 1; }

APP=".build/WebViewSpike.app"
mkdir -p "$APP/Contents/MacOS"
cp -f "$BIN" "$APP/Contents/MacOS/WebViewSpike"

# Minimal Info.plist. NSHighResolutionCapable keeps the web view from rendering blurred,
# which on a test about reading a login page is not cosmetic.
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>WebViewSpike</string>
  <key>CFBundleDisplayName</key><string>WKWebView session spike</string>
  <key>CFBundleIdentifier</key><string>com.searchingfool.webviewspike</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>WebViewSpike</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST

echo "Launching $APP"
echo
echo "  STAGE A - no login needed, and it answers the architectural question:"
echo "    1. Load any ordinary site (most set a cookie on first visit)"
echo "    2. Press 'Check session' - you should see cookies"
echo "    3. Cmd-Q, rerun this script, 'Check session' BEFORE loading anything"
echo "    Cookies still there -> the persistent store survives a restart."
echo
echo "  STAGE B - confirms a real authenticated session survives. Needs a PASSWORD login;"
echo "  a passkey site will not work here (WebAuthn in a third-party WKWebView needs the app"
echo "  to be associated with the domain, which is impossible for sites you do not own)."
echo "    1. Log in by hand on the page that opens"
echo "  2. Press 'Check session' and note the cookie count"
echo "  3. QUIT THE APP COMPLETELY (Cmd-Q) - closing the window is not enough"
echo "  4. Run this script again and press 'Check session' BEFORE loading anything"
echo
echo "  Cookies still there -> the in-app browser path is viable."
echo "  Gone              -> it is not, and nothing else about that path matters."
echo
echo "  Then the negative control: 'Clear data', relaunch, confirm you are logged OUT."
echo "  Without it a non-zero count proves nothing about causation."
echo
open "$APP"
