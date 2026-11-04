#!/usr/bin/env bash
# Munki — one-command start:  ./run.sh  -> http://127.0.0.1:8010
# Optional: export META_API_KEY=... to enable the Meta Model API path
# (https://api.meta.ai/v1, muse-spark-1.3). Without it, all features run
# on labeled deterministic fallbacks, fully offline.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
.venv/bin/pip install -q -r requirements.txt
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8010}"
