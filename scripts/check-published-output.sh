#!/usr/bin/env bash
#
# What the build produced, read back off disk rather than trusted.
#
# The build has already refused to publish anything that disagrees with the
# record. These are the properties a reader can check without reading the
# build: the files exist, the page's "Built from" lines name the commit it was
# built from, and it carries no script, so nothing on it is worked out anywhere
# but at build time. Since #237 it also holds that the page can be found and
# shared: no `noindex`, the link-preview tags, the image they name, and the
# line at the top that says what the page is.
#
# One script rather than a run block in the CI workflow, because two things run
# it. CI runs it after `pnpm ledger:build`, on every pull request and every push
# to main or to a `ci-control/` branch, and that is the check the ledger records
# as `ci-published-output`.
# The replay runs it too, after its own build, against the plants
# `canfail.json` declares for that check. A copy of these lines inside
# `canfail.json` would be a second definition of the check, free to drift from
# the one CI runs.
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

commit="$(git rev-parse HEAD)"
short="${commit:0:7}"

# The page states the commit it was built from on its "Built from" lines, one
# under the headline and one in the footer. Those lines are what is read here,
# every one of them, and nothing else on the page.
#
# This step used to look for the short commit anywhere on the page (#141). A
# run recorded in the commit under test names that commit in its own row,
# inside its `Recorded in` link, which is the normal state of a page built at a
# commit that added a run. The search then found the commit whatever the
# "Built from" lines said, so a page naming another commit, or none, passed.
#
# Each line is held to what the renderer writes for this commit: a link to its
# full id on GitHub around its first seven characters. Both are read, because a
# reader sees the one and follows the other. A "Built from" that does not read
# that way is refused rather than skipped, and so is a page with none. A grep
# that finds nothing, or cannot read the page, hands the loop no lines, and the
# count after it refuses that.
#
# A line is found by the words "Built from commit" followed by a raw `<`, the
# start of the renderer's own link. Text on the page cannot produce that:
# everything a record contributes is escaped, so its `<` reads `&lt;`. This
# step used to take the words "Built from" anywhere (#170), and the page shows
# each plant's description, so a recorded catch of the plant that names the
# wrong commit put that plant's own description on the page, where it was
# read as a line and refused. Markup that starts that way but reads
# differently is still read, and still refused.
expected="^Built from commit <a href=\"https://github\\.com/[^\"]+/commit/${commit}\"><code>${short}</code></a>\$"
stamps=0
while IFS= read -r stamp; do
  stamps=$((stamps + 1))
  if [[ ! "$stamp" =~ $expected ]]; then
    echo "The published page has a \"Built from\" line that does not name $commit, the commit it was built from: $stamp" >&2
    exit 1
  fi
done < <(grep -o 'Built from commit <[^,]*' "$page")

if [ "$stamps" -eq 0 ]; then
  echo "The published page has no \"Built from\" line, so it does not say which commit it was built from." >&2
  exit 1
fi

if grep -qi '<script' "$page"; then
  echo "The published page carries a script." >&2
  exit 1
fi

# The page is meant to be found by search and shared as a link (#237). These
# are the properties of that a reader can see without the build: nothing asks
# search engines to leave it out, the link-preview tags are each there once,
# their addresses are absolute, and the image they name is on disk beside the
# page at the size a large preview card expects.
#
# Each value is read with `|| true` after the grep, because under `pipefail` a
# grep that finds nothing would end the script inside the assignment, silently,
# rather than reach the refusal that names what is missing.

if grep -qi 'noindex' "$page"; then
  echo "The published page asks search engines not to index it." >&2
  exit 1
fi

# Every value the page gives one tag, one per line.
tag_values() {
  { grep -o "<meta $1=\"$2\" content=\"[^\"]*\">" "$page" || true; } |
    sed -E 's/.*content="([^"]*)">$/\1/'
}

# The one value the page gives a tag, refusing a tag that is missing, empty, or
# given twice. A preview reads whichever copy it meets first, so two that
# disagree would be a page that previews differently depending on the reader.
one_value() {
  local values count
  values="$(tag_values "$1" "$2")"
  count="$(printf '%s' "$values" | grep -c '' || true)"
  if [ "$count" -ne 1 ] || [ -z "$values" ]; then
    echo "The published page has $count $2 tag(s) with a value, where a link preview needs exactly one." >&2
    exit 1
  fi
  printf '%s' "$values"
}

og_type="$(one_value property og:type)"
og_title="$(one_value property og:title)"
og_description="$(one_value property og:description)"
og_url="$(one_value property og:url)"
og_image="$(one_value property og:image)"
twitter_card="$(one_value name twitter:card)"
twitter_title="$(one_value name twitter:title)"
twitter_description="$(one_value name twitter:description)"
twitter_image="$(one_value name twitter:image)"

if [ "$og_type" != "website" ]; then
  echo "The published page gives og:type as \"$og_type\", not \"website\"." >&2
  exit 1
fi

if [ "$twitter_card" != "summary_large_image" ]; then
  echo "The published page gives twitter:card as \"$twitter_card\", not \"summary_large_image\"." >&2
  exit 1
fi

if [[ ! "$og_url" =~ ^https://[a-z0-9.-]+/$ ]]; then
  echo "The published page gives og:url as \"$og_url\", which is not an absolute https address for the root of a site." >&2
  exit 1
fi

# The image must be served from the page's own site, from the directory this
# script is reading, so the file below is the file a preview will fetch.
image_file="${og_image#"$og_url"}"
if [ "$image_file" = "$og_image" ] || [[ ! "$image_file" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "The published page gives og:image as \"$og_image\", which is not a file at $og_url." >&2
  exit 1
fi

if [ "$twitter_image" != "$og_image" ] ||
  [ "$twitter_title" != "$og_title" ] ||
  [ "$twitter_description" != "$og_description" ]; then
  echo "The published page's twitter tags do not say what its og tags say." >&2
  exit 1
fi

image="$directory/$image_file"
if [ ! -f "$image" ]; then
  echo "The published page names a preview image that is not there: $image." >&2
  exit 1
fi

# A PNG's signature is its first eight bytes, and its width and height are the
# two big-endian words at bytes 16 to 23, in the header chunk that has to come
# first.
read -r -a header <<<"$(od -An -tu1 -N24 "$image" | tr -s ' \n' '  ')"
signature="${header[*]:0:8}"
width=$(((header[16] << 24) | (header[17] << 16) | (header[18] << 8) | header[19]))
height=$(((header[20] << 24) | (header[21] << 16) | (header[22] << 8) | header[23]))
if [ "$signature" != "137 80 78 71 13 10 26 10" ] || [ "$width" -ne 1200 ] || [ "$height" -ne 630 ]; then
  echo "The published preview image $image is not a 1200 by 630 PNG." >&2
  exit 1
fi

# The line that says what the page is, above the headline, linking the
# repository it is the record of.
about_at="$({ grep -n '<p class="eyebrow about">Seen to Fail is a record of [^<]*<a href="https://github\.com/[^"]\{1,\}">[^<]\{1,\}</a>\.</p>' "$page" || true; } | head -n 1 | cut -d: -f1)"
headline_at="$({ grep -n '<h1>' "$page" || true; } | head -n 1 | cut -d: -f1)"
if [ -z "$about_at" ] || [ -z "$headline_at" ] || [ "$about_at" -ge "$headline_at" ]; then
  echo "The published page does not say what it is, with a link to its repository, above its headline." >&2
  exit 1
fi

echo "The published output in $directory is sound: three files, built from $commit, with no script, open to search, and with a link preview at $og_url."
