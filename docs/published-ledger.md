# The published ledger

No service is hosted. The app the [README](../README.md#run-it-locally) describes is for running locally; what gets published is
a record rather than a service.

A run reaches that record by being committed. `ledger/` holds one JSON file per
check, run and arming observation, and a build turns those files into a static
page. The database and the status rules do not go away: the records are loaded
into PostgreSQL, every status comes back out of the same `check_summaries`
function the running app reads, and the page is rendered from what that
produced. They run inside the build instead of behind a URL.

```sh
pnpm ledger:validate   # refuse a record that breaks a rule
pnpm ledger:build      # build dist/ledger from the records
```

`ledger/README.md` sets the record's shape out in full.

The write path is a commit, so a run that is wrong has an author and a diff, and
can be reverted like anything else in the history. The author and the diff are
real and you can read them: `git log -- ledger/` is the history of every record
this project has written about itself: eight commits as of 22 September 2026,
four that added a file and four that changed one, and none that removed
anything. That last is what `git log --diff-filter=D -- ledger/` answering with
silence means. The revert is a property of git rather than something this
repository has exercised, so it is the part of that sentence to read as
untested.

What nothing holds is a long-lived token against a running instance, because
there is no instance to write to. Both workflows, the one below and the [replay](replay.md), run on the short-lived
`GITHUB_TOKEN` the runner is handed and carry no secret of their own, so there
is nothing here to leak, rotate or scope. Their `permissions:` blocks are the
whole of what they can do and are the same one line: each asks for `contents:
write` and nothing else, because neither tries to open its own pull request.
What either of them writes is a commit on a branch that a person then has to
merge.

## A run recorded by hand

`Record a run` (`.github/workflows/record-run.yml`) is the job's half of the
manual route. It takes the result somebody watched, refuses a malformed one
before anything is written, commits the record and pushes a branch. The
command it prints to open the pull request takes its ticket number from
`TICKET` and will not run until that is set, so a squash merge's subject names
the issue the run evidences
([#174](https://github.com/async-digital-ltd/seen-to-fail/issues/174)).

The watching has a lane of its own. CI runs on every push to a branch under
`ci-control/` as well as on `main` and on pull requests, which is where a defect
gets planted against this repository's own CI: branch, plant it, push under
`ci-control/`, read the conclusion, delete the branch. Keeping the lane in the
shipped workflow means what goes red is the workflow that really runs on `main`
rather than a variant edited to be reachable. The badge at the top of the [README](../README.md)
is pinned to `main`, so a red control run cannot paint it red.
