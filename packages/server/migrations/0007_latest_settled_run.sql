-- The derivation names the run its status was read from, and picks it by the
-- same last-resort key every list of runs is ordered by.
--
-- Two changes to check_summaries, both about the latest settled run.
--
-- It now returns that run's id. The publish guard compares it with the first
-- settled run in each check's published table, and refuses to publish when the
-- two differ: the status printed on a check and the run its table is headed by
-- are produced by different code, and until this column existed nothing could
-- ask whether they agree.
--
-- And within one day and one outcome it now picks by id alone. The key above
-- the id used to be created_at, which the published page cannot see: a page
-- built from files has no created_at, and the ledger build writes every record
-- in one transaction so they all share one anyway. The page sorted such a tie
-- by filename and the app by id, and the two tables headed with different
-- rows. The rule every surface now shares is newestRunFirst in rows.ts: the
-- day, then the outcome, then the id, descending.
--
-- Dropped and written again rather than replaced, because CREATE OR REPLACE
-- FUNCTION cannot change what a function returns. Everything not named above is
-- as 0006 left it.
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
  -- The run itself, or null when no run has settled anything. Named so that
  -- which run the status was read from is a fact the build can check against
  -- what it publishes, rather than something inferred from the order of a list.
  latest_settled_run_id uuid,
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
    latest_settled_run.id AS latest_settled_run_id,
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
  -- rule reads. Latest is by the day it happened, and then by what the run
  -- says: a miss outranks a catch on the same day.
  --
  -- A run is dated to a day and nothing finer, so two runs on one day have no
  -- recorded order to read. Ordering them by when the row was written down
  -- picks by clerical order rather than by anything that happened, and on the
  -- ledger build it does not even do that: the build writes every record in one
  -- transaction, so now() is the same instant for all of them and created_at
  -- ties to the microsecond. What decided the published status was then the id,
  -- which is an MD5 of the record's filename. A check that missed one plant and
  -- caught another on one day published Proven or Broken according to which of
  -- two digests happened to be larger, and both the page and the record were
  -- silent about it.
  --
  -- So the outcome is the key, above the id. A check seen to let a planted defect
  -- through that day is broken whether or not something else it was asked about
  -- that day went well, and a rule that could hide the miss behind the catch
  -- would be this product failing at its own subject. The same rank is in
  -- outcomePrecedence in rows.ts, which is what the run lists are sorted by.
  -- This ORDER BY spells it separately, so rows.test.ts reads the run this
  -- function picks back out and holds it to newestRunFirst, on a day with a
  -- miss and a catch as well as on a tie.
  --
  -- Only the two settled outcomes can reach the key, because the filter below
  -- is a positive list, so a comparison against one label is total here. The
  -- outcomes are listed rather than excluded by name for the reason they always
  -- were: "everything except inconclusive" would quietly hand a sixth outcome
  -- to a CASE with no branch for it; this way a sixth outcome is simply not a
  -- settled one until somebody says it is, and ranking it is part of saying so.
  --
  -- The id is the last resort, below the outcome: within one day and one
  -- outcome there is still nothing meaningful to order by, and without a
  -- deterministic key the planner would be free to return either row. It is the
  -- last resort of newestRunFirst in rows.ts too, which is what the app's table
  -- and the published page's table are ordered by, so the run named here is the
  -- first settled run in both. created_at is no longer a key: the page cannot
  -- see it, so a tie it decided was a tie the page decided differently.
  LEFT JOIN LATERAL (
    SELECT test_runs.id, test_runs.run_on, test_runs.outcome
    FROM test_runs
    WHERE test_runs.check_id = checks.id
      AND test_runs.outcome IN ('caught', 'missed')
    ORDER BY test_runs.run_on DESC,
             (test_runs.outcome = 'missed') DESC,
             test_runs.id DESC
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
