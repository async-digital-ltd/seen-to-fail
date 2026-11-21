#!/usr/bin/env bash
#
# Stage what a recording workflow commits, and refuse anything else (#265).
#
# Both recording workflows, `Replay a plant` and `Record a run`, write runs
# into ledger/ and commit them. That is all they commit: the replay counts are
# printed by `pnpm ledger:counts` rather than committed (#270), so a recorded
# run moves no documentation and no generator runs before this step (#271).
#
# The commit is made with write access, so nothing but the runs may ride along
# on it unread. Every change in the working tree, untracked files included,
# has to be under ledger/ or nothing is staged. A new path a recording should
# commit means a change here, made on purpose, which is the point.
#
# One script rather than a run block in each workflow, because two workflows
# run it, and two copies of an allow list are free to drift apart.
#
# Exits 0 with the ledger changes staged, which may be none: the caller still
# decides what an empty commit means. Exits 1, staging nothing, when anything
# outside ledger/ changed, and names each path it refused.

set -euo pipefail

allowed() {
  case "$1" in
    ledger/*) return 0 ;;
    *) return 1 ;;
  esac
}

refused=0
while IFS= read -r -d '' entry; do
  path=${entry:3}
  if ! allowed "$path"; then
    echo "Refused: $path changed, and a recording workflow commits only ledger/." >&2
    refused=1
  fi
done < <(git status --porcelain=v1 -z --untracked-files=all --no-renames)

if [ "$refused" -ne 0 ]; then
  echo "Nothing was staged." >&2
  exit 1
fi

git add -- ledger
echo "Staged:"
git diff --cached --name-only
