#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8765}"
cd "$ROOT"
echo ""
echo "  Motion Asset Share — 로컬 미리보기"
echo "  → http://127.0.0.1:${PORT}/"
echo "  (종료: 이 터미널에서 Ctrl+C)"
echo ""
exec python3 -m http.server "$PORT"
