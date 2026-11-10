#!/bin/bash
# File: app/browser-host/Tests/run-gateway-bridge-test.sh
# Description: Runs the Swift iOS app against a temporary localhost HTTPS gateway and disposable iPad simulator.
# Author: Libor Ballaty, with Codex (swift-alternate seat, 2026-11-10)
# Created: 2026-11-10

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
device_type="${SWIFT_TEST_DEVICE_TYPE:-com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-16GB}"
runtime="${SWIFT_TEST_RUNTIME_ID:-com.apple.CoreSimulator.SimRuntime.iOS-26-3}"
tls_port=4049
gateway_port=4048
control_port=4047

for port in "$tls_port" "$gateway_port" "$control_port"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Temporary Swift gateway test port $port is already in use." >&2
    exit 2
  fi
done

fixture_dir="$(mktemp -d /tmp/SafariAIAgentSwiftBridgeFixture.XXXXXX)"
simulator_id=""
fixture_pid=""
cleanup() {
  if [[ -n "$fixture_pid" ]]; then
    kill "$fixture_pid" >/dev/null 2>&1 || true
    for attempt in {1..20}; do
      kill -0 "$fixture_pid" >/dev/null 2>&1 || break
      sleep 0.1
    done
    if kill -0 "$fixture_pid" >/dev/null 2>&1; then kill -KILL "$fixture_pid" >/dev/null 2>&1 || true; fi
    wait "$fixture_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$simulator_id" ]]; then
    xcrun simctl shutdown "$simulator_id" >/dev/null 2>&1 || true
    xcrun simctl delete "$simulator_id" >/dev/null 2>&1 || true
  fi
  rm -f "$fixture_dir/server.log"
  rm -f "$fixture_dir/root.crt"
  rm -f "$fixture_dir/server.key"
  rm -f "$fixture_dir/device-id"
  rmdir "$fixture_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT

xcrun simctl create "Swift Gateway Bridge Test" "$device_type" "$runtime" >"$fixture_dir/device-id"
simulator_id="$(cat "$fixture_dir/device-id")"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$fixture_dir/server.key" \
  -out "$fixture_dir/root.crt" -days 1 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1

xcrun simctl boot "$simulator_id"
xcrun simctl bootstatus "$simulator_id" -b
xcrun simctl keychain "$simulator_id" add-root-cert "$fixture_dir/root.crt"

export SWIFT_TEST_TLS_PORT="$tls_port"
export SWIFT_TEST_GATEWAY_PORT="$gateway_port"
export SWIFT_TEST_GATEWAY_ORIGIN="https://127.0.0.1:$tls_port"
export SWIFT_TEST_DEVICE_TOKEN="$(printf 'a%.0s' {1..48})"
export SWIFT_TEST_CERT="$fixture_dir/root.crt"
export SWIFT_TEST_KEY="$fixture_dir/server.key"
export SWIFT_TEST_PAGE="$repo_root/app/browser-host/Tests/GatewayHTTPSFixture.html"

node "$repo_root/app/browser-host/Tests/GatewayHTTPSFixture.mjs" >"$fixture_dir/server.log" 2>&1 &
fixture_pid=$!
for attempt in {1..40}; do
  if curl --silent --fail --insecure "$SWIFT_TEST_GATEWAY_ORIGIN/health" >/dev/null; then break; fi
  if ! kill -0 "$fixture_pid" >/dev/null 2>&1; then cat "$fixture_dir/server.log" >&2; exit 1; fi
  sleep 0.25
done
curl --silent --fail --insecure "$SWIFT_TEST_GATEWAY_ORIGIN/health" >/dev/null || {
  cat "$fixture_dir/server.log" >&2
  echo "Local HTTPS gateway fixture did not become ready." >&2
  exit 1
}

cd "$repo_root"
test_filter=()
if [[ -n "${SWIFT_TEST_ONLY:-}" ]]; then
  test_filter=(-only-testing:"$SWIFT_TEST_ONLY")
fi
xcodebuild -project app/browser-host/SafariAIAgentHost.xcodeproj \
  -scheme SafariAIAgentHost-iOS \
  -destination "platform=iOS Simulator,id=$simulator_id" \
  -derivedDataPath "$fixture_dir/DerivedData" \
  "${test_filter[@]}" \
  -resultBundlePath "$fixture_dir/TestResults.xcresult" \
  CODE_SIGN_IDENTITY=- test
