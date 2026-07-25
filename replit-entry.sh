#!/usr/bin/env bash
# Blur-Shield monorepo entry for Replit / run-anywhere.
# Starts:
#   1. API server on PORT (default 3000)
#   2. Expo dev web / Metro on 8084
# Environment overrides:
#   START_BACKEND_ONLY=1  -> only run api-server
#   START_FRONTEND_ONLY=1 -> only run expo / web
#   EXPO_CMD              -> override default "expo start --web"
set -euo pipefail

cd "$(dirname "$0")"

export PORT="${PORT:-3000}"
export EXPO_PORT="${EXPO_PORT:-8084}"
export NODE_ENV="${NODE_ENV:-production}"

log() { printf '[blurshield] %s\n' "$*"; }

# --- 0. Tooling -------------------------------------------------------------
if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

if ! command -v pnpm >/dev/null 2>&1; then
  log "Installing pnpm..."
  if command -v npm >/dev/null 2>&1; then
    npm i -g pnpm@11
  else
    curl -fsSL https://get.pnpm.io/install.sh | sh - || true
    export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
    export PATH="$PNPM_HOME:$PATH"
  fi
fi

log "node=$(node --version 2>/dev/null || echo missing) pnpm=$(pnpm --version 2>/dev/null || echo missing)"

# --- 1. Install (idempotent) ----------------------------------------------
if [ ! -d node_modules ] || [ ! -d artifacts/api-server/node_modules ] || [ ! -d artifacts/blurshield-ai/node_modules ]; then
  log "Running pnpm install --no-frozen-lockfile (first run / missing modules) ..."
  pnpm install --no-frozen-lockfile --prefer-offline || pnpm install --no-frozen-lockfile
fi

# --- 1b. Python AI runtime bootstrap --------------------------------------
PYTHON_BIN="${BLURSHIELD_PYTHON:-}"
if [ -z "$PYTHON_BIN" ]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python)"
  fi
fi

if [ -n "$PYTHON_BIN" ]; then
  log "Bootstrapping Python AI dependencies with $PYTHON_BIN"
  "$PYTHON_BIN" -m pip install -r artifacts/api-server/requirements-ai.txt >/tmp/blurshield-pip.log 2>&1 || {
    log "Python dependency installation reported issues; continuing so the app can surface the real worker error"
    tail -n 20 /tmp/blurshield-pip.log 2>/dev/null || true
  }
fi

# --- 2. Build api-server (dist/index.mjs is consumable standalone) ------
if [ ! -f artifacts/api-server/dist/index.mjs ]; then
  log "Building api-server dist..."
  (cd artifacts/api-server && pnpm build)
fi

start_api() {
  log "Starting api-server on :$PORT"
  (cd artifacts/api-server && exec node dist/index.mjs)
}

start_expo() {
  log "Starting Expo dev / web on :$EXPO_PORT (background api on :$PORT)"
  export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://127.0.0.1:$PORT}"
  (
    cd artifacts/blurshield-ai
    if [ "${NODE_ENV}" = "production" ] && [ "${REPLIT_DEPLOYMENT:-}" = "1" ]; then
      log "Replit production deployment: serving prebuilt expo web via npx serve"
      if [ -d dist ]; then
        exec npx --yes serve@14 -l "$EXPO_PORT" -s dist
      fi
    fi
    exec npx expo start --web --localhost --port "$EXPO_PORT" --no-dev --minify
  )
}

# --- 3. Orchestration -----------------------------------------------------
if [ "${START_BACKEND_ONLY:-}" = "1" ]; then
  exec "$0" _run_api
elif [ "${START_FRONTEND_ONLY:-}" = "1" ]; then
  exec "$0" _run_expo
fi

case "${1:-}" in
  _run_api)  start_api ;;
  _run_expo) start_expo ;;
  *)
    # Background API + foreground Expo
    trap 'kill $(jobs -p) 2>/dev/null || true' EXIT INT TERM
    PORT="$PORT" "$0" _run_api &
    API_PID=$!
    # Give API a moment to bind before expo starts
    sleep 2
    EXPO_PORT="$EXPO_PORT" "$0" _run_expo &
    EXPO_PID=$!
    log "API pid=$API_PID  Expo pid=$EXPO_PID"
    # Wait forever until one dies
    wait -n || true
    log "A process exited; tearing down"
    kill "$API_PID" "$EXPO_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    ;;
esac
