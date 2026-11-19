#!/usr/bin/env bash
# Slyshark first-time setup on macOS/Linux:  ./local/setup.sh [docker|neon|existing] [connection-url]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; WEB="$ROOT/web"; ENV="$WEB/.env.local"
LOCAL_URL="postgresql://slyshark:slyshark@localhost:5433/slyshark"
say() { printf '\n==> %s\n' "$1"; }; die() { printf '    %s\n' "$1" >&2; exit 1; }
start_db() {
  command -v docker >/dev/null || die "Docker isn't installed. Install Docker Desktop, or use Neon."
  docker info >/dev/null 2>&1 || die "Docker isn't running. Start Docker Desktop and try again."
  (cd "$ROOT" && docker compose up -d db)
  for _ in $(seq 60); do [ "$(docker inspect -f '{{.State.Health.Status}}' slyshark-db 2>/dev/null)" = healthy ] && return 0; sleep 1; done
  die "The database didn't become ready (docker logs slyshark-db)."
}
say "Checking Node.js"
command -v node >/dev/null || die "Install Node.js 20.9+ from https://nodejs.org"
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)' || die "Node.js $(node -v) is too old (need 20.9+)."
say "Database"
MODE="${1:-}"; URL="${2:-}"
if [ -f "$ENV" ] && [ -z "$MODE" ]; then
  echo "    web/.env.local exists: keeping it."
  for line in ALLOW_PRIVATE_TARGETS=true TOOL_BUDGET_MS=30000 MAX_SCAN_PORTS=1000 COOKIE_SECURE=false; do
    grep -q "^[[:space:]]*${line%%=*}=" "$ENV" || { printf '\n%s' "$line" >> "$ENV"; echo "    Added ${line}"; }
  done; echo >> "$ENV"
  grep -q '^DATABASE_URL=.*localhost:5433' "$ENV" && start_db
else
  if [ -z "$MODE" ]; then read -rp "    1) Docker local  2) Neon  3) Existing Postgres [1]: " c; MODE=$(case "${c:-1}" in 1) echo docker;; 2) echo neon;; 3) echo existing;; *) echo bad;; esac); fi
  case "$MODE" in
    docker) start_db; URL="$LOCAL_URL";;
    neon|existing) [ -n "$URL" ] || read -rp "    Paste the postgresql:// connection string: " URL;;
    *) die "Choose docker, neon or existing.";;
  esac
  [[ "$URL" =~ ^postgres(ql)?:// ]] || die "That isn't a postgresql:// connection string."
  [ -f "$ENV" ] && cp "$ENV" "$ENV.bak-$(date +%Y%m%d-%H%M%S)"
  URL="$URL" node -e 'const fs=require("fs");const t=fs.readFileSync(process.argv[1],"utf8");fs.writeFileSync(process.argv[2],t.replace(/^DATABASE_URL=.*$/m,()=>"DATABASE_URL="+process.env.URL))' "$WEB/.env.local.example" "$ENV"
  echo "    Saved web/.env.local"
fi
cd "$WEB"
say "Installing packages"; npm ci --no-audit --no-fund || npm install --no-audit --no-fund
say "Creating database tables"; npm run db:migrate
say "Final check"; npm run doctor
printf '\nSetup complete. Start with ./local/start.sh, open http://localhost:3000, sign in as testuser / password123.\n'
