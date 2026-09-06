#!/usr/bin/env bash
set -euo pipefail
sudo apt update
sudo apt install -y python3 espeak-ng
printf '\nInstalled. Start with:\n  ./run.sh\n'
