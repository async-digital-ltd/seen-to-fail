// pnpm ledger:counts
//
// Prints what each check's record rests on, counted from ledger/ and
// canfail.json: one row per check with its declared breaks, its runs by
// source and its first and latest replay, then the totals, then how many runs
// each replay wrote. The same tables used to be committed into
// docs/automatic.md and ledger/README.md, where every replay branch rewrote
// them and two branches waiting at once always conflicted (#270). Printed
// from the tree as it stands, they cannot fall behind it.
//
// It reads nothing but those files: no database, no clock and no git, so the
// same tree prints the same text on any machine.

import {
  readReplayRecord,
  replayTable,
  replayTotals,
  runsPerReplay,
} from '../readme/replays.ts';

const record = readReplayRecord();
console.log(
  [replayTable(record), replayTotals(record), runsPerReplay(record)]
    .map((block) => block.trim())
    .join('\n\n'),
);
