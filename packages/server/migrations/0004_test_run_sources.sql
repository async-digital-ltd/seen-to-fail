-- Where a test run came from.
--
-- A run is either something a person typed in or something a replay posted,
-- and a replay carries the commit it ran against and a link to the run that
-- produced it. The difference is worth recording because it is the difference
-- between a proof that keeps itself and a proof somebody remembered to write
-- down, and a reader cannot tell those apart from the outcome alone.
--
-- Nothing in the status derivation reads any of this. check_summaries selects
-- run_on and outcome and nothing else, so a replay and a hand run with the
-- same outcome give the same status. That is asserted by a test against the
-- function rather than left to be read off this file.

CREATE TYPE test_run_source AS ENUM ('hand', 'replay');

-- Every run recorded before this migration was typed into a form by a person,
-- so the default backfills them as by hand. The default is then dropped, and
-- that second statement is the point of the pair: a column that says where a
-- record came from must never guess. With no default, a writer that forgets to
-- say is refused by NOT NULL; with one kept, it would publish somebody else's
-- work as hand-written and say nothing at all.
ALTER TABLE test_runs
  ADD COLUMN source test_run_source NOT NULL DEFAULT 'hand';

ALTER TABLE test_runs
  ALTER COLUMN source DROP DEFAULT;

ALTER TABLE test_runs
  -- The commit the plant was replayed against. Not the commit that recorded
  -- the run: that one does not exist until the record has been committed, and
  -- the published page reads it back out of the history rather than storing
  -- it. Two different commits, and a page that shows both has to name them
  -- apart.
  ADD COLUMN source_commit text,
  -- The run that produced it, as a link a reader can follow and look at.
  ADD COLUMN source_run_url text;

-- A source and its evidence travel together, in both directions. A replay
-- without its commit is a claim nobody can check, and a hand run carrying one
-- is a claim nobody made.
--
-- Written as two branches joined by OR rather than as a CASE over the enum. A
-- CASE with no ELSE returns null for a label it does not list, and a check
-- constraint passes on null, so a third source added to the enum later would
-- be accepted with any evidence at all and nothing would say so. Two branches
-- refuse it instead, which is the failure that gets noticed.
--
-- Named, like every other constraint in this schema, so a test can assert
-- which rule refused the row rather than that something did.
ALTER TABLE test_runs
  ADD CONSTRAINT test_runs_source_carries_its_evidence CHECK (
    (source = 'hand'
      AND source_commit IS NULL
      AND source_run_url IS NULL)
    OR (source = 'replay'
      AND source_commit IS NOT NULL
      AND source_run_url IS NOT NULL)
  );
