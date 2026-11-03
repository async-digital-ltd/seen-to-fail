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

The page is published in English and in Welsh
([#284](https://github.com/async-digital-ltd/seen-to-fail/issues/284)). The
build writes the Welsh page, index.cy.html, beside the English one from the
same snapshot in the same run, so the two cannot describe different records:
only the words differ. Both sets of words are held to one interface in
`packages/server/src/ledger/words.ts`, so a label worded in one language and
not the other fails to compile. Every month on the Welsh page is named from a
fixed Welsh list rather than by the platform's date formatting, which can name
a Welsh month in English without saying so. Each page gives its own address as
canonical, names both pages with hreflang and the English one as the default,
and links the other in that page's language, and the sitemap lists both.

The records' own text is Welsh on the Welsh page too: every check's name, area,
what it protects against and how to tell it is switched on, and every run's
plant, expected outcome, note and reason for settling nothing, and every
observation's note. The records themselves stay in English, as a person or the
replay wrote them, and carry no Welsh field. The Welsh comes from a table in
the generator, `packages/server/src/ledger/record-welsh.ts`, keyed on each text
exactly as its record holds it, so a record whose English is edited has no
entry until its Welsh is updated. Identifiers and quoted tool output, such as
`REPLAY_AFTER_DAYS` or the line pnpm prints when a test fails, are printed as
they are on both pages, as code tagged as English, inside the sentence around
them. The build also refuses a Welsh page that names a month or a day of the
week in English anywhere outside code, and so does the published-output check.

**When the build refuses a record for its Welsh.** A record whose text has no
entry stops the build before the database is touched, and nothing is written:
neither page, nor anything beside them. So a push to `main` with an
untranslated record fails CI, the publish job never runs, and the site keeps
both pages as they were at the last good build. The English page is never
published alone, and English never stands in on the Welsh page. The refusal
names each text, quoted as JSON so it can be copied exactly, the record it came
from, and how many other records share it. To clear it:

1. Add an entry to `entries` in `packages/server/src/ledger/record-welsh.ts`.
   The key is the English exactly as quoted in the refusal, every character of
   it, including its full stop and any straight quotes. A text many records
   share, such as what every replay of one check expected, needs one entry.
2. Write the Welsh with backticks around every identifier, file name, commit,
   branch name, CI step name and piece of quoted tool output, and leave what is
   inside them exactly as the English prints it. The build refuses an entry
   whose code the English does not print as a word of its own as many times as
   the Welsh marks it, so a mistyped identifier fails rather than being
   printed. The English page marks the same code from the same entry.
3. Write any date as the Welsh page writes a day, with the Welsh month, such as
   4 Hydref 2026, rather than changing the month inside an English sentence.
4. Run `pnpm ledger:build` and the server's tests, which hold every entry to
   the committed ledger and to every break `canfail.json` declares.
5. Ask someone fluent in Welsh to read the new entry. The build can tell that
   an entry exists and that its code matches; it cannot tell whether the Welsh
   is right.

A replay records each declared break's name as what was planted and its
check's expected outcome as what was expected, and the server's tests require
an entry for each before the replay runs, so a replay of the current
declaration needs nothing new in the table. A reason a replay gives for
settling nothing is canfail's own sentence, and a new one needs its entry, on
the replay's branch or on `main`, before the branch can land.

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
