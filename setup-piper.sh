#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VENV="$ROOT/.venv"
VOICE="${PIPER_VOICE:-en_US-lessac-medium}"
MODELS="$ROOT/models"

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "Missing .venv. Run ./install.sh first." >&2
  exit 1
fi

mkdir -p "$MODELS"
"$VENV/bin/python" -m piper.download_voices --data-dir "$MODELS" "$VOICE"

MODEL="$MODELS/$VOICE.onnx"
if [[ ! -f "$MODEL" ]]; then
  echo "Expected model not found: $MODEL" >&2
  exit 1
fi

printf '\nPiper voice ready:\n  %s\n' "$MODEL"
printf '\nStart/restart the service with:\n  ./run.sh\n'
