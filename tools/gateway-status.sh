#!/usr/bin/env bash
# File: tools/gateway-status.sh
# Description: Answer "is the gateway up, and if not what do I press?" in one command.
#   Checks every layer the iPad path depends on and prints the next action. Uses
#   FUNCTIONAL checks (does the URL answer?) rather than configuration checks,
#   because `tailscale funnel status` misleads in both directions: it prints
#   "# Funnel on:" when nothing is mapped, and reports "No serve config" while a
#   live process or the Tailscale app is serving correctly. Prints no secrets.
# Author: Libor Ballaty <liborballaty@gmail.com>, with Claude Opus 5 (safari-ai-agent-04, D-048)
# Created: 2026-10-24
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

bold=$'\033[1m'; red=$'\033[31m'; grn=$'\033[32m'; yel=$'\033[33m'; off=$'\033[0m'
ok(){ printf "  %s✓%s %s\n" "$grn" "$off" "$1"; }
bad(){ printf "  %s✗%s %s\n" "$red" "$off" "$1"; }
warn(){ printf "  %s!%s %s\n" "$yel" "$off" "$1"; }

printf "%s\n" "${bold}Safari AI Agent — gateway status${off}"

HOST=$(tailscale status --json 2>/dev/null \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))" 2>/dev/null)

code(){ curl -s -o /dev/null -w "%{http_code}" --max-time "${2:-8}" "$1" 2>/dev/null || echo 000; }

# --- Layer 1: control panel ------------------------------------------------
printf "\n%s\n" "${bold}1. Control panel (Start/Stop)${off}"
PANEL=no
if lsof -nP -iTCP:8788 -sTCP:LISTEN >/dev/null 2>&1; then
  PANEL=yes; ok "running on 127.0.0.1:8788"
else
  bad "NOT running — nothing can start the gateway remotely"
fi

# --- Layer 2: gateway ------------------------------------------------------
printf "\n%s\n" "${bold}2. Gateway${off}"
GW=no
if lsof -nP -iTCP:8787 -sTCP:LISTEN >/dev/null 2>&1; then
  GW=yes
  owner=$(ps -o command= -p "$(lsof -nP -iTCP:8787 -sTCP:LISTEN -t 2>/dev/null | head -1)" 2>/dev/null)
  case "$owner" in
    *control.mjs*) ok "running, owned by the control panel (Start/Stop will work)";;
    *)             warn "running, but NOT started by the panel — the panel refuses to manage a process it did not start. Stop it (Ctrl+C in its Terminal) and press Start in the panel.";;
  esac
else
  bad "NOT running"
fi

# --- Layer 3: public reachability (what the iPad and Claude actually use) ---
printf "\n%s\n" "${bold}3. Public reachability — the only check that matters${off}"
PUB=no
if [ -z "$HOST" ]; then
  bad "cannot resolve the Tailscale hostname — is Tailscale running?"
else
  h=$(code "https://$HOST/health")
  c=$(code "https://$HOST:8443/")
  [ "$h" = "200" ] && { ok "gateway reachable (https://$HOST → 200)"; PUB=yes; } \
                   || bad "gateway NOT reachable publicly (got $h) — Claude and the iPad cannot connect"
  # 401 is the healthy answer here: reachable, asking for the control password.
  [ "$c" = "401" ] || [ "$c" = "200" ] && ok "controls reachable (https://$HOST:8443 → $c)" \
                                       || bad "controls NOT reachable (got $c) — you cannot Start/Stop from the iPad"
  [ "$(code "https://$HOST/help")" = "200" ] && ok "instructions at https://$HOST/help" \
                                             || warn "/help not served — gateway may be running older code"
fi

# --- Layer 4: survives a reboot? -------------------------------------------
printf "\n%s\n" "${bold}4. Comes back by itself?${off}"
if launchctl print-disabled "gui/$(id -u)" 2>/dev/null | grep -q '"com.searchingfool.safari-gateway-control" => disabled'; then
  warn "login agent DISABLED — after a reboot nothing starts, and you must be at the Mac"
else
  [ -f ~/Library/LaunchAgents/com.searchingfool.safari-gateway-control.plist ] \
    && ok "login agent enabled — the panel returns at login" \
    || warn "no login agent installed — run: npm run control:install"
fi
AUTO=$(python3 -c "import json;print(json.load(open('.gateway-control.json')).get('autoStart'))" 2>/dev/null || echo unknown)
[ "$AUTO" = "True" ] && ok "autoStart on — the panel brings the gateway up itself" \
                     || warn "autoStart off — after a restart you must press Start"

# --- Verdict ---------------------------------------------------------------
printf "\n%s\n" "${bold}What to do next${off}"
if [ "$PUB" = yes ] && [ "$GW" = yes ]; then
  printf "  Everything is up. iPad controls: %s\n" "${HOST:+https://$HOST:8443/}"
elif [ "$PANEL" = yes ] && [ "$GW" = no ]; then
  printf "  Open the controls and press Start: %s\n" "${HOST:+https://$HOST:8443/}  (or http://127.0.0.1:8788 on the Mac)"
elif [ "$PANEL" = no ]; then
  cat <<'EOS'
  The control panel is not running, so there is nothing to press.
  On the Mac, either:
      double-click "Safari Gateway.command"
    or
      npm run control
  Then open the controls and press Start.
EOS
else
  printf "  Gateway is up locally but not reachable publicly. Check Tailscale is running, then re-run this.\n"
fi
printf "\n  Full request log:   npm run diagnose\n"
printf "  Credentials live in .env.mac-tailscale and .env.gateway-control (never printed).\n"
