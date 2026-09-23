# The ledger

The published record. Every check, every planted defect and every dated
observation about whether a check is switched on is a file in here. The page the
build produces for publishing is built from these files, from the git history
that added them, and from the day it is built on, which every status is read as
of.

```
ledger/
  checks/<id>.json                 one check
  runs/<day>-<id>-<digest>.json    one planted defect, and what the check did
  observations/<...>.json          one dated observation about whether it is on
```

Only the first of those names is a rule: the validator refuses a check whose
file is not named after its id. The other two are conventions it does not
check. The recorder names a run after its day, its check's id and the first
twelve hexadecimal characters of a SHA-256 of the record, and the observations
written so far were named `<day>-<id>.json` by hand. A valid run under any
other name is read like the rest.

One record, one file. That is the whole answer to two jobs recording a run at
the same moment: they write different paths, so there is nothing for git to
merge and no way for one job's record to land on top of another's.

A run's filename carries a digest of the record as written, so the same run
recorded twice by the recorder is one file: the second attempt finds it already
there, byte for byte, writes nothing and exits 0. A replay dates its runs by the
day it ran, in UTC, so a job that retries on the same day records one run and
one that retries after midnight UTC records a second. Two runs that are
identical in every field, including the day, are one record; a note is what
separates them when they are genuinely two.

The digest is of the keys written, not only of what they mean. The recorder
writes all ten keys a run can have, so a run typed in again today that matches
one of the six-key records from before `source` existed, field for field as the
validator reads them, lands in a second file and is published as a second run.

Nothing here is edited by the app. Two commands write a run, and everything
else, every check and every observation, is written by hand in a pull request.
`pnpm ledger:record` writes one run from the flags it is given, and the
`Record a run` workflow runs it with `--source hand`, for a run a person watched
and typed in. Given `--source replay` with a commit and a link it writes a
replay record too, though nothing here calls it that way. `pnpm ledger:replay`
writes one run per outcome in a replay tool's report, and the `Replay a plant`
workflow runs it. Both replays with records in `runs/` wrote two runs each, one
for each break `canfail.json` declares, but the adapter records what the report
lists rather than holding it to the declaration.

The two commands write through the same recorder, `recordRun` in
`packages/server/src/ledger/record.ts`, so the rules below hold for both, and
the replay route also refuses a report it cannot map before anything reaches
the recorder. They differ in who watched the check, a person or a job, which is
what a run's `source` records.

## What a record has to be

```sh
pnpm ledger:validate
```

Reads every file in `checks/`, `runs/` and `observations/`, refuses the lot if
any one of them is wrong and exits 1, and exits 0 when all of them are sound.
Anything in those three directories that is not a `.json` file is refused.
Anything else under `ledger/`, this README included, is not read.

Both recording workflows run it before they commit, so neither commits a record
that breaks a rule. CI runs it on every pull request and on every push to `main`
or to a `ci-control/` branch, inside the job `main` requires to pass before a
pull request can merge. So a record written by hand that breaks a rule can be
committed on a branch, and cannot reach `main`. That requirement is a repository
setting rather than a file here: read on 23 September 2026 with access to the
repository, `main` requires `Type check, lint, format and test`, the CI job this
command runs in.

A check's id is lower-case letters, digits and single hyphens, at most 100
characters, starting and ending with a letter or a digit, and its file is named
after it. A run names a check that exists, is dated a day that exists and is not
after today, and has an outcome of `caught`, `missed` or `inconclusive`. An
observation is held to the same two rules about its check and its day.

