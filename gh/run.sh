#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STATE="$ROOT/.state"
PIDFILE="$STATE/server.pid"
PY="$ROOT/.venv/bin/python"

mkdir -p "$STATE"

if [[ ! -x "$PY" ]]; then
  echo "Missing .venv. Run ./install.sh first." >&2
  exit 1
fi

if [[ -f "$PIDFILE" ]]; then
  oldpid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ "$oldpid" =~ ^[0-9]+$ ]] && kill -0 "$oldpid" 2>/dev/null; then
    echo "Server already appears to be running as PID $oldpid" >&2
    exit 1
  fi
  rm -f "$PIDFILE"
fi

export SITE_LOCAL_TTS_PIDFILE="$PIDFILE"
exec "$PY" "$ROOT/server.py"
