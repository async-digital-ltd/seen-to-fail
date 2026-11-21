-- The kind of defect a run's plant was declared to be (#295).
--
-- Declared by the plant's author in canfail.json and copied onto each run a
-- replay records, so a reader can see what sort of defect a check has been seen
-- to catch. It is a label on the evidence and not evidence about the check:
-- check_summaries is not touched here, and no status rule reads this column.
--
-- An enum rather than text, so a value outside the fixed list is refused by the
-- type itself and there is no constraint that could evaluate to null. The labels
-- are PLANT_KINDS in packages/replay/src/plants.ts, in the same order, and a
-- test reads enum_range back and compares the two lists, order included: the
-- order is what the kinds a check has caught are listed in, so a kind added on
-- one side and not the other fails the suite rather than going unseen.
CREATE TYPE plant_kind AS ENUM (
  'wrong-answer',
  'missing-case',
  'crash',
  'security',
  'configuration',
  'dependency'
);

ALTER TABLE test_runs
  -- Null when nobody declared a kind: every run recorded before plants carried
  -- one, and every run typed in by hand. Null is the only spelling of unknown,
  -- and nothing backfills it, because a kind guessed after the fact would be
  -- published as though somebody had declared it.
  ADD COLUMN plant_kind plant_kind;
