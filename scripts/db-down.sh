#!/usr/bin/env bash
#
# Stops the PostgreSQL that db-up.sh started. The data stays on disk, so
# 'pnpm db:up' brings the same databases back.

set -euo pipefail

service="postgresql@16"

if ! command -v brew >/dev/null 2>&1; then
  echo "db:down stops a Homebrew service and Homebrew is not installed." >&2
  echo "If you started PostgreSQL with Docker, use 'docker compose down'." >&2
  exit 1
fi

brew services stop "$service"
