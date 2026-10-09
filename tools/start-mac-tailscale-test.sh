#!/usr/bin/env bash
# Development-only Mac launcher: bind gateway to loopback and expose via Tailscale Funnel.
# No Apple Developer membership, paid hosting or on-iPad model is required.
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")/.."

for command in node curl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done
if [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 20 ]]; then
  echo "Node.js 20+ is required" >&2
  exit 1
fi

# The macOS App Store edition has its CLI bundled in the application.
if command -v tailscale >/dev/null 2>&1; then
  ts_bin="$(command -v tailscale)"
elif [[ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]]; then
  ts_bin=/Applications/Tailscale.app/Contents/MacOS/Tailscale
else
  echo "Tailscale CLI not found; enable CLI integration or check your installation" >&2
  exit 1
fi
ts() { TAILSCALE_BE_CLI=1 "$ts_bin" "$@"; }

# Discover this Mac's MagicDNS hostname rather than inventing an HTTPS URL.
host="$(ts status --json | node -e '
let raw="";
process.stdin.on("data",s=>raw+=s);
process.stdin.on("end",()=>{
 try {
  const name=String(JSON.parse(raw).Self?.DNSName||"").replace(/\.$/,"").toLowerCase();
  if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+\.ts\.net$/.test(name))process.exit(2);
  process.stdout.write(name);
 }catch{process.exit(2)}
});
')" || { echo "Cannot discover a valid Tailscale MagicDNS hostname" >&2; exit 1; }

# Generated tokens stay on the Mac, excluded from version control via .gitignore.
secrets=.env.mac-tailscale
if [[ -L "$secrets" ]]; then echo "Refusing a symlinked secrets file" >&2; exit 1; fi
if [[ ! -e "$secrets" ]]; then
  node -e 'const {randomBytes}=require("node:crypto");console.log("MCP_CLIENT_TOKEN="+randomBytes(32).toString("hex")+"\nDEVICE_TOKEN="+randomBytes(32).toString("hex"))' > "$secrets"
  chmod 600 "$secrets"
  echo "Generated two credentials in .env.mac-tailscale (gitignored)"
fi
# Upgrade the existing two-token Mac test credentials safely without rotating them.
if [[ "$(wc -l < "$secrets" | tr -d ' ')" == 2 ]] &&
   [[ "$(grep -Ec '^MCP_CLIENT_TOKEN=[a-f0-9]{64}$' "$secrets")" == 1 ]] &&
   [[ "$(grep -Ec '^DEVICE_TOKEN=[a-f0-9]{64}$' "$secrets")" == 1 ]]; then
  node -e 'console.log("DEMO_PASSWORD="+require("node:crypto").randomBytes(32).toString("hex"))' >> "$secrets"
  echo "Generated a separate demo login password; existing tokens were preserved."
fi
chmod 600 "$secrets"
# Refuse arbitrary shell content: exactly three KEY=hex-secret lines are permitted.
if [[ "$(wc -l < "$secrets" | tr -d ' ')" != 3 ]] ||
   [[ "$(grep -Ec '^MCP_CLIENT_TOKEN=[a-f0-9]{64}$' "$secrets")" != 1 ]] ||
   [[ "$(grep -Ec '^DEVICE_TOKEN=[a-f0-9]{64}$' "$secrets")" != 1 ]] ||
   [[ "$(grep -Ec '^DEMO_PASSWORD=[a-f0-9]{64}$' "$secrets")" != 1 ]]; then
  echo "Unexpected secrets file format; refusing to source it" >&2
  exit 1
fi
source "$secrets"
if [[ "$MCP_CLIENT_TOKEN" == "$DEVICE_TOKEN" ]]; then
  echo "MCP and device secrets must be different" >&2
  exit 1
fi

# Do not replace another process listening on the test port.
if ! node -e 'const s=require("node:net").createServer();s.on("error",()=>process.exit(1));s.listen(8787,"127.0.0.1",()=>s.close(()=>process.exit(0)))'; then
  echo "localhost:8787 is already occupied" >&2
  exit 1
fi
export MCP_CLIENT_TOKEN DEVICE_TOKEN DEMO_PASSWORD
export PORT=8787 BIND_ADDRESS=127.0.0.1 SAFARI_ALLOWED_ORIGINS="https://$host"

gateway_pid=""
cleanup() {
  if [[ -n "$gateway_pid" ]]; then
    kill "$gateway_pid" 2>/dev/null || true
    wait "$gateway_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM
node gateway/server.mjs &
gateway_pid=$!
healthy=0
for n in {1..40}; do
  if curl -fsS --max-time 1 http://127.0.0.1:8787/health >/dev/null 2>&1; then healthy=1; break; fi
  if ! kill -0 "$gateway_pid" 2>/dev/null; then break; fi
  sleep 0.2
done
if [[ "$healthy" != 1 ]]; then echo "Gateway failed local health check; Funnel not opened" >&2; exit 1; fi

echo "Gateway health check: PASS"
echo "Claude MCP URL: https://$host/mcp"
echo "iPad test page: https://$host/demo (browser login required)"
echo "Demo username: safari-demo"
echo "Demo password is DEMO_PASSWORD in the local credentials file; never share it."
echo "iPad Remote AI base URL: https://$host"
echo "Credentials location on this Mac: $(pwd)/$secrets"
echo "Use MCP_CLIENT_TOKEN only in Claude's authenticated connector."
echo "Use DEVICE_TOKEN only in the Userscripts Remote AI panel."
echo "Never paste either credential into chat or GitHub."
echo "Starting PUBLIC HTTPS Tailscale Funnel for temporary, non-sensitive testing."
echo "Press Ctrl+C to stop the foreground gateway and Funnel session."
ts funnel 8787
