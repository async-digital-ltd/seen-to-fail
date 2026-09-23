/**
 * How recently a check has to have caught its planted defect for the catch to
 * still be worth believing.
 *
 * Thirty days is a judgment rather than a fact, which is why it is a number in
 * one place and not a rule buried in the SQL. The derivation takes the
 * threshold as a parameter and never reads this file, so moving the line is
 * changing this constant and nothing else: the function keeps working, and the
 * tests that exercise the boundary date their fixtures from here so they move
 * with it. A test that spelled thirty again would be a second copy of the
 * policy, and the two could disagree.
 *
 * It is a whole number of days because both sides of the comparison are days.
 * The record has no finer grain than that: a run is dated, not timed.
 */
export const STALE_AFTER_DAYS = 30;

/**
 * How old a check's newest settled run may be before a replay is owed for it,
 * whether or not anything the check depends on has changed.
 *
 * This is the age floor, and it exists because #68's schedule replays a check
 * only when a declared dependency changed. That was stated as a decision rather
 * than an omission, and it makes the epic's goal clause false: once the
 * repository goes quiet, nothing a check depends on changes, no replay is ever
 * selected, and every proof ages out on the backstop above. A check does not
 * stay Proven for as long as it keeps catching its defect. It stays Proven for
 * thirty days and then stops, with nothing left that could refresh it.
 *
 * Fourteen, and the arithmetic is against the backstop and the cadence rather
 * than against taste. A check crosses the floor fourteen days after its newest
 * settled run. The schedule fires weekly, so the first dispatch that can act on
 * that crossing is at most seven days later, on day twenty-one, which is nine
 * days inside the backstop. GitHub drops scheduled runs, so the second dispatch
 * matters: it is day twenty-eight, still two days inside. The cadence therefore
 * gets two attempts at refreshing a proof before the backstop takes it Stale,
 * and the third attempt, on day thirty-five, is the backstop correctly winning.
 * Sixteen is the largest floor that still buys the second attempt; fourteen is
 * chosen over it because it is two whole cadence periods and leaves the spare
 * two days as margin rather than spending them.
 *
 * Slower was rejected for that reason and faster for the opposite one. How often
 * a quiet check is replayed follows from the boundary being strict: a replay's
 * run is dated the day the job runs, so the check is seven days old at the next
 * weekly dispatch and fourteen at the one after, and it is selected only once
 * it is older than fourteen, at the third. At fourteen a check nothing has
 * touched is therefore replayed about once every three weeks; at seven it would
 * be replayed at every second dispatch, and the `Replay a plant` workflow's own
 * header objects to exactly that: a replay is a dated observation, and filing a
 * near identical proof over and over buries the runs that say something under
 * runs that say the same thing again. Fourteen files half as many of those rows
 * as seven and still buys the second attempt, which is why it won.
 *
 * It costs nothing extra in Actions minutes. The floor adds no dispatch: the
 * schedule fires weekly either way, and the floor only changes whether a
 * dispatch that would have stopped at the selection goes on to replay. The
 * measured durations, and what is and is not known about the allowance they
 * count against, are in the header of `.github/workflows/replay.yml` and are
 * not restated here.
 *
 * The relationship above is asserted in `staleness.test.ts` rather than left in
 * this comment, because a comment cannot notice the backstop or the cadence
 * moving underneath it.
 */
export const REPLAY_AFTER_DAYS = 14;
