#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STATE="$ROOT/.state"
LEDGER="$STATE/apt-installed-by-us"
PURGE=0

if [[ "${1:-}" == "--purge" ]]; then
  PURGE=1
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--purge]" >&2
  exit 2
fi

echo "Stopping Site Local TTS..."
"$ROOT/stop.sh" || true

if [[ -d "$ROOT/.venv" ]]; then
  echo "Removing private virtual environment..."
  rm -rf -- "$ROOT/.venv"
fi

if [[ -d "$ROOT/models" ]]; then
  echo "Removing downloaded Piper models..."
  rm -rf -- "$ROOT/models"
fi

rm -rf -- "$ROOT/logs" 2>/dev/null || true

packages=()
if [[ -f "$LEDGER" ]]; then
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] && packages+=("$pkg")
  done < "$LEDGER"
fi

if ((${#packages[@]})); then
  echo "Removing only APT packages installed by this project: ${packages[*]}"
  sudo apt remove -y "${packages[@]}"
else
  echo "No APT packages were recorded as installed by this project."
fi

rm -rf -- "$STATE"

echo
echo "Local runtime uninstall complete."
echo "NOTE: Remove 'Site Local TTS' from Tampermonkey/Violentmonkey separately."

if ((PURGE)); then
  echo "Purging source directory: $ROOT"
  parent="$(dirname "$ROOT")"
  base="$(basename "$ROOT")"
  cd "$parent"
  rm -rf -- "$base"
  echo "Source directory removed."
else
  echo "Source files preserved. Use '$0 --purge' to remove this directory too."
fi
