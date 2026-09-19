# The adapter

Reads a replay tool's report and says what runs it means. It writes nothing,
reads no files and knows nothing about a database: the writing is the ledger's
own recorder, called from `packages/server/src/scripts/record-replay.ts`, which
is where this package and that one meet.

The tool is `canfail` 0.2.1, adopted and pinned on #66 after both candidates
were read and run against a real check here.

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
of a runner and files a record that is true. Too narrow means no replay arrives,
and the thirty-day backstop takes the check Stale rather than leaving it Proven
on evidence that has aged out. Neither can produce a false Proven, because
nothing on this path writes a run.

**A check with no `dependsOn`, or one whose list matches nothing, is never
replayed automatically.** It keeps the behaviour it had before any of this
existed: a person dispatches the workflow when they want it proved.

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

It exits 0 when something is due, 3 when nothing is, and 1 when it refuses. The
workflow reads that status to decide whether to install the replay tool at all.
