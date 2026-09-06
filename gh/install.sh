#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STATE="$ROOT/.state"
LEDGER="$STATE/apt-installed-by-us"
VENV="$ROOT/.venv"
APT_PACKAGES=(python3 python3-venv espeak-ng)

mkdir -p "$STATE"
touch "$LEDGER"

is_installed() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q '^install ok installed$'
}

missing=()
for pkg in "${APT_PACKAGES[@]}"; do
  if ! is_installed "$pkg"; then
    missing+=("$pkg")
  fi
done

if ((${#missing[@]})); then
  echo "Installing missing APT packages: ${missing[*]}"
  sudo apt update
  sudo apt install -y "${missing[@]}"
  for pkg in "${missing[@]}"; do
    if is_installed "$pkg" && ! grep -qxF "$pkg" "$LEDGER"; then
      printf '%s\n' "$pkg" >> "$LEDGER"
    fi
  done
else
  echo "Required APT packages already present."
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV"
fi

"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install --upgrade piper-tts

printf '\nInstall complete.\n'
printf 'APT packages added by this installer: '
if [[ -s "$LEDGER" ]]; then
  tr '\n' ' ' < "$LEDGER"
  printf '\n'
else
  printf 'none\n'
fi
printf '\nNext:\n  ./setup-piper.sh\n  ./run.sh\n'
