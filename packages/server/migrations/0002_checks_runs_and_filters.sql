-- The four tables the product is made of: checks, the test runs that prove
-- them, the observations that say whether they are switched on, and the saved
-- filters that narrow the list.
--
-- Two facts are kept apart because they are different facts. A test run says
-- whether a check caught a defect that was planted for it. An arming
-- observation says whether there is evidence the check is switched on at all.
-- A check can be armed and never proven, or proven and since switched off, and
-- neither table can express the other's fact.
--
-- Nothing here stores a status. A status is a reading of these rows as of a
-- date, and a stored one would be a second answer that could disagree with
-- them. Rows are appended rather than edited, so a table is a record of what
-- was observed and when, not a picture of how things stand now.
--
-- Every constraint below is named. A test that asserts a constraint name has
-- seen that constraint refuse the row, where a test that only asserts "the
-- insert failed" passes just as well when some unrelated rule fired instead.

CREATE TYPE test_run_outcome AS ENUM ('caught', 'missed');

CREATE TABLE checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  area text NOT NULL,
  -- What the check is there to stop. Recorded even when it is not yet known,
  -- as an empty string, because a check with nothing written here is a check
  -- nobody can judge, and that should be visible rather than absent.
  protects text NOT NULL,
  -- How a reader can tell the check is switched on, in their own words. The
  -- dated evidence that it is on lives in arming_observations.
  how_to_tell_armed text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checks_name_unique UNIQUE (name),
  -- btrim rather than a plain comparison with the empty string: a name of
  -- nothing but spaces is empty to every reader, and is only non-empty to the
  -- database.
  CONSTRAINT checks_name_not_empty CHECK (btrim(name) <> ''),
  CONSTRAINT checks_area_not_empty CHECK (btrim(area) <> '')
);

CREATE TABLE test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deleting a check takes its runs with it. A run means nothing without the
  -- check it was run against.
  check_id uuid NOT NULL,
  run_on date NOT NULL,
  planted text NOT NULL,
  expected text NOT NULL,
  outcome test_run_outcome NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT test_runs_check_id_fkey
    FOREIGN KEY (check_id) REFERENCES checks (id) ON DELETE CASCADE,
  -- A run cannot be dated after the day it was written down, because nobody
  -- can report planting a defect they have not planted yet.
  --
  -- The comparison is against this row's own created_at, converted to a day in
  -- UTC. A check constraint may only read the row it is checking, so the
  -- insert date has to be a column rather than a call to now(). UTC rather
  -- than the session's time zone so that the same two values always give the
  -- same answer, whoever is connected and from where.
  CONSTRAINT test_runs_run_on_not_in_the_future
    CHECK (run_on <= (created_at AT TIME ZONE 'UTC')::date)
);

CREATE TABLE arming_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL,
  observed_on date NOT NULL,
  armed boolean NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arming_observations_check_id_fkey
    FOREIGN KEY (check_id) REFERENCES checks (id) ON DELETE CASCADE,
  CONSTRAINT arming_observations_observed_on_not_in_the_future
    CHECK (observed_on <= (created_at AT TIME ZONE 'UTC')::date)
);

CREATE TABLE saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- The filter tree as the filter language writes it. The database stores it
  -- and does not read it; the shape is the filter package's to define and to
  -- validate before anything gets this far.
  filter jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_filters_name_unique UNIQUE (name),
  CONSTRAINT saved_filters_name_not_empty CHECK (btrim(name) <> '')
);

-- Both reading patterns are the same one: everything recorded against a check,
-- newest first. The index carries the ordering so that reading the latest row
-- for a check does not sort the whole log to find it.
CREATE INDEX test_runs_check_id_run_on_index
  ON test_runs (check_id, run_on DESC);

CREATE INDEX arming_observations_check_id_observed_on_index
  ON arming_observations (check_id, observed_on DESC);
