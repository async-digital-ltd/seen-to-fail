#!/usr/bin/env bash
#
# Starts PostgreSQL through Homebrew and creates the two databases named in
# .env if they are not there yet. This is the route for a machine with no
# Docker; docker-compose.yml is the other one, and you want one or the other,
# not both, because they would compete for port 5432.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

service="postgresql@16"

if ! command -v brew >/dev/null 2>&1; then
  echo "db:up needs Homebrew. Use 'docker compose up -d' instead, or start" >&2
  echo "PostgreSQL 16 another way and then run 'pnpm db:migrate'." >&2
  exit 1
fi

brew services start "$service"

# The service command returns before the server accepts connections, so the
# step below waits for it rather than assuming it is up.
node packages/server/src/scripts/create-databases.ts
