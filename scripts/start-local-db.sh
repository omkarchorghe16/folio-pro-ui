#!/usr/bin/env bash
# Starts the local Homebrew PostgreSQL if needed, checks the folio_pro login, and opens pgAdmin.
# Safe to run at any time: it never stops a responding server and never changes data.
set -euo pipefail

readonly FORMULA="postgresql@16"
readonly DB_HOST="localhost"
readonly DB_PORT="${POSTGRES_HOST_PORT:-5432}"
readonly DB_NAME="${POSTGRES_DB:-folio_pro}"
readonly DB_USER="${POSTGRES_USER:-folio_pro}"
readonly WAIT_SECONDS=30

# An IDE's run button may not inherit the shell profile's PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

open_pgadmin=true
case "${1:-}" in
  "") ;;
  --no-open) open_pgadmin=false ;;
  *)
    printf 'Usage: bash scripts/start-local-db.sh [--no-open]\n' >&2
    exit 2
    ;;
esac

if ! command -v brew >/dev/null 2>&1; then
  printf 'Homebrew is required: https://brew.sh\n' >&2
  exit 1
fi

if ! brew list --formula "$FORMULA" >/dev/null 2>&1; then
  printf '%s is not installed. Run: brew install %s\n' "$FORMULA" "$FORMULA" >&2
  exit 1
fi

pg_bin="$(brew --prefix "$FORMULA")/bin"
pg_log="$(brew --prefix)/var/log/${FORMULA}.log"

# Exit status of pg_isready: 0 accepting, 1 still starting up, 2 no response.
server_status() {
  local status=0
  "$pg_bin/pg_isready" -q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t 2 || status=$?
  printf '%s' "$status"
}

wait_until_ready() {
  local attempt
  for ((attempt = 0; attempt < WAIT_SECONDS; attempt++)); do
    if [[ "$(server_status)" == "0" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

printf '1/3 Checking PostgreSQL on %s:%s ...\n' "$DB_HOST" "$DB_PORT"
if [[ "$(server_status)" == "0" ]]; then
  printf '    Already running.\n'
else
  printf '    Not running. Starting %s ...\n' "$FORMULA"
  brew services start "$FORMULA" || true
  if ! wait_until_ready; then
    # Restart only a server that does not respond; one that is still starting up is left alone.
    if [[ "$(server_status)" == "2" ]]; then
      printf '    No response. Restarting ...\n'
      brew services restart "$FORMULA" || true
    fi
    if ! wait_until_ready; then
      printf '\nPostgreSQL did not start. Last log lines (%s):\n' "$pg_log" >&2
      tail -n 20 "$pg_log" >&2 || true
      exit 1
    fi
  fi
  printf '    Started.\n'
  printf '    To start it at login: System Settings > General > Login Items & Extensions >\n'
  printf '    Allow in the Background > turn on "postgres".\n'
fi

printf '2/3 Checking the login (database %s, user %s) ...\n' "$DB_NAME" "$DB_USER"
if ! "$pg_bin/psql" -X -w -q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -c 'SELECT 1' >/dev/null; then
  printf '\nPostgreSQL is running, but the login failed (see the message above).\n' >&2
  printf 'If it asks for a password, set PGPASSWORD and run this again.\n' >&2
  exit 1
fi
printf '    Login works.\n'

printf '3/3 Opening pgAdmin ...\n'
if [[ "$open_pgadmin" == false ]]; then
  printf '    Skipped (--no-open).\n'
elif open -a "pgAdmin 4" 2>/dev/null; then
  printf '    Opened.\n'
else
  printf '    pgAdmin 4 was not found. Open it yourself.\n'
fi

printf '\nReady. pgAdmin connection: host %s, port %s, database %s, user %s\n' \
  "$DB_HOST" "$DB_PORT" "$DB_NAME" "$DB_USER"
