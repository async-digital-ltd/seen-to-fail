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
