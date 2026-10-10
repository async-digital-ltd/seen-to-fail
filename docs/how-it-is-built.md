# How it is built

The code in this repository was written by Claude, an AI coding agent, under
the owner's direction. The owner set the scope, the status model and the rulings
recorded in the issues, and checked the work, but did not write the TypeScript.
The sample data is invented.

Code written that way is only as trustworthy as the checking behind it, so here
is what was checked, what was not, and where the evidence for each is.

- **Planted defects, watched being denied.** Tests were trusted once the defect
  they exist for had been planted and seen to fail them. On the story that built
  the add-check form, 12 defects were planted and all 12 were caught, on that
  session's own account; the plants were restored, so the record is the comment
  on [#24](https://github.com/async-digital-ltd/seen-to-fail/issues/24) and
  nothing in the tree remains to re-check.
- **The fault none of them could see.** That same branch built only one of the
  two entry points its ticket named. The planted defects, a code review and the
  acceptance check all passed it, because each examined what the branch
  contained and the fault was something missing. It was caught when the README
  screenshot, retaken from the branch and expected to show the new link, came
  back byte-identical to the one before. That is the session's own account, on
  [#24](https://github.com/async-digital-ltd/seen-to-fail/issues/24).
- **A scanner trusted only after it fired.** The whole history, every branch
  and every pull request head from the root, was scanned for secrets with
  gitleaks as the last step before the repository was made public on 27
  September 2026, and the result counted only once the same scan had reported
  a planted key. The first runs are recorded on
  [#29](https://github.com/async-digital-ltd/seen-to-fail/issues/29), and
  every later run, with its command and its result, on
  [#55](https://github.com/async-digital-ltd/seen-to-fail/issues/55). Those are
  one session's account. The history is public, so the scan itself can be run
  again by anyone; the planted key it was trusted on cannot be seen from here.
- **A walkthrough by hand.** The run instructions in the [README](../README.md#run-it-locally) were followed from a
  fresh clone on 16 September 2026, before the ledger commands were added to
  them. Every command then present worked, and one sentence led a Homebrew
  reader into database URLs the server refuses, which CI had no way to notice
  ([#27](https://github.com/async-digital-ltd/seen-to-fail/issues/27),
  [#48](https://github.com/async-digital-ltd/seen-to-fail/pull/48)). They were
  followed again from a fresh clone on 27 September 2026, the ledger commands
  included, on the Homebrew route with the two database URLs set in the
  environment rather than in `.env`. Every command worked and said what this
  file says it does. The Docker route was not walked either time. Both walks
  are one session's account, the second recorded command by command in the
  pull request linked from
  [#127](https://github.com/async-digital-ltd/seen-to-fail/issues/127), and
  anyone with a clone can repeat them.
- **The ledger's own guards, watched refusing.** The two checks the publishing
  route rests on were each given the defect they exist for and seen to deny it:
  a record whose outcome was neither caught nor missed, which the validator
  refused with a non-zero exit, and a record dropped from the export inside the
  build, which the build refused to publish, leaving no output directory behind.
  Both were watched passing before and after. They are two of the three runs
  the first commit to `ledger/runs/` added, `7b47398`, which is the first thing
  this project has recorded about itself
  ([#63](https://github.com/async-digital-ltd/seen-to-fail/issues/63)); the
  third is the guard in the next bullet. All three were typed in by the session
  that watched them. Each has a plant in `canfail.json` that a replay re-checks
  it with, and the scheduled replay of 28 September 2026 was the first to reach
  any of them.
- **A guard that could not fail, in a repository about guards that cannot
  fail.** The CI step that refuses a published page carrying a script was first
  written as `! grep -qi '<script' ...` under `set -e`. A shell does not apply
  `set -e` to a command whose status is inverted, so that step went green with
  the script sitting in the page. It was found by planting the script and
  watching the step pass, before it had run anywhere, and rewritten as an `if`
  ([#63](https://github.com/async-digital-ltd/seen-to-fail/issues/63)). The
  check now lives in `scripts/check-published-output.sh`, whose header keeps
  that history, and the note on its first run in `ledger/runs/` tells it too.
- **A test that depended on the shell.** The error masking tests passed or
  failed with the value of `NODE_ENV`. They were run under each value, seen
  failing under one, and the server was pinned so they no longer depend on it
  ([#39](https://github.com/async-digital-ltd/seen-to-fail/issues/39),
  [#56](https://github.com/async-digital-ltd/seen-to-fail/pull/56)). The pin is
  `maskedErrors` in `packages/server/src/graphql/server.ts`, and the masking
  tests in the same folder pass with `NODE_ENV=development` set, which anyone
  can re-run.

Not checked:

- No keyboard and screen reader pass has been run
  ([#28](https://github.com/async-digital-ltd/seen-to-fail/issues/28)).
- Nothing automated exercises the client and the server together. That path
  was walked by hand over HTTP on 16 September 2026
  ([#46](https://github.com/async-digital-ltd/seen-to-fail/issues/46)), and a
  query was put through the client's development proxy to the server on 27
  September 2026 in the walk above, with `curl` rather than a browser.

The README, with the files in `docs/` it was split into, is written to one rule. A claim is either checkable from this
repository or from a run it links to, while GitHub keeps that run's log, or it
says that it cannot be checked from here. It is checked from where the reader
stands, not from where the author sat: a fact visible only to somebody with the
owner's access, or resting only on one session's account of what it saw, is not
counted as checked, and the text says what a stranger can check instead. The
ledger section, now [published-ledger.md](published-ledger.md) to [publishing.md](publishing.md) and the README's [What belongs on a public ledger](../README.md#what-belongs-on-a-public-ledger), was audited against that rule on 22 September 2026, after
two passes over it found claims that were true for whoever wrote them and
unverifiable for whoever read them
([#83](https://github.com/async-digital-ltd/seen-to-fail/issues/83));
[#121](https://github.com/async-digital-ltd/seen-to-fail/issues/121) records
the pattern. The rest of the file was audited against it on 27 September 2026,
as it stood at commit `3cd0c37`
([#127](https://github.com/async-digital-ltd/seen-to-fail/issues/127)), which
is where the accounts in the bullets above were labelled as accounts.
`git diff 3cd0c37 -- README.md docs/` shows every change since: the audit's own edits
and whatever it has not seen.
