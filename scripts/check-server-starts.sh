#!/usr/bin/env bash
#
# Starts the server the way the README tells a contributor to, waits for it to
# answer, and stops it again. It answers one question: does it start.
#
# Nothing else in the build runs the entry point. The tests put requests
# through the handler directly, which keeps them fast and keeps two test files
# from racing for a port, and the type check reads sources rather than loading
# them. What breaks a start is module resolution at run time, and the first
# time that broke, the suite was green throughout (#35).
#
# One script rather than a run block in the CI workflow, so a local run and the
# CI step are the same check. Locally it needs the same two database variables
# the server does, from .env or the environment, and nothing listening on the
# server's port.
#
# What it does, in order:
#
#   1. Runs `pnpm dev:server` in the background, in a process group of its own
#      so that stopping it stops Node too and not only pnpm.
#   2. Waits for the server to print its health address, which it prints only
#      once it is listening.
#   3. Asks `/health` for a 200, then asks the GraphQL endpoint for
#      `{ __typename }` and expects `Query` back. Neither reaches the database:
#      this is not a test of what the server serves, which the integration
#      tests already cover.
#   4. Stops the server, and kills it if it has not gone within a few seconds.
#   5. Asks `/health` once more and requires the connection to be refused.
#
# Step 5 is what ties the answers to this server. The probes go to the
# hostname the server printed, and `localhost` can resolve to more than one
# address, so a stranger listening on one of them can answer while this server
# listens on another. Printing the address proves this server bound somewhere;
# only an answer that stops when this server stops proves it was the one
# answering. A stranger on the port therefore fails the check whichever address
# it holds, which is the right answer: the result would not mean anything.
#
# Every failure exits non-zero, names what it was waiting for, and prints the
# server's own output. The wait is bounded by SERVER_START_TIMEOUT, in seconds,
# default 30, and every request by a few seconds more, so nothing here can hang
# the job however the server misbehaves.
#
# It was watched failing before it was trusted: with DATABASE_URL removed it
# refused because the server exited before listening, and with the listen call
# replaced by a timer that keeps the process alive it refused on the timeout.
# With a stranger listening on ::1 at the same port, which curl reaches first
# for `localhost` on macOS, it used to pass on the stranger's answers; step 5
# is what now refuses that.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

timeout="${SERVER_START_TIMEOUT:-30}"
case "$timeout" in
  '' | *[!0-9]*)
    echo "SERVER_START_TIMEOUT must be a whole number of seconds, not '$timeout'." >&2
    exit 1
    ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  echo "The server start check needs curl, and there is none on the PATH." >&2
  exit 1
fi

work="$(mktemp -d)"
log="$work/server.log"
server_pid=""

# The process group is the server's pid, because job control is on when it is
# started. Signalling the group reaches Node as well as the pnpm that started
# it; signalling pnpm alone can leave Node holding the port after this exits.
stop_server() {
  if [ -z "$server_pid" ]; then
    return 0
  fi
  # The group rather than the leader: pnpm can have died and left Node behind.
  if kill -0 -- "-$server_pid" 2>/dev/null; then
    kill -TERM -- "-$server_pid" 2>/dev/null || true
    waited=0
    while kill -0 -- "-$server_pid" 2>/dev/null && [ "$waited" -lt 10 ]; do
      sleep 0.5
      waited=$((waited + 1))
    done
    if kill -0 -- "-$server_pid" 2>/dev/null; then
      echo "The server did not stop within 5 seconds of being asked, so it was killed." >&2
      kill -KILL -- "-$server_pid" 2>/dev/null || true
    fi
  fi
  wait "$server_pid" 2>/dev/null || true
  server_pid=""
}

cleanup() {
  stop_server
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

fail() {
  echo "The server start check failed: $1" >&2
  echo "--- what the server printed ---" >&2
  cat "$log" >&2 || true
  echo "--- end of the server's output ---" >&2
  exit 1
}

# Created here rather than by the redirect below, which runs in the child and
# may not have happened yet when the loop first reads the file.
: >"$log"

set -m
pnpm dev:server >"$log" 2>&1 &
server_pid=$!
set +m

started=$SECONDS
health_url=""
graphql_url=""

while :; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    status=0
    wait "$server_pid" || status=$?
    fail "the server exited with status $status before it was listening."
  fi

  if [ -z "$health_url" ]; then
    # The first match only, with sed quitting on it rather than piping to head,
    # which under pipefail could end sed with SIGPIPE and this script with it.
    health_url="$(sed -n 's/^ *Health: *\(http[^ ]*\).*$/\1/p;/^ *Health: *http/q' "$log")"
    graphql_url="$(sed -n 's/^ *GraphiQL: *\(http[^ ]*\).*$/\1/p;/^ *GraphiQL: *http/q' "$log")"
  fi

  if [ -n "$health_url" ]; then
    code="$(curl --silent --output /dev/null --max-time 5 \
      --write-out '%{http_code}' "$health_url" || true)"
    if [ "$code" = "200" ]; then
      break
    fi
  fi

  if [ $((SECONDS - started)) -ge "$timeout" ]; then
    if [ -z "$health_url" ]; then
      fail "the server never said it was listening within $timeout seconds."
    fi
    fail "$health_url did not answer 200 within $timeout seconds (last answer: ${code:-none})."
  fi

  sleep 1
done

if [ -z "$graphql_url" ]; then
  fail "the server printed its health address but not its GraphQL address."
fi

answer="$(curl --silent --show-error --max-time 10 \
  --header 'content-type: application/json' \
  --data '{"query":"{ __typename }"}' "$graphql_url" 2>&1 || true)"
if [ "$answer" != '{"data":{"__typename":"Query"}}' ]; then
  fail "$graphql_url did not answer { __typename } with Query. It answered: $answer"
fi

stop_server

# With this server stopped, nothing may answer where it did. An answer now came
# from some other process, and so might every answer above. Exit 7 is curl's
# "could not connect", the only result that clears it.
refused=0
curl --silent --output /dev/null --max-time 5 "$health_url" || refused=$?
if [ "$refused" -ne 7 ]; then
  fail "$health_url still answered after the server was stopped (curl exit $refused), so another process holds the port and the answers above may have been its."
fi

echo "The server started: $health_url answered 200 and $graphql_url answered a query, $((SECONDS - started)) seconds after it was started."
