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
