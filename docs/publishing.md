# What the build refuses to publish

The build refuses to publish when the records and the output disagree: it
compares the files on disk with the rows the database ended up holding, with the
export, and with the rendered page, and writes nothing if any of those disagree.
It also compares the run each check's status was read from with the first run in
the check's published table that settled anything, and refuses when they are
different runs, and does the same for the observation its armed state was read
from and the first observation in its published list. A page listing nine runs where the ledger holds ten looks
exactly like a page listing ten, which is the kind of quiet wrongness this
project is about.

The page names the commit that recorded each run, read back out of the history
rather than stored, so a run cannot claim a commit that did not add it. That is
a different commit from a replay's `sourceCommit`, which is the tree the plant
was applied to, and the page names both rather than leaving them to be told
apart by position.

The published page is read-only and has no filter bar. The filter language
compiles a filter to SQL, and there is no database behind a published page to
compile it against, so it is what you get when you run the app locally. That was
the cheapest of the three ways and it is the one that hides the best part; the
cost is bought back by
[#73](https://github.com/async-digital-ltd/seen-to-fail/issues/73) rather than
absorbed.

**The forms have not gone anywhere.** They and the GraphQL mutations are still
how a run is recorded against a workspace you are running locally, and they are
still where a check is added and an arming observation recorded. What has
changed is that they are no longer the only way a run is recorded, and they do
not write the published ledger. Nothing yet carries a run from a local database
into `ledger/`
([#75](https://github.com/async-digital-ltd/seen-to-fail/issues/75)).

**Where it is published.** Every push to `main` builds the page, checks it, and
serves it with GitHub Pages at
[seen-to-fail.async-digital.com](https://seen-to-fail.async-digital.com/)
([#76](https://github.com/async-digital-ltd/seen-to-fail/issues/76),
[#137](https://github.com/async-digital-ltd/seen-to-fail/issues/137)). The old
`async-digital-ltd.github.io/seen-to-fail` address redirects there. The job
that serves it builds nothing of its own: it deploys the directory the checks
built and checked on the same commit, so the page served is the page that
passed.

The page is open to search engines and carries Open Graph and Twitter tags, so
a shared link previews as a card with the project's mark rather than a bare
address ([#237](https://github.com/async-digital-ltd/seen-to-fail/issues/237)).
The preview image is a static PNG committed beside the renderer and copied into
`dist/ledger` by the build, which fetches nothing to make it. The first line
under the page's header says what the page is and links this repository. The
line under the headline says what its count covers: the areas the checks on the
page are in, read from the checks themselves, and that checks about security,
such as secret scanning, are left off on purpose, with a link to
[What belongs on a public ledger](../README.md#what-belongs-on-a-public-ledger)
([#240](https://github.com/async-digital-ltd/seen-to-fail/issues/240)).

Pull requests and pushes to a `ci-control/` branch build and check the same page
and keep it as a build artefact for seven days, but never serve it. A proposed
change or a planted defect cannot alter what a reader sees until it is on
`main`.

Pages stayed switched off until this repository was made public, on 27
September 2026. A Pages site cannot be private on the plan this organisation is
on, as measured on 18 September 2026, so turning it on earlier would have made
the ledger readable by anyone with the URL before the history review on
[#55](https://github.com/async-digital-ltd/seen-to-fail/issues/55) had cleared
the rest of the repository to be read. What was and was not measured about the
plan is recorded on
[#76](https://github.com/async-digital-ltd/seen-to-fail/issues/76).
