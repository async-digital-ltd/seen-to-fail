# How much of this record is automatic

Ten of the eleven checks in `ledger/checks/` are declared for replay by a job,
and all ten had been replayed by 5 October 2026. Six of them had first been
replayed by 4 October 2026. The other four were declared on
[#228](https://github.com/async-digital-ltd/seen-to-fail/issues/228) and first
replayed by run
[37297249729](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/37297249729),
dispatched on 5 October 2026 once the replay had turned colour off
([#232](https://github.com/async-digital-ltd/seen-to-fail/pull/232)), which
caught all seventeen declared breaks of the ten. The eleventh,
`ci-codegen-check`, is not declared, and the whole difference is one file:
`canfail.json` declares a plant for each of the ten and for no other check.

What each check's record rests on, counted from `ledger/runs/` and
`canfail.json`. `pnpm readme` writes this table and the paragraph under it, and
CI fails while either differs from the ledger, so a replay that is merged
cannot leave them telling the old story. A day is the day a run was recorded
against, in UTC.

<!-- generated: replay-table, by pnpm readme from ledger/checks/, ledger/runs/ and canfail.json -->

| Check                      | Declared breaks | Runs | From a replay | Typed in by hand      | First replayed    | Latest replay   |
| -------------------------- | --------------- | ---- | ------------- | --------------------- | ----------------- | --------------- |
| `ci-build-web`             | 1               | 4    | 4             | 0                     | 5 October 2026    | 29 October 2026 |
| `ci-bundle-check`          | 2               | 2    | 2             | 0                     | 29 October 2026   | 29 October 2026 |
| `ci-codegen-check`         | Not declared    | 1    | 0             | 1 (5 October 2026)    | Never             | Never           |
| `ci-format-check`          | 1               | 4    | 4             | 0                     | 5 October 2026    | 29 October 2026 |
| `ci-lint`                  | 1               | 4    | 4             | 0                     | 5 October 2026    | 29 October 2026 |
| `ci-published-output`      | 2               | 18   | 17            | 1 (18 September 2026) | 28 September 2026 | 29 October 2026 |
| `ci-server-start`          | 2               | 15   | 14            | 1 (4 October 2026)    | 4 October 2026    | 29 October 2026 |
| `ci-test`                  | 1               | 4    | 4             | 0                     | 5 October 2026    | 29 October 2026 |
| `ci-type-check`            | 2               | 25   | 24            | 1 (18 September 2026) | 19 September 2026 | 29 October 2026 |
| `ci-workflow-lint`         | 3               | 21   | 20            | 1 (2 October 2026)    | 4 October 2026    | 29 October 2026 |
| `ledger-export-agreement`  | 2               | 19   | 18            | 1 (18 September 2026) | 28 September 2026 | 29 October 2026 |
| `ledger-record-validation` | 2               | 19   | 18            | 1 (18 September 2026) | 28 September 2026 | 29 October 2026 |

<!-- end generated: replay-table -->

<!-- generated: replay-totals, by pnpm readme from ledger/checks/, ledger/runs/ and canfail.json -->

Twelve checks are on the page, eleven of them are declared for replay, and all eleven have been replayed. All twelve have a run behind them. `ledger/runs/` holds 136 runs: 129 came from twelve replays and seven were typed in by hand. The latest replay among them ran on 29 October 2026.

<!-- end generated: replay-totals -->

You can check that with `ls ledger/checks`, `ls ledger/runs` and `cat
canfail.json`, and the arithmetic is the point of showing it, denominators and
all: `ls ledger/runs | wc -l` counts the runs and
`grep -l '"source": "replay"' ledger/runs/*.json | wc -l` the ones that came
from a replay.

Where those runs came from, which the counts cannot say:

| Checks                                                                       | What their record rests on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci-type-check`                                                              | A declared plant, replayed by the workflow in [replay.md](replay.md), and first replayed by run [35429662430](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35429662430), which was dispatched. Its one run typed in by hand was planted, watched and typed in by a person.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ci-published-output`, `ledger-export-agreement`, `ledger-record-validation` | A declared plant since #110, selectable by both routes, and first replayed by run [36412371539](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/36412371539), a scheduled run. Each carries one run planted, watched and typed in by hand, and every later run came from a replay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ci-workflow-lint`, `ci-server-start`                                        | A declared plant since [#190](https://github.com/async-digital-ltd/seen-to-fail/issues/190) and [#146](https://github.com/async-digital-ltd/seen-to-fail/issues/146), selectable by both routes, and first replayed by run [37220648439](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/37220648439), dispatched against `754b74f`, the first commit of [#195](https://github.com/async-digital-ltd/seen-to-fail/pull/195) before it was squashed onto `main`, which caught every declared break of all six checks. Each also carries one run typed in by hand on 4 October 2026. The workflow lint's is the CI run of 2 October 2026 that failed on two mistyped input names, typed in from that run by a session that did not watch it. The server start's is a plant pushed to a `ci-control/` branch that day and watched failing that step alone.                                                                                                                                                                                                                        |
| `ci-build-web`, `ci-format-check`, `ci-lint`, `ci-test`                      | A declared plant since [#228](https://github.com/async-digital-ltd/seen-to-fail/issues/228), selectable by both routes, and first replayed by run [37297249729](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/37297249729), which caught the one declared break of each. Each plant was seen caught under `canfail` 0.2.1 on a development machine before it was declared, beside a control whose `expect` named nothing the check prints, which scored `wrong-failure` rather than a catch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ci-codegen-check`                                                           | One run, typed in by hand, and no plant. The step regenerates the types and compares them with what git has committed, so the defect it catches is a committed one, and a plant `canfail` applies is never committed. A generated file edited by hand is regenerated over and the comparison passes, which `canfail` scored `blind`. A query edited without regenerating is caught, but leaves the regenerated files changed on disk, which `canfail` does not put back and the replay's tree check refuses. So its run was planted by a person: a query committed without regenerating, pushed to a `ci-control/` branch on 5 October 2026 and seen failing at that step in CI run [37295226381](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/37295226381), then typed in ([#231](https://github.com/async-digital-ltd/seen-to-fail/pull/231)). It reads Proven on that hand run alone. Nothing replays it, so it reads Stale from 5 November 2026 unless a person plants it again first or [#236](https://github.com/async-digital-ltd/seen-to-fail/issues/236) is built. |

None of that is a promise that broke. Epic
[#62](https://github.com/async-digital-ltd/seen-to-fail/issues/62) scoped the
automatic half to adapting an existing runner against real checks here, and
names writing plants automatically, a runner of this project's own, and checks
that cannot be broken on purpose at all as out of scope. It is said here rather
than left to be worked out because a reader who discovers the reach of a thing
for themselves, after the page implied more, is right to stop believing the rest
of the page.
