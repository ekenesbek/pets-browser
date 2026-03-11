#!/usr/bin/env bash
#
# launch.sh — Start PinchTab with Clawnet proxy credentials
#
# Usage:
#   ./scripts/launch.sh [country] [pinchtab-args...]
#
# Examples:
#   ./scripts/launch.sh                  # Default: US proxy, headless
#   ./scripts/launch.sh de               # German proxy
#   ./scripts/launch.sh us --headed      # US proxy, visible window
#
# Environment:
#   CN_API_URL          — Clawnet API (default: https://api.clawpets.io/clawnet/v1)
#   CN_NO_PROXY         — Set to "1" to skip proxy entirely
#   PINCHTAB_HEADLESS   — "true" (default) or "false"
#   PINCHTAB_PORT       — PinchTab port (default: 9867)

set -euo pipefail

CREDS_FILE="${HOME}/.clawnet/agent-credentials.json"
API_URL="${CN_API_URL:-https://api.clawpets.io/clawnet/v1}"
COUNTRY="${1:-us}"

# Shift country arg if provided, pass rest to pinchtab
if [[ "${1:-}" =~ ^[a-z]{2}$ ]]; then
  shift
fi

# ── Check credentials ────────────────────────────────────────────────────────

if [ ! -f "$CREDS_FILE" ]; then
  echo "[clawnet] No credentials found at $CREDS_FILE"
  echo "  Run: node scripts/postinstall.js   (to register a new agent)"
  echo "  Or:  CN_AGENT_CREDENTIALS=id:secret node scripts/postinstall.js"
  exit 1
fi

AGENT_ID=$(python3 -c "import json,sys; print(json.load(open('$CREDS_FILE'))['agentId'])" 2>/dev/null || jq -r .agentId "$CREDS_FILE" 2>/dev/null)
AGENT_SECRET=$(python3 -c "import json,sys; print(json.load(open('$CREDS_FILE'))['agentSecret'])" 2>/dev/null || jq -r .agentSecret "$CREDS_FILE" 2>/dev/null)

if [ -z "$AGENT_ID" ] || [ -z "$AGENT_SECRET" ]; then
  echo "[clawnet] Could not read agentId/agentSecret from $CREDS_FILE"
  exit 1
fi

echo "[clawnet] Agent: $AGENT_ID"
echo "[clawnet] Country: $COUNTRY"

# ── Verify credentials with Clawnet API ──────────────────────────────────────

export PINCHTAB_AUTO_LAUNCH=1

export CHROME_BIN="${CHROME_BIN:-/Applications/Chromium.app/Contents/MacOS/Chromium}"

if [ "${CN_NO_PROXY:-}" = "1" ]; then
  echo "[clawnet] Proxy disabled (CN_NO_PROXY=1). Starting PinchTab without proxy."
  exec pinchtab "$@"
fi

TOKEN="CN1.${AGENT_ID}.${AGENT_SECRET}"

echo "[clawnet] Verifying credentials..."
CREDS_RESP=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/credentials?country=${COUNTRY}" 2>&1) || {
  echo "[clawnet] WARNING: Could not verify credentials with API."
  echo "  Response: $CREDS_RESP"
  echo "  Starting PinchTab without managed proxy."
  exec pinchtab "$@"
}

SESSION_GRANTED=$(echo "$CREDS_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sessionGranted', False))" 2>/dev/null || echo "false")

if [ "$SESSION_GRANTED" = "False" ] || [ "$SESSION_GRANTED" = "false" ]; then
  UPGRADE_URL=$(echo "$CREDS_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('upgradeUrl', ''))" 2>/dev/null || echo "")
  echo "[clawnet] Session not granted (trial expired or no subscription)."
  if [ -n "$UPGRADE_URL" ]; then
    echo "  Subscribe: $UPGRADE_URL"
  fi
  echo "  Starting PinchTab without proxy."
  exec pinchtab "$@"
fi

echo "[clawnet] Session granted. Proxy active."

# ── Launch PinchTab with proxy ───────────────────────────────────────────────

# The /credentials call rotates the secret — extract newAgentSecret from response
NEW_SECRET=$(echo "$CREDS_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('newAgentSecret', ''))" 2>/dev/null || echo "")

if [ -n "$NEW_SECRET" ]; then
  # Save rotated secret back to credentials file
  python3 -c "
import json
f = '$CREDS_FILE'
d = json.load(open(f))
d['agentSecret'] = '$NEW_SECRET'
json.dump(d, open(f, 'w'), indent=2)
" 2>/dev/null
  echo "[clawnet] Agent secret rotated and saved."
else
  NEW_SECRET="$AGENT_SECRET"
fi

export PROXY_SERVER="https://api.clawpets.io:8443"
export PROXY_USER="${AGENT_ID}|${COUNTRY}"
export PROXY_PASS="${NEW_SECRET}"

export PINCHTAB_AUTO_LAUNCH=1
export CHROME_BIN="${CHROME_BIN:-/Applications/Chromium.app/Contents/MacOS/Chromium}"

echo "[clawnet] PinchTab starting with proxy → $PROXY_SERVER (country: $COUNTRY)"

exec pinchtab "$@"
