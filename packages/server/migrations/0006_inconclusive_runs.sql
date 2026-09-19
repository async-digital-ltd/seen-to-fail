-- The reason a run settled nothing, and the status rules learning to skip it.
--
-- Two halves, and the second is the one the story is about. Storing a third
-- outcome is easy; keeping it out of every status rule is the part that decides
-- whether a check that has been told nothing four times running still reads
-- what its last real run said.

ALTER TABLE test_runs
  -- Why the run settled nothing, in the words of whoever recorded it. For a
  -- replay that is the sentence the scoring tool printed, copied rather than
  -- interpreted: this column holds a reason, not a category, because the
  -- categories are only recoverable from that sentence by matching prose and a
  -- wrong match here would tell a reader to rewrite a plant that is fine.
  ADD COLUMN inconclusive_reason text;

-- An outcome and its reason travel together, in both directions. A run that
-- settled nothing and will not say why is a dead end for whoever reads it next,
-- and a run that caught or missed has no reason to give: it settled the
-- question.
--
-- Written as two branches joined by OR over a positive list of outcomes, for
-- the reason 0004 gives: a CASE with no ELSE returns null for a label it does
-- not list, and a check constraint passes on null. A fifth outcome added later
-- matches neither branch here, so it evaluates false and is refused, which is
-- the failure that gets noticed.
--
-- IS NOT NULL is spelled out beside the btrim rather than left to it. btrim of
-- null is null, so a branch that only compared it would evaluate to null for a
-- run with no reason at all, and the constraint would pass on exactly the row
-- it exists to refuse. It was seen to accept that row before this half was
-- added.
--
-- Named, like every other constraint in this schema, so a test can assert which
-- rule refused the row rather than that something did.
ALTER TABLE test_runs
  ADD CONSTRAINT test_runs_inconclusive_carries_its_reason CHECK (
    (outcome = 'inconclusive'
      AND inconclusive_reason IS NOT NULL
      AND btrim(inconclusive_reason) <> '')
    OR (outcome IN ('caught', 'missed')
      AND inconclusive_reason IS NULL)
  );

-- The derivation, with two columns added and one rule changed, so it is dropped
-- and written again rather than replaced: CREATE OR REPLACE FUNCTION cannot
-- change what a function returns.
DROP FUNCTION check_summaries(date, integer);

