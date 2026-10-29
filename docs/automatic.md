# How much of this record is automatic

Every check in `ledger/checks/` but one is declared for replay by a job:
`canfail.json` declares a plant for each of them, and the one it leaves out,
`ci-codegen-check`, is the whole difference. The first six declared were first
replayed by 4 October 2026. Four more were declared on
[#228](https://github.com/async-digital-ltd/seen-to-fail/issues/228) and first
replayed by run
[37297249729](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/37297249729),
dispatched on 5 October 2026 once the replay had turned colour off
([#232](https://github.com/async-digital-ltd/seen-to-fail/pull/232)). The bundle
check, `ci-bundle-check`, was declared on
[#253](https://github.com/async-digital-ltd/seen-to-fail/issues/253) and first
replayed by run
[40878154653](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/40878154653),
dispatched on 29 October 2026 against the commit that declared it.

The counts themselves are not written here, because every replay that is merged
moves them. The [published ledger](https://seen-to-fail.async-digital.com/)
shows each check's status and every run behind it, marked by hand or by replay,
built from the ledger on every push to `main`. For the same record as tables,
run:

```sh
pnpm ledger:counts
```

It prints one row per check, with its declared breaks, its runs by source and
its first and latest replay, then the totals, then how many runs each replay
wrote, all counted from `ledger/` and `canfail.json` as they stand. A day is
the day a run was recorded against, in UTC. Until #270 these tables were
committed here and in `ledger/README.md`, and every replay branch rewrote them,
so two replays waiting at once always conflicted.

You can also count by hand, and the arithmetic is the point of showing it,
denominators and all: `ls ledger/checks` lists the checks, `cat canfail.json`
the plants, `ls ledger/runs | wc -l` counts the runs and
`grep -l '"source": "replay"' ledger/runs/*.json | wc -l` the ones that came
from a replay.

Where those runs came from, which the counts cannot say:

| Checks                                                                       | What their record rests on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci-type-check`                                                              | A declared plant, replayed by the workflow in [replay.md](replay.md), and first replayed by run [35429662430](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35429662430), which was dispatched. Its one run typed in by hand was planted, watched and typed in by a person.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ci-published-output`, `ledger-export-agreement`, `ledger-record-validation` | A declared plant since #110, selectable by both routes, and first replayed by run [36412371539](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/36412371539), a scheduled run. Each carries one run planted, watched and typed in by hand, and every later run came from a replay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ci-workflow-lint`, `ci-server-start`                                        | A declared plant since [#190](https://github.com/async-digital-ltd/seen-to-fail/issues/190) and [#146](https://github.com/async-digital-ltd/seen-to-fail/issues/146), selectable by both routes, and first replayed by run [37220648439](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/37220648439), dispatched against `754b74f`, the first commit of [#195](https://github.com/async-digital-ltd/seen-to-fail/pull/195) before it was squashed onto `main`, which caught every declared break of all six checks. Each also carries one run typed in by hand on 4 October 2026. The workflow lint's is the CI run of 2 October 2026 that failed on two mistyped input names, typed in from that run by a session that did not watch it. The server start's is a plant pushed to a `ci-control/` branch that day and watched failing that step alone.                                                                                                                                                                                                                        |
| `ci-build-web`, `ci-format-check`, `ci-lint`, `ci-test`                      | A declared plant since [#228](https://github.com/async-digital-ltd/seen-to-fail/issues/228), selectable by both routes, and first replayed by run [37297249729](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/37297249729), which caught the one declared break of each. Each plant was seen caught under `canfail` 0.2.1 on a development machine before it was declared, beside a control whose `expect` named nothing the check prints, which scored `wrong-failure` rather than a catch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ci-bundle-check`                                                            | A declared plant since [#253](https://github.com/async-digital-ltd/seen-to-fail/issues/253), selectable by both routes, and first replayed by run [40878154653](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/40878154653), dispatched against the commit that declared it, which caught both declared breaks: the client entry importing the whole of `graphql`, and four unused CSS classes that grow the CSS past its tolerance while the whole build stays inside its own. Both were seen caught under `canfail` 0.2.1 on a development machine before they were declared, beside a control that swapped their two `expect` lines, which scored `wrong-failure` for each. The same replay recorded the tests' plant as a run that settled nothing, because at that commit the tests failed on the clean tree: they then held this table to the ledger, and the run they needed for this row did not exist until the replay wrote it. Since #270 they no longer do, so a newly declared check needs no replay before it can merge.                                        |
| `ci-codegen-check`                                                           | One run, typed in by hand, and no plant. The step regenerates the types and compares them with what git has committed, so the defect it catches is a committed one, and a plant `canfail` applies is never committed. A generated file edited by hand is regenerated over and the comparison passes, which `canfail` scored `blind`. A query edited without regenerating is caught, but leaves the regenerated files changed on disk, which `canfail` does not put back and the replay's tree check refuses. So its run was planted by a person: a query committed without regenerating, pushed to a `ci-control/` branch on 5 October 2026 and seen failing at that step in CI run [37295226381](https://github.com/async-digital-ltd/seen-to-fail/actions/runs/37295226381), then typed in ([#231](https://github.com/async-digital-ltd/seen-to-fail/pull/231)). It reads Proven on that hand run alone. Nothing replays it, so it reads Stale from 5 November 2026 unless a person plants it again first or [#236](https://github.com/async-digital-ltd/seen-to-fail/issues/236) is built. |

None of that is a promise that broke. Epic
[#62](https://github.com/async-digital-ltd/seen-to-fail/issues/62) scoped the
automatic half to adapting an existing runner against real checks here, and
names writing plants automatically, a runner of this project's own, and checks
that cannot be broken on purpose at all as out of scope. It is said here rather
than left to be worked out because a reader who discovers the reach of a thing
for themselves, after the page implied more, is right to stop believing the rest
of the page.
