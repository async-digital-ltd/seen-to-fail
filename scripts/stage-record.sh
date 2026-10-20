#!/usr/bin/env bash
#
# Stage what a recording workflow commits, and refuse anything else (#265).
#
# Both recording workflows, `Replay a plant` and `Record a run`, write runs
# into ledger/ and then run `pnpm readme`, because since #264 CI fails while
# the replay counts in the documentation are behind the ledger. So the commit
# a workflow pushes is the runs plus the documentation they move, in one
# commit, and the branch arrives green with no hand step.
#
# That puts a generator in the path of a commit made with write access. A bug
# in it that wrote a file outside its blocks' files would otherwise ride along
# on the next record unread. So the paths are not taken from the generator's
# own list: they are named below, and every change in the working tree,
# untracked files included, has to be one of them or nothing is staged. A new
# generated file means a change here, made on purpose, which is the point.
#
# One script rather than a run block in each workflow, because two workflows
# run it, and two copies of an allow list are free to drift apart.
#
# Exits 0 with the allowed changes staged, which may be none: the caller still
# decides what an empty commit means. Exits 1, staging nothing, when anything
# outside the list changed, and names each path it refused.

set -euo pipefail

allowed() {
  case "$1" in
    ledger/*) return 0 ;;
    docs/automatic.md | docs/tests.md) return 0 ;;
    *) return 1 ;;
  esac
}

refused=0
while IFS= read -r -d '' entry; do
  path=${entry:3}
  if ! allowed "$path"; then
    echo "Refused: $path changed, and a recording workflow commits only ledger/, docs/automatic.md and docs/tests.md." >&2
    refused=1
  fi
done < <(git status --porcelain=v1 -z --untracked-files=all --no-renames)

if [ "$refused" -ne 0 ]; then
  echo "Nothing was staged." >&2
  exit 1
fi

git add -- ledger docs/automatic.md docs/tests.md
echo "Staged:"
git diff --cached --name-only
