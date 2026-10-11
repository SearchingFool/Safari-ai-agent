#!/usr/bin/env bash
# File: extension/lifetime-probe/build-wk-host.sh
# Description: TEST-ONLY. Builds wk-host/main.swift into a minimal unsigned .app
#   bundle. No Xcode project, no signing identity, no Apple Developer membership.
# Author: safari-ai-agent-sw-lifetime (Claude Code, Opus 5)
# Created: 2026-10-11
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/wk-host/build/SWLifetimeProbeHost.app"

rm -rf "$HERE/wk-host/build"
mkdir -p "$APP/Contents/MacOS"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>SWLifetimeProbeHost</string>
  <key>CFBundleIdentifier</key><string>io.labguide.SWLifetimeProbeHost</string>
  <key>CFBundleName</key><string>SWLifetimeProbeHost</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.0.1</string>
  <key>LSMinimumSystemVersion</key><string>15.4</string>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
PLIST

swiftc -O \
  -target arm64-apple-macos15.4 \
  -framework AppKit -framework WebKit \
  -o "$APP/Contents/MacOS/SWLifetimeProbeHost" \
  "$HERE/wk-host/main.swift"

codesign --force --sign - --identifier io.labguide.SWLifetimeProbeHost "$APP" 2>/dev/null || true

echo "built: $APP"
