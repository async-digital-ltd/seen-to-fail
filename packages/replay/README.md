# The adapter

Reads a replay tool's report and says what runs it means. It writes nothing,
reads no files and knows nothing about a database: the writing is the ledger's
own recorder, called from `packages/server/src/scripts/record-replay.ts`, which
is where this package and that one meet.

The tool is `canfail` 0.2.1, adopted and pinned on #66 after both candidates
were read and run against a real check here. The two packages it grades with,
`didrun` and `restore-verified`, are pinned beside it by version and hash in
`.github/replay-requirements.txt` (#143).

## The mapping, pinned

| canfail verdict | the ledger records | `inconclusiveReason` |
| --------------- | ------------------ | -------------------- |
| `catches`       | caught             | none                 |
| `blind`         | missed             | none                 |
| `wrong-failure` | inconclusive       | canfail's own detail |
| `look`          | inconclusive       | canfail's own detail |
| anything else   | refused            | nothing is written   |

Those four are the whole vocabulary of 0.2.1. A fifth means the mapping is out
of date, which is a refusal naming the verdict rather than a guess, and it stops
the whole report rather than the one outcome: a tool this mapping no longer
describes did not produce the other verdicts any more reliably.

The reason is copied word for word rather than reworded. `look` is four
situations wearing one name, told apart only inside an English sentence, and
only one of them means the plant needs rewriting, so a category recovered by
matching that prose would send a reader to rewrite a plant that is fine.

## The exit code is not the verdict

`canfail` exits 1 when any guard was blind or failed the wrong way, and 0
otherwise. `blind` and `wrong-failure` both produce the 1; `catches` and `look`
both leave it at 0. So a run where every plant was caught and a run where the
build was already broken before anything was planted are the same number, and
both were measured at 0 against this repository. Nothing in this package or in
the workflow reads it. The per-break verdicts come from the JSON document and
from nowhere else.

## Where a check's address comes from

A report says what a check is called. It cannot say what the check's address is,
because `canfail` has no idea this ledger exists. A check is reached by its
ledger id and by nothing else (#71), so `canfail.json` carries a `checkId`
beside each check, under a key `canfail` ignores, along with the `expected` that
every recorded run has to carry.

Beside the plant rather than in a table of its own, for the reason #66 gave for
keeping the dependency list in the same file: a check's plant and the things
that bear on its proof are read and edited together.

A name the declaration does not declare is a refusal naming it, never a check
brought into being to receive the run.

## A report is held to the declared breaks

A run records what a check did with a declared plant, so the adapter reads the
name of every break `canfail.json` declares and holds the report to them, one
outcome for each (#128). For every check a report names, it refuses:

- an outcome for a break the declaration does not declare for that check;
- a declared break the report carries no outcome for;
- more than one outcome for the same declared break.

Each refusal names the check and the break, exits 1, and writes nothing,
including the outcomes that did match: a report that disagrees with the
declaration was not produced from the declaration it is being recorded
against, and the likeliest cause is the file edited on one branch and the
report coming from a job that ran on another. Names are compared rather than
counted, so a report with the right number of outcomes against the wrong
breaks is refused too.

Every break in the declaration therefore needs a `name`, and two breaks of one
check may not share one. The rule is this repository's, like the rule that
every check has a name: the name a report would carry for an unnamed break is a
rule inside `canfail`, and a copy of it here could disagree after an upgrade.

A declared check the report does not name is not a refusal. The workflow runs
`canfail` over the checks the selection found due and records against the whole
declaration, so a check absent from the report was not selected this time.

## Which checks a change touches

A replay that runs on every commit says nothing and costs money, so each check
declares what it depends on, beside its plant and under the same kind of key
canfail ignores (#68):

```json
{
  "name": "Type check",
  "checkId": "ci-type-check",
  "dependsOn": [".github/workflows/ci.yml", "packages", "tsconfig.base.json"],
  "run": "pnpm typecheck",
  "breaks": []
}
```

An entry is a path, as git spells it, relative to the repository root. It
matches a changed path when it is that path or when the path sits inside it, so
`packages` matches `packages/filter/src/types.ts` and does not match
`packages-elsewhere/a.ts`.

**One path is read more closely: the declaration itself.** Every check lists
`canfail.json`, because its plant lives there, and matched as a path an edit to
one check's entry made every check due (#165). So when `canfail.json` is among
the changed paths, the selection reads it as it stood at the commit the check is
measured from, and counts the change against a check only when that check's own
entry differs, keyed by `checkId` and compared with its keys in order, or when
anything outside `checks` differs, which every check shares. An earlier copy
that is missing or cannot be read by check id counts as a change to every
check, which is the path rule again and the safe direction.
`declarationChangeFor` in `src/dependencies.ts` holds the rule, and the script
logs each check whose entry it found unchanged.

Paths and not globs, deliberately. A glob dialect is a second language inside
the configuration, and which of `*` and `**` crosses a directory, whether a
leading dot is matched, and whether a slashless pattern matches at every depth
are none of them checkable by reading the file. Node's `path.matchesGlob` would
have supplied a dialect rather than inventing one, and it is still marked
experimental, which is a dependency on undocumented behaviour in the repository
whose subject is guards nobody has watched fail. A path can be checked with
`ls`.

Both ways a list can be wrong are safe, which is what makes the plainer matcher
affordable. Too broad replays a check that did not need it, which costs a minute
of a runner and files a record that is true. Too narrow means no replay arrives
on this route, and the check waits for the age floor below and then for the
thirty-day backstop. What a missed dependency costs is timeliness, not truth.
Neither can produce a false Proven, because nothing on this path writes a run.

**A check with no `dependsOn`, or one whose list matches nothing, is never
selected by this matching.** It is still selected by the age floor once its
proof has aged, because a list nobody has written says nobody has worked out
what voids the check's proof, which is a reason to keep proving it rather than a
reason to stop.

## What a check is measured against

The selection is `pnpm replay:select`, and the range it asks git about is per
check: everything that has changed since the commit that check's newest
recorded replay ran against, read from `sourceCommit` in the ledger. A check
nothing has ever replayed is measured against the empty tree, so every tracked
file counts as changed and the matching decides from there.

Per check rather than one range for the run, because a shared range would be
the newest of them: a check replayed a month ago would have its month of
changes hidden behind a check replayed yesterday, and would quietly stop being
replayed. And from the ledger rather than from a window of days, because a
window loses whatever changed inside a scheduled run that GitHub dropped.

## The age floor

A check is also due when its newest settled run is older than
`REPLAY_AFTER_DAYS`, which is fourteen days and lives beside the thirty-day
staleness threshold in `packages/server/src/staleness.ts`. That reverses what
#68 ruled, and it is a reversal rather than an addition: #68 said the schedule
deliberately does not refresh a proof that is merely old. The consequence is
what overturned it. Once a repository goes quiet nothing changes, so no check is
ever selected, so every proof ages out on the backstop with no automatic route
back, and a check does not stay Proven for as long as it keeps catching its
defect.

Newest **settled** run, and from any source. Settled because a replay that
came back inconclusive is not evidence about the check and the status rules
skip it, so reading it as freshness would hold the floor off while the last real
catch aged quietly past the backstop. From any source because what takes a check
Stale is the age of its latest settled run however it was recorded, so a check
somebody proved by hand this morning needs no replay for another month.

The floor cannot reach a check with no plant in `canfail.json`. That file is the
whole of what the selection reads checks from, so a check the ledger holds and
the declaration does not is not selectable by either route, however old its
proof is. Writing it a plant is the only thing that changes that.

Two things outside the floor decide whether it keeps a proof alive, and it is
worth saying both beside it. A person has to merge the branch each replay
pushes: the ledger's newest settled run does not move until that happens, so
the floor selects the same check again at every dispatch and the page still
reads Stale from day thirty-one. And the schedule has to stay enabled, which in
a public repository GitHub stops doing after sixty days without repository
activity (recorded on #111). The floor answers a quiet repository only as far as
those two hold.

**Which checks this covers: the six checks that carry runs.** The ledger holds
eleven checks. Six of them carry runs, and so have a status the backstop can
age; the other five carry an arming observation and no run at all, so they read
Unproven and there is no proof for a floor to keep alive.

`canfail.json` declares all six. `ci-type-check` was declared first, with two
breaks against `pnpm typecheck`. Three more were declared on #110, which
found them reading Stale from 19 October 2026 with no route back: their only
runs were typed in on 18 September, and a check the declaration does not
declare is not selectable by either route however old its proof is. Each of
them now carries a plant against the command CI runs for it:

- `ledger-record-validation` runs `pnpm ledger:validate` against a run file
  whose outcome is a word the ledger does not know, and against one naming a
  check that is not in the ledger. Both are the defects the validator exists
  to refuse, planted in a real record.
- `ledger-export-agreement` runs `pnpm ledger:build` against an export that
  drops one observation on the way through, and against a status tally that
  counts nothing. The build's own comparison of the record with what it built
  is what refuses both, which is the check.
- `ci-published-output` runs `pnpm ledger:build` and then the same
  `scripts/check-published-output.sh` CI runs, against two builds. The first
  writes a script tag into the page after the page it checked. That is a seam
  the build cannot see: a plant in the renderer is refused by the build's own
  script check before the CI step ever reads the file, so it would be a plant
  against the wrong check. What the CI step exists to do is read the output
  back off disk rather than trust the build, and the plant is a disk that
  disagrees with the build. The second, since #141, reads the commit it was
  built from as the parent of `HEAD`. The page and the export then agree with
  each other, so the build's own checks pass them, and only the step, which
  reads the commit from the checkout, can see that the "Built from" lines name
  a commit the page was not built from.

The last two were declared on #190 and #146, in the change that put them in the
ledger at all. Each had been seen to fail by hand and had no record:

- `ci-workflow-lint` runs `pnpm lint:workflows` against two workflows with an
  input name mistyped: `inputs.check_id` in `record-run.yml` and
  `inputs.only_due` in `replay.yml`. GitHub reads a mistyped input as an empty
  string rather than refusing it, so nothing else says so before the workflow
  runs. They are the two plants #157 pushed to its own pull request, where CI
  run 36984692843 failed on both. The command downloads its two linters on
  every run, so a replay that cannot reach them settles nothing rather than
  missing: a run that printed neither the pass line nor the failure line is
  read as not having run, and scored `look`. Since #200 it also runs against a
  script: `"$page"` left unquoted in the first test of
  `scripts/check-published-output.sh`, the plant CI run 37221005997 failed on
  when #191 added the script lint. Its `expect` is the line shellcheck prints
  naming that file, which only the script lint prints, and its `dependsOn`
  names all of `scripts/` rather than the lint script alone.
- `ci-server-start` runs `scripts/check-server-starts.sh` against two entry
  points. The first imports `./environment` without its file extension, which
  the type check accepts and Node cannot resolve. That is the failure the step
  was written for (#35), where every step before it is green, and it is the
  plant CI run 37219973975 failed on. The second starts a timer where it would
  listen, so the process stays up and never binds the port, and the script
  refuses on its timeout rather than on an exit. That plant costs the script's
  whole wait, thirty seconds, each time it is replayed.

The build derives every status in PostgreSQL, so the replay job now starts the
same service container CI does and creates and migrates the databases before
the tool runs. A plant against the build in a job with no database would score
`look` on every dispatch, and the adapter would file an inconclusive run each
week that settles nothing while the proof aged out regardless.

Every check declares `evidence`: a line the command prints whether it passes
or refuses, so that a check which never ran is told apart from one that ran
and missed. The published-output script prints one on every exit for exactly
this reason.

Two plants were considered for `ci-published-output` when #110 declared its
first. A build that writes to a directory other than the one CI reads is caught
by the step's `test -f` lines, but its stale predecessor from the clean-tree run
would still be sitting there for the check to read, so the plant would pass or
fail on what the previous run left behind. That one is still not declared. A
build that reads the commit it was built from as the parent of `HEAD` was
invisible to the step's `grep` whenever `HEAD` itself added a run to the
ledger, because that commit is then named on the page as the one that recorded
the run: the step's commit guard was satisfied by any mention of the commit,
not by the "Built from" line. That was a weakness of the step rather than of the
plant, so it was recorded as #141 rather than planted as a proof that would flip
between caught and missed with the commit it ran against. #141 made the step
read the "Built from" lines alone, so the plant no longer flips, and it is the
second one declared above.

## The statuses it exits with

It exits 0 when something is due, 3 when nothing is, and 1 when it refuses. The
workflow reads that status to decide whether to install the replay tool at all.
