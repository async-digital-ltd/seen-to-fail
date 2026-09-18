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
  "note": null
}
```

## Where the commit comes from

Nothing in a record says which commit recorded it, because that commit does not
exist until the record is committed. The build reads it back out of the history
instead, which is also why a run cannot claim to have been recorded by a commit
that did not add it.

## Building the page

```sh
pnpm ledger:build
```

Loads these files into PostgreSQL, derives every status with the same SQL
function the running app reads, renders the page and the export, checks them
against the records they came from, and writes `dist/ledger` only if they
agree. It empties the development database first, exactly as `pnpm db:seed`
does.
