#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
sudo apt update
sudo apt install -y python3 python3-venv espeak-ng
python3 -m venv "$ROOT/.venv"
"$ROOT/.venv/bin/python" -m pip install --upgrade pip
"$ROOT/.venv/bin/python" -m pip install piper-tts
printf '\nBase install complete.\n'
printf 'eSpeak is ready now.\n'
printf 'For the neural Piper button run:\n  ./setup-piper.sh\n'