CREATE FUNCTION check_summaries(as_of date, stale_after_days integer)
RETURNS TABLE (
  check_id uuid,
  status check_status,
  -- The last day a run caught its defect, which is not always the day of the
  -- latest run: a check that caught in June and missed in July still has a June
  -- catch to report beside its Broken status.
  last_caught_on date,
  last_run_on date,
  -- The last day a run settled anything, which is the last day a plant both
  -- applied and told us something. It is what the status was read from, and on
  -- a check whose recent runs have all settled nothing it is the date a reader
  -- needs: the status is as old as this, whatever has been attempted since.
  last_settled_on date,
  run_count integer,
  caught_count integer,
  missed_count integer,
  -- How many runs settled nothing. Kept apart from the other two rather than
  -- folded into either, because a run that settled nothing is not a miss and
  -- not a catch, and the three counts add up to run_count so a reader can see
  -- that none of them has been quietly absorbed.
  inconclusive_count integer,
  -- The last day an observation said the check was on. Not the day of the
  -- latest observation: a check seen on in June and off in July was last seen
  -- armed in June, and the July row is what last_armed reports.
  last_seen_armed_on date,
  -- What the latest observation said, or null when never observed.
  -- Null and false are different answers and the display needs both.
  last_armed boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    checks.id AS check_id,
    -- The status table, in precedence order, first match wins.
    --
    -- Every mention of "the latest run" below is the latest run that settled
    -- something. A run that settled nothing is not read here at all, in any
    -- branch, which is what makes "it never moves a status in any direction"
    -- true of the rules rather than of the four cases somebody thought to test:
    -- there is no expression in this CASE that such a row can reach.
    --
    -- The five branches are exhaustive, so there is no ELSE. Read them as a
    -- decision over two facts: whether there is a latest settled run, and what
    -- the latest observation says. With no settled run, branch 1 takes every
    -- case except the latest observation saying it is on, and that case is
    -- branch 5. With one, branch 1 takes the case where the latest observation
    -- says it is off and is at least as recent, and branches 2 to 4 take both
    -- outcomes a settled run can have.
    (CASE
       -- 1. Unarmed. Two ways a check reads as not switched on: nothing that
       --    settled anything has ever been run against it and no observation
       --    says it is on, or the latest observation says it is off and is at
       --    least as recent as the latest settled run. The second is what stops
       --    a check that was proved and then switched off from still reading
       --    Proven. On the same day counts as off, because a day is the finest
       --    grain either fact is recorded at and there is nothing to order them
       --    by within one.
       WHEN (latest_settled_run.run_on IS NULL
             AND latest_observation.armed IS NOT TRUE)
         OR (latest_observation.armed IS FALSE
             AND latest_observation.observed_on >= latest_settled_run.run_on)
         THEN 'Unarmed'
       -- 2. Broken. The latest settled run missed the defect that was planted
       --    for it. Broken rather than Failing: what is reported is the check,
       --    and a check that lets a planted defect through is broken whether or
       --    not the run that showed it up went green.
       WHEN latest_settled_run.outcome = 'missed' THEN 'Broken'
       -- 3. Proven. The latest settled run caught its defect, recently enough
       --    that the catch is still worth believing.
       WHEN latest_settled_run.outcome = 'caught'
            AND as_of - latest_settled_run.run_on <= stale_after_days
         THEN 'Proven'
       -- 4. Stale. The latest settled run caught its defect, but longer ago
       --    than the threshold, so the evidence is old rather than absent. A
       --    check whose plant has stopped applying arrives here by the calendar
       --    alone, which is the thirty-day backstop doing the job the replays
       --    have stopped doing.
       WHEN latest_settled_run.outcome = 'caught' THEN 'Stale'
       -- 5. Unproven. There is evidence it is switched on and no defect has
       --    ever been planted for it that settled anything, so nobody knows
       --    whether it works.
       WHEN latest_settled_run.run_on IS NULL AND latest_observation.armed
         THEN 'Unproven'
     END)::check_status AS status,
    run_totals.caught_on AS last_caught_on,
    -- Every run, including the ones that settled nothing: this answers "when
    -- did anybody last try", which is a different question from the one the
    -- status was read from, and the column beside it answers that.
    run_totals.run_on AS last_run_on,
    latest_settled_run.run_on AS last_settled_on,
    run_totals.total AS run_count,
    run_totals.caught AS caught_count,
    run_totals.missed AS missed_count,
    run_totals.inconclusive AS inconclusive_count,
    armed_totals.armed_on AS last_seen_armed_on,
    latest_observation.armed AS last_armed
  FROM checks
  -- Four reads of the log, kept apart because they answer different questions.
  -- A totals query returns a row whatever is in the table, even zero counts for
  -- a check with nothing recorded against it, so those join as CROSS. A latest
  -- row may not exist at all, so those join as LEFT and read as null when there
  -- is none. Every column reference is qualified: the names declared in RETURNS
  -- TABLE are parameters inside this body, and an unqualified one that is also
  -- a column would be ambiguous.
  CROSS JOIN LATERAL (
    SELECT
      count(*)::integer AS total,
      (count(*) FILTER (WHERE test_runs.outcome = 'caught'))::integer
        AS caught,
      (count(*) FILTER (WHERE test_runs.outcome = 'missed'))::integer
        AS missed,
      (count(*) FILTER (WHERE test_runs.outcome = 'inconclusive'))::integer
        AS inconclusive,
      max(test_runs.run_on) AS run_on,
      max(test_runs.run_on) FILTER (WHERE test_runs.outcome = 'caught')
        AS caught_on
    FROM test_runs
    WHERE test_runs.check_id = checks.id
  ) AS run_totals
  -- The latest run that settled something, which is the only run any status
  -- rule reads. Latest is by the day it happened, then by the order it was
  -- written down, because two runs can share a day. The id is a last resort
  -- under both: rows inserted by one statement share a created_at to the
  -- microsecond, and without a third key the planner would be free to return
  -- either of them, so the same rows could read differently from one call to
  -- the next.
  --
  -- The outcomes are listed rather than excluded by name. "Everything except
  -- inconclusive" would quietly hand a sixth outcome to a CASE with no branch
  -- for it; this way a sixth outcome is simply not a settled one until somebody
  -- says it is. Which of the two it should be is a decision, and the test that
  -- compares this enum's labels with the ones the server knows about is what
  -- makes somebody take it.
  LEFT JOIN LATERAL (
    SELECT test_runs.run_on, test_runs.outcome
    FROM test_runs
    WHERE test_runs.check_id = checks.id
      AND test_runs.outcome IN ('caught', 'missed')
    ORDER BY test_runs.run_on DESC, test_runs.created_at DESC, test_runs.id DESC
    LIMIT 1
  ) AS latest_settled_run ON true
  CROSS JOIN LATERAL (
    SELECT
      max(arming_observations.observed_on)
        FILTER (WHERE arming_observations.armed) AS armed_on
    FROM arming_observations
    WHERE arming_observations.check_id = checks.id
  ) AS armed_totals
  LEFT JOIN LATERAL (
    SELECT arming_observations.observed_on, arming_observations.armed
    FROM arming_observations
    WHERE arming_observations.check_id = checks.id
    ORDER BY arming_observations.observed_on DESC,
             arming_observations.created_at DESC,
             arming_observations.id DESC
    LIMIT 1
  ) AS latest_observation ON true
$$;
