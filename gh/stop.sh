#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="$ROOT/.state/server.pid"

if [[ ! -f "$PIDFILE" ]]; then
  echo "Server is not recorded as running."
  exit 0
fi

pid="$(cat "$PIDFILE" 2>/dev/null || true)"

if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
  rm -f "$PIDFILE"
  echo "Removed invalid PID file."
  exit 0
fi

if ! kill -0 "$pid" 2>/dev/null; then
  rm -f "$PIDFILE"
  echo "Removed stale PID file."
  exit 0
fi

cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
if [[ "$cmd" != *"$ROOT/server.py"* ]]; then
  echo "Refusing to kill PID $pid because it does not appear to be this project's server." >&2
  exit 1
fi

kill "$pid"

for _ in {1..30}; do
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PIDFILE"
    echo "Server stopped."
    exit 0
  fi
  sleep 0.1
done

echo "Server did not stop cleanly; sending SIGKILL." >&2
kill -9 "$pid" 2>/dev/null || true
rm -f "$PIDFILE"
