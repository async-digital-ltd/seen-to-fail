import type { Status } from '@seen-to-fail/filter';

/**
 * Which of a check's two kinds of evidence its status was read from, as the
 * schema's StatusEvidence enum spells it.
 */
export type StatusEvidenceName = 'TEST_RUN' | 'OBSERVATION' | 'NOTHING';

/**
 * Which evidence a status was read from, given the status and what the latest
 * observation said.
 *
 * This works no status out. It reads one the check_summaries function has
 * already worked out, and asks only which branch of that function can have
 * produced it. Broken, Proven and Stale each name the latest settled run's
 * outcome, so they come from a run. Unproven needs the latest observation to
 * say on with no settled run, so it comes from the observation. Unarmed is
 * either the latest observation saying off, or nothing at all, and lastArmed
 * tells those apart: false is somebody looked and found it off, null is
 * nobody has looked.
 *
 * It is here, beside the status on the server, so the web client asks rather
 * than keeping a copy of the rule that could drift from the one that is run.
 *
 * Unarmed with lastArmed true is a state check_summaries cannot return: both
 * of its Unarmed branches need the latest observation not to say on. Reading
 * it anyway would name the wrong evidence, so it throws.
 */
export function statusEvidence(
  status: Status,
  lastArmed: boolean | null,
): StatusEvidenceName {
  switch (status) {
    case 'Broken':
    case 'Proven':
    case 'Stale':
      return 'TEST_RUN';
    case 'Unproven':
      return 'OBSERVATION';
    case 'Unarmed':
      if (lastArmed === true) {
        throw new Error(
          'A check reads Unarmed while its latest observation says it is on.',
        );
      }
      return lastArmed === false ? 'OBSERVATION' : 'NOTHING';
  }
}