Today is the day in UTC, whatever zone the machine running the command is set
to, and it is read when the command runs, so a record that passed once goes on
passing. A person whose own day is already ahead of UTC is refused for typing it
until UTC catches up, which is open as
[#40](https://github.com/async-digital-ltd/seen-to-fail/issues/40).

Every schema is strict: a key nobody reads is refused rather than dropped, in a
check, a run and an observation alike, because a misspelled field silently
ignored is a record published without it. A field written in words is trimmed
of surrounding spaces, and a blank `note`, `inconclusiveReason`, `sourceCommit`
or `sourceRunUrl` reads as absent.

A run typed in by hand, in the shape `pnpm ledger:record` writes one today:
every key present, and the empty ones null. The values are made up for the
example. No hand record in `runs/` has this shape yet, because the four there
were written before `source` existed and carry six keys, as
[Where a run came from](#where-a-run-came-from) explains.

```json
{
  "checkId": "ci-lint",
  "runOn": "2026-09-18",
  "planted": "A rule violation.",
  "expected": "The lint step fails.",
  "outcome": "caught",
  "inconclusiveReason": null,
  "note": null,
  "source": "hand",
  "sourceCommit": null,
  "sourceRunUrl": null
}
```

## A check's address

A check's `id` is how anything outside this app refers to it. A run or an
observation names its check by `checkId`, the `Record a run` workflow takes the
id as its `check-id` input, and `canfail.json` carries it as `checkId` beside
each check it declares for replay, which is how a replay knows what to record
against. The uuid the database keys a check on is derived from the id each time
the build loads the ledger. It is written into that database and nowhere else:
no file here holds one, and neither the page nor the export the build writes
carries one, since both name a check by its id.

The `name` beside it is a label, not an address. Nothing resolves a ledger check
by its name, so a check can be renamed after runs have been recorded against it
and every run still reaches it: the run files are untouched, the check publishes
under the same id, and the page reads the new name over the old evidence.
`canfail.json` gives each check it declares a name of its own, which is what
canfail's report quotes; the adapter turns that into an id through the same
file, and never reads the ledger's name. Two checks in the ledger cannot share a
name, because the app keeps names unique, and the validator refuses the pair
before the build meets that constraint.

Changing the `id` is not a rename. It is a new check, whose file has to be
renamed to match, and every run naming the old id is then a run against a check
that is not in the ledger, which the validator refuses. A well-formed id that
matches no check is refused by name, from `pnpm ledger:record` and from
`pnpm ledger:validate` alike, and never answered by a check quietly brought into
being to receive the run. An id that is not well formed is refused for its shape
instead, and that message does not repeat it.

## A run that settled nothing

`inconclusive` is a run that tells you nothing about the check: the plant no
longer applied, the check was already failing before anything was planted, it
never ran, or it went red for some reason other than the declared one. None of
those is the check missing a defect.

Such a run carries `inconclusiveReason`, which is required on it and refused on
a run that caught or missed; a blank one counts as none. The reason is the words
whoever recorded it wrote, trimmed of surrounding spaces and otherwise published
as they arrived, and never sorted into a category here. Only the first situation
above means the plant needs rewriting, and the tool that scores a replay
separates its reasons inside an English sentence, so a category recovered by
matching that prose would send a reader to rewrite a plant that is fine.

That last is a fact about canfail 0.2.1 rather than about this repository, which
has not yet recorded a replay that settled nothing. What can be checked here is
the mapping: `packages/replay/src/adapt.ts` sends two of canfail's four
verdicts, `look` and `wrong-failure`, to `inconclusive`, and copies canfail's
sentence into the reason.

The record below is made up for the example: no run in `runs/` has settled
nothing yet, the commit and the run link are placeholders, and the reason is
invented. It has the ten keys every replay record has.

```json
{
  "checkId": "ci-lint",
  "runOn": "2026-09-18",
  "planted": "A rule violation.",
  "expected": "The lint step fails.",
  "outcome": "inconclusive",
  "inconclusiveReason": "The anchor matches 0 times in src/rules.ts and has to match exactly once, so nothing was broken.",
  "note": null,
  "source": "replay",
  "sourceCommit": "1234567890abcdef1234567890abcdef12345678",
  "sourceRunUrl": "https://github.com/async-digital-ltd/seen-to-fail/actions/runs/1"
}
```

Nothing in the status rules reads one. A check's status is read from its latest
run that settled something, with the calendar and the arming observations still
applying, so a catch still goes Stale once it is more than thirty days old,
however many runs since have settled nothing. The published page shows that day
beside the status as "Last settled", so the status can be seen for how old it
is. A check that nothing has ever settled is read as though it had no runs at
all.

A record that says nothing about a reason reads as having none, which is what a
run that caught or missed has to have, so every record written before this
outcome existed stays valid exactly as it was written.

## Where a run came from

`source` is `hand` for a run somebody planted, watched and typed in, and
`replay` for one a job planted and scored. A replay carries both `sourceCommit`,
the commit it ran against, written in full as forty lower-case hexadecimal
characters, and `sourceRunUrl`, a link to the run that produced it, which has to
parse as a URL with the `https` scheme. A run typed in by hand carries neither,
and is refused if either holds a value: a record with a field nobody wrote is
not something a reader can tell from one somebody did.

The validator checks those shapes and nothing more. Whether the commit exists,
and whether the link reaches the run that produced the record, it cannot tell: a
replay naming a commit nobody made and a link to somewhere else passes. A reader
checks both by following them. Every commit named by a replay record in `runs/`
is in this repository's history, checked on 23 September 2026.

This one is a real record, `runs/2026-09-21-ci-type-check-6b64c0a25549.json`,
exactly as it is on disk:

```json
{
  "checkId": "ci-type-check",
  "runOn": "2026-09-21",
  "planted": "STALE_AFTER_DAYS is written as a string rather than a number.",
  "expected": "The type check fails.",
  "outcome": "caught",
  "inconclusiveReason": null,
  "note": null,
  "source": "replay",
  "sourceCommit": "81e159cc56193008c60e83abdbe18b9b45e32a30",
  "sourceRunUrl": "https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35585966476"
}
```

Those ten keys are the whole of a replay record, and none of them names what
started the job. `source` separates a job from a person typing, and a replay
somebody dispatched is a job too. The two replays with records in `runs/` show
it: run
[35429662430](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35429662430)
was dispatched and run
[35585966476](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35585966476)
was started by the schedule, and the records each of them wrote carry the same
ten keys. Which was which is on the run each `sourceRunUrl` links to, and
nowhere in this directory.

A record that says nothing about its source is read as one typed in by hand. Of
the eight runs in `runs/` on 23 September 2026, the four typed in by hand are
all of that kind, with six keys and no `source`, and the four from replays carry
all ten. That is how the runs recorded before `source` existed stay valid: their
filenames are digests of their own contents, so adding a key to them would have
meant an append-only record rewriting its own past.

Nothing in the status rules reads any of this either. A replay and a run typed
in, with the same outcome on the same day, leave a check reading the same
thing.

## Where the commit comes from

Nothing in a record says which commit recorded it, because that commit does not
exist until the record is committed. The build reads it back out of the history
instead, which is also why a run cannot claim to have been recorded by a commit
that did not add it.

That is a different commit from a replay's `sourceCommit`, and the published
page names both rather than leaving them to be told apart by position. The
replay's is the tree the plant was applied to, which the job knew when it ran.
The recording one is the commit that added the file afterwards, which nothing
knew until it existed. For the record above they are `81e159c` and `f1348f8`.

## Building the page

```sh
pnpm ledger:build
```

Reads the ledger by the same rules as `pnpm ledger:validate`, and stops with
exit 1, having emptied and written nothing, if any record breaks one. Otherwise
it empties `checks`, `test_runs` and `arming_observations` in the database
`DATABASE_URL` names, which is meant to be the development one, and loads these
files into them. It derives every status with the same SQL function the running
app reads, renders the page and the export, checks them against the records they
came from, and writes `dist/ledger`, or the directory `--out` names, only if
they agree.

That is not quite what `pnpm db:seed` does. The seed also empties
`saved_filters`, and the build leaves whatever is in that table alone. Like the
seed, it will not start unless `TEST_DATABASE_URL` is set as well. It also
refuses a shallow clone, because the commit that added each file has to be read
from the full history, and it needs an `origin` remote or `GITHUB_REPOSITORY` to
link those commits to.
