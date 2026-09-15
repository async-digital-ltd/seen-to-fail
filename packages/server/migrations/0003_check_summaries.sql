-- The one place a status is worked out.
--
-- A status is a reading of the record as of a day, not a fact about a check, so
-- it is a function of rows, a day and a threshold and nothing stores one. Every
-- display and every filter reads it from here, which is what makes "a check's
-- status comes from its run log, not from anyone's opinion of it" true rather
-- than merely intended.
--
-- Two parameters and no clock. The function never reads current_date, so a test
-- can pin both the day it is read as of and the threshold it is read against,
-- and the same rows always give the same answer. The application passes today
-- and STALE_AFTER_DAYS.

-- The five statuses, spelled as the filter language spells them.
--
-- The labels are the vocabulary the API and the web client already share, so
-- they are the labels here too and nothing has to translate between a database
-- spelling and a displayed one. An enum rather than text because the set is
-- closed: a sixth status cannot be returned by a typo. A test reads these
-- labels back and compares them with the filter package's list, so the two
-- cannot drift apart unnoticed.
CREATE TYPE check_status AS ENUM (
  'Unarmed',
  'Broken',
  'Proven',
  'Stale',
  'Unproven'
);

CREATE FUNCTION check_summaries(as_of date, stale_after_days integer)
RETURNS TABLE (
  check_id uuid,
  status check_status,
  -- The last day a run caught its defect, which is not always the day of the
  -- latest run: a check that caught in June and missed in July still has a June
  -- catch to report beside its Broken status.
  last_caught_on date,
  last_run_on date,
  run_count integer,
  caught_count integer,
  missed_count integer,
  -- The last day an observation said the check was on. Not the day of the
  -- latest observation: a check seen on in June and off in July was last seen
  -- armed in June, and the July row is what last_armed reports.
  last_seen_armed_on date,
  -- What the latest observation said, or null when nobody has ever looked.
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
    -- The five branches are exhaustive, so there is no ELSE. Read them as a
    -- decision over two facts: whether there is a latest run, and what the
    -- latest observation says. With no run, branch 1 takes every case except
    -- the latest observation saying it is on, and that case is branch 5. With a
    -- run, branch 1 takes the case where the latest observation says it is off
    -- and is at least as recent, and branches 2 to 4 take every outcome the
    -- enum has. A sixth case would need a third outcome or a third answer to
    -- "is it on", and neither exists.
    (CASE
       -- 1. Unarmed. Two ways a check reads as not switched on: nothing has
       --    ever been run against it and no observation says it is on, or the
       --    latest observation says it is off and is at least as recent as the
       --    latest run. The second is what stops a check that was proved and
       --    then switched off from still reading Proven. On the same day counts
       --    as off, because a day is the finest grain either fact is recorded
       --    at and there is nothing to order them by within one.
       WHEN (latest_run.run_on IS NULL AND latest_observation.armed IS NOT TRUE)
         OR (latest_observation.armed IS FALSE
             AND latest_observation.observed_on >= latest_run.run_on)
         THEN 'Unarmed'
       -- 2. Broken. The latest run missed the defect that was planted for it.
       --    Broken rather than Failing: what is reported is the check, and a
       --    check that lets a planted defect through is broken whether or not
       --    the run that showed it up went green.
       WHEN latest_run.outcome = 'missed' THEN 'Broken'
       -- 3. Proven. The latest run caught its defect, recently enough that the
       --    catch is still worth believing.
       WHEN latest_run.outcome = 'caught'
            AND as_of - latest_run.run_on <= stale_after_days
         THEN 'Proven'
       -- 4. Stale. The latest run caught its defect, but longer ago than the
       --    threshold, so the evidence is old rather than absent.
       WHEN latest_run.outcome = 'caught' THEN 'Stale'
       -- 5. Unproven. There is evidence it is switched on and no defect has
       --    ever been planted for it, so nobody knows whether it works.
       WHEN latest_run.run_on IS NULL AND latest_observation.armed
         THEN 'Unproven'
     END)::check_status AS status,
    run_totals.caught_on AS last_caught_on,
    latest_run.run_on AS last_run_on,
    run_totals.total AS run_count,
    run_totals.caught AS caught_count,
    run_totals.missed AS missed_count,
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
      max(test_runs.run_on) FILTER (WHERE test_runs.outcome = 'caught')
        AS caught_on
    FROM test_runs
    WHERE test_runs.check_id = checks.id
  ) AS run_totals
  -- Latest is by the day it happened, then by the order it was written down,
  -- because two runs can share a day. The id is a last resort under both: rows
  -- inserted by one statement share a created_at to the microsecond, and
  -- without a third key the planner would be free to return either of them, so
  -- the same rows could read differently from one call to the next.
  LEFT JOIN LATERAL (
    SELECT test_runs.run_on, test_runs.outcome
    FROM test_runs
    WHERE test_runs.check_id = checks.id
    ORDER BY test_runs.run_on DESC, test_runs.created_at DESC, test_runs.id DESC
    LIMIT 1
  ) AS latest_run ON true
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
