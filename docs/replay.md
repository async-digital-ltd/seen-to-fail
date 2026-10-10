# A replay, start to finish

Ten checks are declared for replay by a job: `ci-type-check`,
`ci-published-output`, `ledger-export-agreement`, `ledger-record-validation`,
`ci-workflow-lint`, `ci-server-start`, `ci-format-check`, `ci-lint`, `ci-test`
and `ci-build-web`. `canfail.json` declares those ten, with seventeen declared
breaks between them; `ledger/checks/` holds eleven. So one of those eleven,
`ci-codegen-check`, has no plant for a job to apply, and no replay can produce a
run for it; why it has none is under
[How much of this record is automatic](automatic.md).
How far replays have reached each of the ten is the table there, which also
says plainly what that leaves automatic and what it does not.

The replaying is not this project's work. [`canfail`](https://pypi.org/project/canfail/)
0.2.1 does it: handed a declaration of planted defects, it runs the check on a
clean tree first, applies each declared break in turn, runs the check again, and
scores what happened. The version is pinned in the workflow, because an
unpinned install would let the scoring change under a ledger that cannot yet see
which version produced a verdict
([#101](https://github.com/async-digital-ltd/seen-to-fail/issues/101)).

What this project adds is everything after the verdict. `canfail` answers
whether a check caught a defect just now, and then forgets. The ledger answers
whether the check has ever been seen to catch one, how long ago, and whether
anything has changed since: a record per planted defect, a history per check, a
status read off that history by one SQL function, and a proof that goes stale.

The declaration is `canfail.json` at the root, in `canfail`'s own format. This
project defines no format of its own. Two keys sit beside each check that
`canfail` ignores and this project reads:

```json
{
  "name": "Type check",
  "checkId": "ci-type-check",
  "dependsOn": ["packages", "tsconfig.base.json", "pnpm-lock.yaml"]
}
```

`checkId` is the check's address in the ledger and the only way anything outside
the app names a check. `dependsOn` is the paths that bear on the check's proof,
spelled as git spells them, relative to the root; an entry matches a changed
path when it is that path or when the path sits inside it. `canfail.json` itself
is the one exception: listed by every check, a change to it counts against a
check only when that check's own entry, or something every check shares,
changed (#165). Both keys sit once on
the check and not once per break, which is what makes them a statement about the
check's proof rather than about one plant. The list above is shown short:
`canfail.json` carries all eight of that check's entries, `canfail`'s own keys
beside them, and its two declared breaks, and a list of its own for each of
the other nine checks. What each of those nine plants, and why, is in
`packages/replay/README.md`.

The job is `.github/workflows/replay.yml`. Its schedule asks for one run a week,
`cron: '17 4 * * 1'`, which is 04:17 UTC on a Monday, and it can also be
dispatched by hand, which is the route for a declared check wanted back sooner
than the age floor below would bring it.

What the cron asks for and what the runner does are two different claims, and
only the second is a measurement. As of 1 October 2026 two scheduled runs have
happened.
[35585966476](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35585966476)
was created at 09:55:38 UTC on Monday 21 September 2026, five hours and
thirty-eight minutes after the time it asked for, and
[36412371539](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/36412371539)
at 10:53:35 UTC on Monday 28 September 2026, six hours and thirty-six minutes
after it. Both delays are GitHub queueing the run rather than anything in this
repository. So the cadence to plan against is about one run a week, and the
time of day in the cron is a request.

Weekly rather than on every push, because a replay filed on every merge would
bury the runs that say something under runs that say the same thing again. Each
replay runs a check once on a clean tree and once per declared break, so a
dispatch that replays every declared check runs one check per declared check
and one per declared break. With `canfail.json` as it stands on 5 October 2026,
ten checks and seventeen breaks, that is 27: three each of
`pnpm typecheck`, the build, the build followed by the published-output script,
`pnpm ledger:validate` and the server start script, four of
`pnpm lint:workflows`, and two each of `pnpm format:check`, `pnpm lint`,
`pnpm test` and `pnpm build:web`.
While the
repository was private those
runs also spent a finite allowance of runner minutes; that reason lapsed when it
was made public on 27 September 2026, and the cadence rests on the record alone. Weekly also
sits inside the thirty-day backstop with room to spare: a run that arrives
notices a change within seven days and leaves twenty-three days of margin, and a
run the scheduler drops is caught by the backstop rather than by the cadence,
which is what the backstop is for. The replay is deliberately not part of the CI
workflow that runs on every pull request: `canfail` edits real source files on
disk and restores them, which is fine on a runner nobody else is using and is
not something to put in the path of every contributor's change.

The job does seven things:

1. **Works out which checks are due**, with `pnpm replay:select`. It exits 0
   when something is due, 3 when nothing is, and 1 when it refuses, and the
   workflow reads that status rather than looking for an output file, because a
   missing file cannot tell a refusal from an honest empty answer.
2. **Creates and migrates the databases**, the same way CI does and against
   the same kind of service container, because two of the declared checks are
   the build and the build derives every status in PostgreSQL. Only once
   something is due; the service itself starts with the job.
3. **Installs `canfail` 0.2.1 and runs it** over the declaration, writing the
   report under the runner's temporary directory rather than into the checkout.
   The two packages its verdicts rest on, `didrun` and `restore-verified`, are
   installed with it, each pinned by version and hash. All of this, and step 4,
   is one step: the
   [canfail-action](https://github.com/async-digital-ltd/canfail-action)
   release the workflow pins by SHA, whose `requirements.txt` holds the pins.
4. **Checks the tree came back.** `canfail` edits real files and puts them back,
   and a restore that ran is not a restore that worked: a tree that did not come
   back leaves every break after the failed one scored against a tree nobody
   declared, so the job stops instead of recording them.
5. **Records what the report means**, with `pnpm ledger:replay`. One run per
   declared break, each carrying `source: replay`, the commit the plants were
   applied to, and a link to the run that produced it.
6. **Validates the whole ledger**, with the same `pnpm ledger:validate` that CI
   and the hand-recording workflow run, so this job cannot commit a ledger
   either of them would have refused.
7. **Pushes `replay/<run id>` and says what is waiting**, printing the
   `gh pr create` command into the run summary. It does not open the pull
   request. The printed title takes its ticket number from `TICKET`, and the
   command will not run until that is set, so the merged commit's subject
   names the issue the replay evidences
   ([#116](https://github.com/async-digital-ltd/seen-to-fail/issues/116)). A green run here means recorded and waiting for a person; it does
   not mean done.

**What makes a check due.** A check is replayed when either of two things
holds: a path matching its `dependsOn` list has changed since that check was
last replayed, or its newest settled run is older than an age floor,
`REPLAY_AFTER_DAYS` in `packages/server/src/staleness.ts`, which is fourteen
days, chosen so that the weekly schedule gets two attempts at a refresh before
the thirty-day rule takes a proof Stale. Either route can select only a check
that has a plant in `canfail.json`, so today both reach the ten checks declared
there and not the one left out of it. For the
dependency route, the range is worked out per check
rather than once for the run. The anchor is the
`sourceCommit` of that check's newest recorded replay, read back out of the
ledger, and newest means newest by git's count of commits to `HEAD` rather than
by the day the run was recorded on, because two replays recorded on one day
carry no order between them. One shared anchor would be the newest of them all,
so a check replayed a month ago would have its month of changes hidden behind a
check replayed yesterday and would quietly stop being replayed.

Two things about that range are decisions rather than details. It is the whole
window since the check was last proved and not the last commit, because a weekly
cadence puts several commits between one dispatch and the next and the one that
matters is rarely the one that happened to land last. And it is the difference
between two trees rather than the union of every path the commits in it touched,
so a dependency edited and put back inside the window leaves the check's proof
standing: the proof is about a tree, and the tree is the one it was proved
against.

A check that has never been replayed is measured against the empty tree, so
every tracked file counts as changed and the matching decides from there. A
check with no `dependsOn`, or one whose list matches nothing, is never selected
by dependency. It is selected by the floor once its proof has aged, because a
list nobody has written says nobody has worked out what voids that check's
proof, which is a reason to keep proving it rather than to stop. A dispatch
replays every declared check unless its `only-due` box is ticked, which is what
lets the hand route reach a check sooner than either route would.

All of that needs the whole history, which is why the job checks out with
`fetch-depth: 0` and why the selection refuses a shallow clone outright rather
than answering from one. In a shallow clone every recorded commit is
unreachable, so every check would fall back to the empty tree and every check
with a list would be replayed on every run. That is a guard that always says
yes, which is the failure this repository exists to describe, so it refuses
instead.

The mapping from a verdict to a record is fixed, and those four verdicts are the
whole vocabulary of 0.2.1:

| `canfail` verdict | the ledger records | `inconclusiveReason`   |
| ----------------- | ------------------ | ---------------------- |
| `catches`         | caught             | none                   |
| `blind`           | missed             | none                   |
| `wrong-failure`   | inconclusive       | `canfail`'s own words  |
| `look`            | inconclusive       | `canfail`'s own words  |
| anything else     | nothing is written | the whole report stops |

A fifth verdict means the mapping is out of date, which is a refusal naming it
rather than a guess, and it stops the whole report rather than the one outcome:
a tool this mapping no longer describes did not produce the other verdicts any
more reliably. The reason is copied word for word rather than reworded, for the
reason the status model in [how-it-works.md](how-it-works.md) gives.

**What that produced.** Run
[35585966476](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35585966476)
is the first replay in this record that nobody started. GitHub's scheduler
created it at 09:55:38 UTC on Monday 21 September 2026, against `81e159c` on
`main`. Its one job ran eighteen steps and every one of them concluded
`success`. The selection found one check due, printing
`Type check (ci-type-check) is measured against 62e34e977f2241cbe33b948cc31afd287b5420ed, where 22 path(s) changed`
into the log; `canfail` scored both declared breaks and exited 0; the adapter
wrote two `caught` runs; the job pushed `replay/35585966476` and printed the
`gh pr create` command into the run summary. A person opened
[#115](https://github.com/async-digital-ltd/seen-to-fail/pull/115), and merging
it as `f1348f8` is what put the two records in `ledger/runs/`. Both read
`"outcome": "caught"` and `"source": "replay"` against a `sourceCommit` of
`81e159c`. One of the two:

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

**What that record cannot tell you is that it was scheduled.** Those ten fields
are the whole of a replay record, and none of them names what started the job.
`source` has two values, `hand` and `replay`, so it separates a job from a
person typing, and a replay somebody dispatched is a job too. The cron firing is
visible on the run `sourceRunUrl` points at, and nowhere in this repository. So
the paragraph above is checkable from the repository as far as "a job recorded
this", and the rest of it needs the link followed.

**The same route, walked by hand first.** Run
[35429662430](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35429662430)
did all of that on 19 September 2026 against `62e34e9`, dispatched by a person
rather than by the schedule, and its two records came in through
[#103](https://github.com/async-digital-ltd/seen-to-fail/pull/103). A second
dispatched run,
[35437095049](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35437095049),
followed the same day against `333dab1` to prove the selection before the
schedule had ever fired, and its two records came in through
[#124](https://github.com/async-digital-ltd/seen-to-fail/pull/124) on 23
September. All three pairs are in `ledger/runs/` and their `sourceRunUrl` is
what tells them apart. Nothing about the machinery differs between the three
runs. What differs is that on the
Monday nobody decided a replay was due, which is the whole of what the automatic
half was for.

**And since.** By 1 October 2026 two more replays had reached the record, each
over all four checks declared at the time. The schedule fired again on Monday
28 September 2026 as run
[36412371539](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/36412371539),
against `33b5238`, and its seven records, the first replays of the three checks
declared on #110, came in through
[#168](https://github.com/async-digital-ltd/seen-to-fail/pull/168) as `6f29d42`.
A dispatched run,
[36588226891](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/36588226891),
followed on 29 September 2026 against `ec2b3bd`, and its eight records came in
through [#169](https://github.com/async-digital-ltd/seen-to-fail/pull/169) as
`bb3e011`. It wrote one more than the run before it because `ec2b3bd` is the
commit that declared a second break for `ci-published-output`.

**And the half that matters more.** A route that records a catch is worth
nothing until the same route has been seen not to record one. Run
[35431432957](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35431432957)
ran the same replay against `ci-control/67-red-baseline` at `7d7e24c`, a branch
where the type check was already failing before anything was planted. That the
baseline really was red, and red for the declared reason, is CI run
[35431434499](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35431434499)
on the same branch, which concluded failure with `Type check` the step that
failed. `canfail` scored both breaks `look`, the adapter wrote two
`inconclusive` runs carrying `canfail`'s own sentence as the reason, and no
`caught` run was written. `canfail` exited 0 in both halves, so the process
status could not have told the two apart; the records did, which is why the
observation is the absent `caught` row and not an exit code. Those two records
describe that control branch rather than `main` and were left on
`replay/35431432957`, which is why `ledger/runs/` holds no inconclusive run.

**Neither workflow opens its own pull request.** GitHub Actions is not permitted
to create pull requests on this repository, and neither workflow tries. Each
pushes its branch, ends green, and names the branch and the command that opens
the pull request in its run summary, so a green run means recorded and waiting
for a person, not done. `Record a run` used to try, and ended red at that last
step with the record already committed and pushed: measured on 18 September
2026 in run
[35405970369](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35405970369),
which failed with `GitHub Actions is not permitted to create or approve pull
requests (createPullRequest)`. The switch that would allow either of them,
"Allow GitHub Actions to create and approve pull requests", is off:
`gh api repos/async-digital-ltd/seen-to-fail/actions/permissions/workflow`
answers `"can_approve_pull_request_reviews": false`, re-checked on
22 September 2026. It couples creating to approving, so turning it on to let a
job open a pull request also lets automation approve one, in a repository whose
whole subject is whether automated checks can be trusted to have been checked.
Tracked at
[#74](https://github.com/async-digital-ltd/seen-to-fail/issues/74), which also
holds the cost of a red run that has already recorded something. The automatic
half is not automatic end to end until that is settled.
