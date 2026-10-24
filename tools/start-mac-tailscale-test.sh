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
# The demo origin is always allowed. SAFARI_EXTRA_ORIGINS deliberately widens the
# allowlist to real third-party sites for generality testing. Every added origin is
# a site whose rendered text browser_inspect will send to the model provider, so
# this is an explicit, logged opt-in and never a default.
allowed_origins="https://$host"
if [[ -n "${SAFARI_EXTRA_ORIGINS:-}" ]]; then
  for extra in ${SAFARI_EXTRA_ORIGINS//,/ }; do
    if [[ ! "$extra" =~ ^https://[A-Za-z0-9.-]+$ ]]; then
      echo "Refusing malformed extra origin: $extra (expected https://host with no path)" >&2
      exit 1
    fi
  done
  allowed_origins="$allowed_origins,$SAFARI_EXTRA_ORIGINS"
  echo "WARNING: allowlist widened beyond the demo to: $SAFARI_EXTRA_ORIGINS"
  echo "WARNING: page text from those sites will be sent to the AI provider when inspected."
  echo "WARNING: do not use this on authenticated, private or sensitive pages."
fi
export PORT=8787 BIND_ADDRESS=127.0.0.1 SAFARI_ALLOWED_ORIGINS="$allowed_origins"

# Per-origin permission mode (D-020/D-026). An origin with no entry defaults to
# read-only, so WITHOUT this the rig connects, reports healthy, and then refuses
# every click - which looks like a bug rather than a policy.
#
# NOTHING is nominated `trusted` automatically any more (2026-10-24). The demo
# origin used to be, on the grounds that it is an inert fixture - but "the rig
# grants itself full permission on startup" is the wrong default to ship, and
# the demo is no longer where an operator is told to practise: the userscript
# matches every site, so they choose their own and set its mode in the control
# panel. The demo remains the automated browser-test fixture, which is its real
# job; those suites start their own gateway and set their own policy, so they
# are unaffected by this.
#
# `ask` is the default here, matching the product default: read freely, confirm
# every action. A site has to be nominated by hand, by name, to get more.
#
#   SAFARI_SITE_POLICY="https://example.com=trusted,https://other.example=fill-only"
#
# Hard ceilings (payment, account deletion, credential and security changes) are
# refused on every site including trusted ones, and no value here can lift them.
if [[ -z "${SAFARI_SITE_POLICY:-}" ]]; then
  SAFARI_SITE_POLICY="https://$host=ask"
  echo "Site policy: nothing is trusted automatically. The demo origin is 'ask' (confirm every action)."
  echo "To practise on your own site, add it in the control panel and choose its permission there."
else
  echo "WARNING: SAFARI_SITE_POLICY overridden: $SAFARI_SITE_POLICY"
  echo "WARNING: a 'trusted' origin lets the agent complete actions there after one approval each."
fi
export SAFARI_SITE_POLICY

# Per-origin FIELD VALUES (D-032). Off everywhere unless named here, because it
# is the one setting that makes the snapshot carry what a form already contains
# rather than only what it is called. That is what makes UPDATING a form
# possible - and it is also a real disclosure, so it is never a default and
# never inferred from `trusted`.
#
#   SAFARI_FIELD_VALUES="https://example.com,https://other.example"
#
# Only an origin already nominated `trusted` may appear: the gateway refuses to
# start otherwise, rather than dropping the entry quietly. Passwords, fields
# sharing a form with a password, payment-card and one-time-code fields and
# hidden inputs are excluded in src/core.js on every site including these, and
# nothing set here can reach them.
#
# Unlike the site policy, the demo origin is NOT opted in by default. The demo
# form carries a password field, so most of it is excluded anyway, and switching
# a disclosure on for the operator is not the launcher's call to make.
if [[ -n "${SAFARI_FIELD_VALUES:-}" ]]; then
  for value_origin in ${SAFARI_FIELD_VALUES//,/ }; do
    if [[ ! "$value_origin" =~ ^https://[A-Za-z0-9.-]+$ ]]; then
      echo "Refusing malformed field-value origin: $value_origin (expected https://host with no path)" >&2
      exit 1
    fi
  done
  echo "WARNING: field VALUES will be reported to the AI for: $SAFARI_FIELD_VALUES"
  echo "WARNING: that is the current contents of ordinary form fields, not just their labels."
  echo "WARNING: passwords, password-form siblings, payment and hidden fields are still never reported."
  export SAFARI_FIELD_VALUES
else
  echo "Field values: off (snapshots say what a field IS, never what it contains)."
fi

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
echo "Diagnostics: every request is classified live above and appended to logs/gateway-diagnostics.jsonl"
echo "  In another Terminal, run: npm run diagnose            # full report with suggested fixes"
echo "                            npm run diagnose -- --since 10m"
echo "Starting PUBLIC HTTPS Tailscale Funnel for temporary, non-sensitive testing."
echo "Press Ctrl+C to stop the foreground gateway and Funnel session."
ts funnel 8787
