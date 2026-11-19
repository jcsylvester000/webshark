#!/usr/bin/env bash
# Start Slyshark on macOS/Linux:  ./local/start.sh [prod|dev] [port]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; WEB="$ROOT/web"; ENV="$WEB/.env.local"
MODE="${1:-prod}"; PORT="${2:-3000}"; export PORT
[ -f "$ENV" ] || { echo "Run ./local/setup.sh first."; exit 1; }
if grep -q '^DATABASE_URL=.*localhost:5433' "$ENV"; then (cd "$ROOT" && docker compose up -d db >/dev/null); for _ in $(seq 60); do [ "$(docker inspect -f '{{.State.Health.Status}}' slyshark-db 2>/dev/null)" = healthy ] && break; sleep 1; done; fi
cd "$WEB"
[ -d node_modules/next ] || npm install --no-audit --no-fund
npm run db:migrate
npm run doctor
if [ "$MODE" = prod ]; then
  if [ ! -f .next/BUILD_ID ] || [ -n "$(find src public package.json next.config.ts -newer .next/BUILD_ID -type f 2>/dev/null | head -1)" ]; then npm run build; fi
  echo "Slyshark: http://localhost:$PORT  (Ctrl+C to stop)"; exec npx next start -p "$PORT"
else
  echo "Slyshark (dev): http://localhost:$PORT  (Ctrl+C to stop)"; exec npx next dev -p "$PORT"
fi
