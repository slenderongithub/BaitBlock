#!/usr/bin/env bash
# Launch the Python NLP backend (app.py) on macOS/Linux.
# Mirrors start.ps1. Pass --offline to avoid any Hugging Face network calls
# once models are cached.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="$ROOT/.cache/huggingface"

export CLICKBAIT_MODEL_CACHE="$CACHE_DIR"
export HF_HOME="$CACHE_DIR"
export TRANSFORMERS_CACHE="$CACHE_DIR"
export SENTENCE_TRANSFORMERS_HOME="$CACHE_DIR"
export TRANSFORMERS_NO_TORCHVISION=1
export HF_HUB_DISABLE_TELEMETRY=1
export HF_HUB_DISABLE_PROGRESS_BARS=1

if [[ "${1:-}" == "--offline" ]]; then
  export HF_HUB_OFFLINE=1
fi

if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PYTHON="$ROOT/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
else
  echo "No Python interpreter found (looked for .venv/bin/python and python3)." >&2
  exit 1
fi

exec "$PYTHON" "$ROOT/app.py"
