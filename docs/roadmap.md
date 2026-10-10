# What shipped, and where it could go

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="roadmap-dark.svg">
  <img alt="A timeline with two points. A filled circle, version 1, by hand. Manual: every step by hand. You make a throwaway branch, break the code, run the check, confirm it failed, delete the branch, then record the result in the app. A line joins it to a half-filled circle, version 2, shipped, in part. Automatic: replayed for you. You write the breaking change once. A job applies it, runs the check, removes it and records the result for you." src="roadmap-light.svg">
</picture>

**Version 1 is manual, and every check recorded here with no plant declared
still is.**
Proving one check means making a throwaway branch, breaking the code in the way
that check exists to catch, running the check, confirming it failed for that
reason and not another, deleting the branch, and then writing down what
happened. The app holds the record. Every step that produces the record is
yours. The table under
[How much of this record is automatic](automatic.md)
names the checks still proved this way.

That is the weakness, and it is the one the app exists to show in checks: a
record made that way goes stale as soon as people stop doing all of it. Thirty
days is only a stand-in for what actually voids a proof, which is a change to
something the check depends on: its workflow, its configuration, the version of
its tool.

**Version 2 automates all of that except deciding what to break, for a check
that has a plant declared.** You write the breaking change once and keep it
beside the code, with the list of things its check depends on. A job applies it,
runs the check, confirms it failed for that reason, puts the code back and
records the result. Nobody opens the app. You write the plant in the format of
the tool that replays it rather than in one this project invents, and what this
project adds is the record. That is not a direction any more: it is
`canfail.json`, `.github/workflows/replay.yml` and the ledger documentation in [published-ledger.md](published-ledger.md) and [replay.md](replay.md). The
first replay nobody started was the scheduled run of Monday 21 September 2026,
which reached the record as `f1348f8`, and the scheduled ones are the ones the
epic was for. Every replay run merged to `main` is in `ledger/runs/`, and how
far replays have reached each declared check is the table under
[How much of this record is automatic](automatic.md).

**What is still only a direction** is the rest of the reach, and it is worth
being specific about which parts:

- **The checks with no plant declared.** A plant is written once, by a person,
  and nothing writes one for you. Epic
  [#62](https://github.com/async-digital-ltd/seen-to-fail/issues/62) names
  writing plants automatically as out of scope, so until somebody writes them,
  those checks are proved by hand or not at all.
- **A runner of this project's own.** An existing one was adapted rather than
  written, and writing one is only worth it if the adapter shows the ledger
  earns its keep and the tool cannot be made to fit.
- **A record that knows which tool produced a verdict.** The versions are pinned
  in the canfail-action release the replay pins and named in [replay.md](replay.md), which is prose
  rather than record: the
  ledger cannot yet tell you that a run was scored by `canfail` 0.2.1
  ([#101](https://github.com/async-digital-ltd/seen-to-fail/issues/101)).
- **End to end without a person.** Neither recording workflow lands its own
  record. Each pushes a branch and names it, with the command that opens the
  pull request, in its run summary, and a person opens the pull request
  ([#74](https://github.com/async-digital-ltd/seen-to-fail/issues/74)).
- **Plants that need a branch pushed and another workflow's verdict awaited.**
  Everything here replays in place, on one runner, in one job. Anything else is
  a later epic if in-place replays prove useful.

Some checks cannot be broken on purpose in any of those ways, a review bot or
branch protection among them. Those stay manual. Thirty days stays too, as a
backstop for changes nobody thought to list, so if the automatic runs stop
arriving, Proven checks still drift to Stale.
