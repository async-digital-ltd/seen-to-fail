# How it works

Each check has a log of **test runs**. A test run is one planted defect, and
records:

- what was planted,
- what the check was expected to do,
- what it actually did: caught it, missed it, or settled nothing,
- why it settled nothing, when that is what it did,
- where it came from: somebody typed it in, or a replay posted it, and a replay
  names the commit it ran against and links the run that produced it,
- an optional note for the next person.

A run that **settled nothing** is not evidence about the check. The plant may no
longer apply to code that has moved on, the check may have been failing before
anything was planted, or it may never have run at all. None of those is the
check missing a defect, so none of them belongs in the status rules: a run that
settled nothing is counted separately, is never a catch or a miss, and leaves
the status exactly where it was. What it changes is how old the evidence behind
that status is, and a check's page says so, alongside the day of the last run
that did settle something.

The reason is shown as whoever recorded it wrote it, rather than sorted into a
category. Only one of the situations above means the plant needs rewriting, and
the tool that scores a replay separates them inside an English sentence, so a
category here could only be recovered by matching prose and a wrong match would
send a reader to rewrite a plant that is fine.

Where a run came from is recorded beside it and read by none of the status
rules. A replay and a run somebody typed in, with the same outcome on the same
day, leave a check reading the same thing. It is there so that a reader can
tell a proof that keeps itself from one somebody remembered to write down,
which is a different question from whether the check works.

It also has a log of **arming observations**: dated evidence that the check was,
or was not, switched on at all. A check can be configured and not running, and a
log of planted defects alone cannot tell that apart from a check nobody has got
round to planting anything for, so the two are recorded separately.

A check's status comes from those two logs, not from anyone's opinion of it.
There are five, and they are read in order: the first rule that matches is the
status.

Every "run" below means a run that settled something. A run that settled
nothing is not read by any of these rules, in any of their branches.

| Status       | The rule                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Unarmed**  | There are no runs and nothing says it is on, or the latest observation says it is off and is dated on or after the latest run. |
| **Broken**   | The latest run missed the defect that was planted for it.                                                                      |
| **Proven**   | The latest run caught its defect, at most 30 days ago.                                                                         |
| **Stale**    | The latest run caught its defect, but longer ago than that.                                                                    |
| **Unproven** | There are no runs, and the latest observation says it is on.                                                                   |

Because the rules are read in that order, a check that caught a defect and was
then seen switched off reads Unarmed rather than Proven, and a check that caught
and then missed reads Broken rather than Stale. A check whose plant has stopped
applying keeps the status its last real run gave it, and the thirty-day rule
below is then the only thing that can move it, which is the backstop doing the
job the replays have stopped doing. An observation dated the same
day as the latest run counts as the later of the two, because a day is the
finest grain either fact is recorded at and there is nothing to order them by
within one.

"Latest" otherwise means by the day it happened, and then by what the run says:
a miss on a day outranks a catch on the same day. The same reason is behind
both. A run is dated to a day and nothing finer, so two runs on one day carry no
record of which came first, and a check seen to let a planted defect through
that day is broken whether or not something else it was asked about that day
went well. Ordering the two by when they were typed in would pick by clerical
order rather than by anything that happened; ordering them by the day alone
would leave it to the database. A run that settled nothing ranks below both,
which is consistent with the rules above ignoring it entirely: it sorts last
within its day.

Two runs that share both a day and an outcome give the same status whichever
comes first, and they are ordered by the run's id, which is arbitrary. The app
does record when each run was typed in, but that time is deliberately not a key.
The published page is built from files that carry no entry time, and the ledger
build loads every record in one transaction, so every run it loads has the same
one. Ordering by entry time in the app would therefore list the same rows in a
different order from the page. So the app, the page and the status derivation
all use the id, and in the app two such runs typed in an hour apart can list the
later one beneath the earlier, with nothing on either row saying why. The first
run in a check's log that settled anything is the run its status was read from,
and the build checks that for every check before it publishes.

Observations are ordered the same way, for the same reasons. An observation is
dated to a day and nothing finer, so of two on one day, one that found the check
switched off outranks one that found it on: a check seen switched off that day
is unarmed whatever else was said about it that day. Two that share both a day
and what they found are ordered by the observation's id, in the app, on the page
and in the derivation alike, and not by when they were typed in. The first
observation in a check's log is the one its armed state was read from, and the
build checks that as well.

Thirty days is the one judgment in the model, and it is one constant,
`STALE_AFTER_DAYS`, in one module. A catch exactly thirty days old still reads
Proven, and one day older reads Stale. Moving that line is changing the constant
and nothing else.

The status is worked out in one place, the `check_summaries` SQL function. It
takes the day it is reading as of and the threshold as parameters and never
reads the clock, so the same rows always give the same answer. That day drives
the staleness arithmetic only: a run or an observation dated after it still
counts, so reading the workspace as of last Tuesday asks how old a catch would
have been then, rather than what the record looked like then.

Each check also records what it protects and how you can tell it is switched on.
Either may be left blank, because a check nobody has written a tell for is
exactly the thing this product exists to make visible.
