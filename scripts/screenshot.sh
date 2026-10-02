#!/usr/bin/env bash
#
# Takes the README's screenshot: the seeded list of checks, 1200 pixels wide,
# written to docs/checks.png.
#
# The recipe is here rather than in anyone's head so that a retake differs from
# the last shot in the tree and in nothing else.
#
#   1. Two database URLs exported in this shell. DATABASE_URL is the seeded one
#      the page reads; TEST_DATABASE_URL is not read here, but the server's
#      config module refuses to start without both.
#   2. pnpm db:migrate and pnpm db:seed against DATABASE_URL. The sample
#      workspace dates every run and observation from the day it loads, so the
#      five counts are the same whenever it is seeded: Proven 2, Broken 1,
#      Stale 2, Unproven 1, Unarmed 2. A retake showing different counts means
#      something in the tree changed, and is worth stopping on rather than
#      shipping.
#   3. pnpm dev:server and pnpm dev:web both running, because the page reads
#      the list over GraphQL through the client's proxy. This script checks
#      they answer rather than starting them, so it never leaves a server
#      behind.
#   4. Headless Chrome, which captures the viewport and nothing else. No tab
#      strip, address bar or menu bar reaches the file. That is the point on a
#      repository that is going public: browser chrome in a committed PNG
#      leaks tab titles, bookmarks and a profile avatar, and is unrecoverable
#      after the visibility flip.
#   5. The unfiltered address. A filter would hide statuses and prove less,
#      and the shot's job is to evidence the five-status table printed beside
#      it, Broken included.
#
# Look at the result before committing it. The width is asserted below, but no
# script can tell you the badge glyph and its label are both legible.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
page="http://localhost:5173/"
width=1200
height=1220
out="docs/checks.png"

if [[ ! -x $chrome ]]; then
  echo "No Google Chrome at $chrome." >&2
  exit 1
fi

for url in http://127.0.0.1:4000/ready "$page"; do
  if ! curl -sf -o /dev/null "$url"; then
    echo "$url is not answering. Start pnpm dev:server and pnpm dev:web." >&2
    exit 1
  fi
done

# No --user-data-dir on purpose, measured on macOS Chrome 152: with one, the
# browser writes the file and then never exits, so the script has to be killed.
# Without one it writes the file and returns. Nothing is lost by leaving it
# out, because what keeps a browsing session out of the image is headless
# capture rather than profile isolation: headless draws the viewport and has no
# chrome to draw. Close any running Chrome first, since two instances cannot
# share the one profile directory.
#
# --virtual-time-budget is what waits for the list, which arrives over GraphQL
# rather than in the first paint.
"$chrome" \
  --headless \
  --disable-gpu \
  --no-sandbox \
  --hide-scrollbars \
  --force-device-scale-factor=1 \
  --virtual-time-budget=6000 \
  --window-size="$width,$height" \
  --screenshot="$out" \
  "$page" >/dev/null 2>&1

# The window size asked for and the pixels written are different claims, and
# they have come apart before, so the file is measured rather than assumed.
measured="$(sips -g pixelWidth "$out" | awk '/pixelWidth/ { print $2 }')"
if [[ $measured != "$width" ]]; then
  echo "Asked for ${width}px and got ${measured}px in $out." >&2
  exit 1
fi

echo "Wrote $out at ${measured}px wide. Look at it before committing it."
