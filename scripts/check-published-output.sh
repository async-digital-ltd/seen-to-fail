#!/usr/bin/env bash
#
# What the build produced, read back off disk rather than trusted.
#
# The build has already refused to publish anything that disagrees with the
# record. These are the properties a reader can check without reading the
# build: two files exist, the page names the commit it was built from, and it
# carries no script, so nothing on it is worked out anywhere but at build time.
#
# One script rather than a run block in the CI workflow, because two things run
# it. CI runs it after `pnpm ledger:build`, on every pull request and every push
# to main or to a `ci-control/` branch, and that is the check the ledger records
# as `ci-published-output`.
# The replay runs it too, after its own build, against the plant `canfail.json`
# declares for that check. A copy of these lines inside `canfail.json` would be
# a second definition of the check, free to drift from the one CI runs.
#
# Every refusal names what it refused, and the pass names what it read. Those
# lines are what the replay reads as evidence that this ran at all: a check
# that produces no such line did not run, whatever it exited with.
#
# The script check is written as an `if` and not as `! grep -qi ...`, which is
# what the CI step said first. `set -e` does not apply to a command whose
# status is inverted with `!`, so that line went green whatever grep found: a
# guard that could not fail, in the one repository where that is the whole
# subject. It was caught by running it against a page with a script added on
# purpose, before it ever ran anywhere.
#
# The commit is read from the checkout this script sits in, which is what the
# page has to name: the page is built at that commit, so a page naming any
# other is a page built from somewhere else.

set -euo pipefail

# The one argument is where to read, and it is resolved against the directory
# the caller ran this from, before the script moves to the repository root
# below. Without that, a relative argument would quietly be read from the
# root instead, which is not what anybody typing `./out` means. Left out, it
# is where the build writes and where CI and Pages read from.
if [ "$#" -ge 1 ]; then
  case "$1" in
    /*) directory="$1" ;;
    *) directory="$PWD/$1" ;;
  esac
else
  directory="dist/ledger"
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

page="$directory/index.html"
export_file="$directory/ledger.json"

if [ ! -f "$page" ]; then
  echo "The published page is not there: $page." >&2
  exit 1
fi

if [ ! -f "$export_file" ]; then
  echo "The published export is not there: $export_file." >&2
  exit 1
fi

commit="$(git rev-parse HEAD | cut -c1-7)"
if ! grep -q "$commit" "$page"; then
  echo "The published page does not name $commit, the commit it was built from." >&2
  exit 1
fi

if grep -qi '<script' "$page"; then
  echo "The published page carries a script." >&2
  exit 1
fi

echo "The published output in $directory is sound: two files, built from $commit, with no script."
