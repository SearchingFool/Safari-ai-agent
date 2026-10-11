#!/usr/bin/env bash
# File: extension/make-xcode-project.sh
# Description: Generates the Safari Web Extension Xcode project from extension/web
#   using Apple's xcrun safari-web-extension-converter, then builds it unsigned.
#   The generated project is GITIGNORED on purpose - see the note below.
# Author: safari-ai-agent-native-extension (Claude Code, Opus 5)
# Created: 2026-10-11
#
# WHY THE XCODE PROJECT IS GENERATED, NOT COMMITTED
#   The converter bakes a bundle identifier, a development team, and absolute
#   paths into the project. Committing that would pin the repo to one machine and
#   one (not yet existing) Apple Developer team. extension/web is the real source
#   of truth; the Xcode project is a build artifact regenerated in seconds.
#
# Usage:
#   bash extension/make-xcode-project.sh              # generate + build (macOS)
#   bash extension/make-xcode-project.sh --no-build   # generate only
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
OUT="$HERE/xcode"
# APP_NAME must contain no spaces and BUNDLE_ID must end in exactly APP_NAME.
# Verified failure, 2026-10-11: the converter sets the container app's bundle id
# from $(PRODUCT_NAME:rfc1034identifier) but gives the appex the literal
# "<bundle-id>.Extension". With APP_NAME="Safari AI Agent" and
# BUNDLE_ID="io.labguide.safari-ai-agent" the app became
# "io.labguide.Safari-AI-Agent" while the appex became
# "io.labguide.safari-ai-agent.Extension", and ValidateEmbeddedBinary failed with
# "Embedded binary's bundle identifier is not prefixed with the parent app's".
# Keeping the two in sync by construction avoids hand-patching the pbxproj.
# The user-visible extension name comes from manifest.json "name", not from here.
APP_NAME="SafariAIAgent"
BUNDLE_ID="io.labguide.SafariAIAgent"

echo "==> Staging the shared DOM engine from src/core.js"
node "$HERE/build.mjs"

echo "==> Clearing previous generated project"
rm -rf "$OUT"
mkdir -p "$OUT"

echo "==> Running safari-web-extension-converter"
# --macos-only: an iOS target cannot be run on a device without a paid Apple
#   Developer membership, and there is no signing identity on this machine.
#   Drop this flag once a membership exists to get both platforms. NOTE: with
#   both platforms the converter emits two schemes named "<app> (macOS)" and
#   "<app> (iOS)"; with --macos-only there is one scheme named just "<app>".
#   The -scheme argument below must be updated if this flag is removed.
# --no-open / --no-prompt: keep it scriptable and non-interactive.
# --swift: the native host app shell is Swift, matching the installed toolchain.
xcrun safari-web-extension-converter "$HERE/web" \
  --project-location "$OUT" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only \
  --swift \
  --no-open \
  --no-prompt \
  --force

PROJ="$OUT/$APP_NAME/$APP_NAME.xcodeproj"
echo "==> Generated $PROJ"

if [[ "${1:-}" == "--no-build" ]]; then
  echo "==> Skipping build (--no-build)."
  exit 0
fi

echo "==> Building unsigned (no Apple Developer membership required)"
# CODE_SIGNING_ALLOWED=NO is what lets this build with zero signing identities.
# Safari will still load the resulting app in developer mode on this Mac.
xcodebuild \
  -project "$PROJ" \
  -scheme "$APP_NAME" \
  -configuration Debug \
  -derivedDataPath "$OUT/DerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build

echo
echo "==> Built: $OUT/DerivedData/Build/Products/Debug/$APP_NAME.app"
echo "    Next: open that app once, then enable it in"
echo "    Safari > Settings > Extensions (Develop > Allow Unsigned Extensions must be on)."
echo "    Full instructions: $REPO/docs/NATIVE-EXTENSION.md"
