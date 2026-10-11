#!/usr/bin/env bash
# File: extension/lifetime-probe/make-probe-xcode-project.sh
# Description: TEST-ONLY. Generates and builds the service-worker lifetime probe
#   as a Safari Web Extension, using the same converter flow as
#   extension/make-xcode-project.sh. Separate app and bundle id so it can never
#   be confused with, or installed over, the real Safari AI Agent extension.
# Author: safari-ai-agent-sw-lifetime (Claude Code, Opus 5)
# Created: 2026-10-11
#
# !!! THIS BUILDS A MEASUREMENT HARNESS, NOT A PRODUCT. See
# !!! docs/SERVICE-WORKER-LIFETIME.md.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/xcode"
# Same constraint as the real script: BUNDLE_ID must end in exactly APP_NAME, or
# ValidateEmbeddedBinary fails because the appex id is "<bundle-id>.Extension".
APP_NAME="SWLifetimeProbe"
BUNDLE_ID="io.labguide.SWLifetimeProbe"

echo "==> Clearing previous generated probe project"
rm -rf "$OUT"
mkdir -p "$OUT"

echo "==> Running safari-web-extension-converter"
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

if [[ "${1:-}" == "--no-build" ]]; then
  echo "==> Skipping build (--no-build)."
  exit 0
fi

echo "==> Building unsigned"
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
