-- The tool that scored a replay's verdict, and its version (#101).
--
-- Copied by the replay recorder from the metadata of the installation that ran,
-- never from the workflow's pin, so that a change of version shows in the
-- record rather than only in whoever remembers it. A label on the evidence and
-- not evidence about the check: check_summaries is not touched here, and no
-- status rule reads either column.
--
-- Two columns rather than one, so a version can be compared and grouped
-- without parsing it back out of a name.
ALTER TABLE test_runs
  ADD COLUMN tool text,
  ADD COLUMN tool_version text;

-- Null on every run typed in by hand, and on every replay recorded before tools
-- were recorded. Nothing backfills them: a version guessed after the fact would
-- be published as though the run had said it.
--
-- So the rule holds in both directions as far as the rows can: a run typed in
-- by hand carries neither, and a replay carries both or neither. That a replay
-- recorded from now carries both is the recorder's rule, because a row here
-- cannot tell a replay from before this column from one that left it out.
ALTER TABLE test_runs
  ADD CONSTRAINT test_runs_tool_belongs_to_a_replay CHECK (
    (tool IS NULL AND tool_version IS NULL)
    OR (source = 'replay'
      AND tool IS NOT NULL AND tool <> ''
      AND tool_version IS NOT NULL AND tool_version <> '')
  );
