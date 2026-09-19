# The ledger

The published record. Every check, every planted defect and every dated
observation about whether a check is switched on is a file in here, and the
page that gets published is built from these files and from nothing else.

```
ledger/
  checks/<id>.json          one check
  runs/<day>-<id>-<digest>.json   one planted defect, and what the check did
  observations/<...>.json   one dated observation about whether it is on
```

One record, one file. That is the whole answer to two jobs recording a run at
the same moment: they write different paths, so there is nothing for git to
merge and no way for one job's record to land on top of another's.

A run's filename carries a digest of the record, so the same run recorded twice
is the same file written twice rather than two runs. A job that retries records
one run. Two runs that are identical in every field, including the day, are one
record; a note is what separates them when they are genuinely two.

Nothing here is edited by the app. `pnpm ledger:record` writes a run, the
`Record a run` workflow runs it, and everything else is written by hand in a
pull request.

## What a record has to be

```sh
pnpm ledger:validate
```

Reads every file and refuses the lot if any one of them is wrong, exiting
non-zero. The recording workflow runs it before it commits and CI runs it on
every push, so a record that breaks a rule never becomes a commit.

A check's id is lower case letters, digits and single hyphens, and the file is
named after it. A run names a check that exists, is dated a day that exists and
not after today, and has an outcome of `caught` or `missed`. Every schema is
strict: a key nobody reads is refused rather than dropped, because a misspelled
field silently ignored is a record published without it.

```json
{
  "checkId": "ci-lint",
  "runOn": "2026-09-18",
  "planted": "A rule violation.",
  "expected": "The lint step fails.",
  "outcome": "caught",
  "note": null,
  "source": "hand",
  "sourceCommit": null,
  "sourceRunUrl": null
}
```

## Where a run came from

`source` is `hand` for a run somebody planted, watched and typed in, and
`replay` for one a job planted and scored. A replay carries both
`sourceCommit`, the commit it ran against, written in full, and `sourceRunUrl`,
a link to the run that produced it, which has to be an `https://` address. A
run typed in by hand carries neither, and is refused if it carries either: a
record with a field nobody wrote is not something a reader can tell from one
somebody did.

```json
{
  "checkId": "ci-lint",
  "runOn": "2026-09-18",
  "planted": "A rule violation.",
  "expected": "The lint step fails.",
  "outcome": "caught",
  "note": null,
  "source": "replay",
  "sourceCommit": "1234567890abcdef1234567890abcdef12345678",
  "sourceRunUrl": "https://github.com/async-digital-ltd/seen-to-fail/actions/runs/1"
}
```

A record that says nothing about its source is read as one typed in by hand.
That is how the runs recorded before this existed stay valid: their filenames
are digests of their own contents, so adding a key to them would have meant an
append-only record rewriting its own past.

Nothing in the status rules reads any of this. A replay and a run typed in, with
the same outcome on the same day, leave a check reading the same thing.

## Where the commit comes from

Nothing in a record says which commit recorded it, because that commit does not
exist until the record is committed. The build reads it back out of the history
instead, which is also why a run cannot claim to have been recorded by a commit
that did not add it.

That is a different commit from a replay's `sourceCommit`, and the published
page names both rather than leaving them to be told apart by position. The
replay's is the tree the plant was applied to, which the job knew when it ran.
The recording one is the commit that added the file afterwards, which nothing
knew until it existed.

## Building the page

```sh
pnpm ledger:build
```

Loads these files into PostgreSQL, derives every status with the same SQL
function the running app reads, renders the page and the export, checks them
against the records they came from, and writes `dist/ledger` only if they
agree. It empties the development database first, exactly as `pnpm db:seed`
does.
