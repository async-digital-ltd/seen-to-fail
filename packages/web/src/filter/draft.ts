import { parseFilter } from '@seen-to-fail/filter';
import type { Condition } from '@seen-to-fail/filter';

import type { Field } from './wording';

/**
 * What the picker holds while a condition is being chosen: each column as
 * text, which is how its control holds it. Nothing here is a condition yet.
 */
export interface Draft {
  readonly field: Field;
  /** The operator's token, from the field's own list. */
  readonly operator: string;
  /** The status chosen or the area typed. Empty when neither has been. */
  readonly text: string;
  /** The number typed, as the number input holds it. Empty when none has. */
  readonly number: string;
}

export type DraftResult =
  | { readonly ok: true; readonly condition: Condition }
  | { readonly ok: false; readonly message: string };

function refuse(message: string): DraftResult {
  return { ok: false, message };
}

/**
 * The condition a draft describes, or why it does not describe one yet.
 *
 * An empty box is named first, as a gap to fill in: it is neither the empty
 * string nor the number zero. Everything else is decided by the language. The
 * draft is written out as the object shape the language reads and handed to
 * `parseFilter`, and what comes back is the condition the picker adds. So the
 * picker cannot add a condition the language would refuse, not because the
 * picker restates the rules, but because the language's one validator is the
 * only way out of it, and the message beside the picker is that validator's
 * own.
 */
export function conditionFrom(draft: Draft): DraftResult {
  const written = writeOut(draft);
  if ('gap' in written) {
    return refuse(written.gap);
  }

  const parsed = parseFilter({
    kind: 'groups',
    joiner: 'and',
    groups: [{ joiner: 'and', conditions: [written.candidate] }],
  });
  if (!parsed.ok) {
    return refuse(parsed.errors.map((issue) => issue.message).join(' '));
  }
  if (parsed.filter.kind !== 'groups') {
    throw new Error('A filter parsed from one group came back with none.');
  }
  return { ok: true, condition: parsed.filter.groups[0].conditions[0] };
}

/** The object the language reads for a draft, or the gap to fill in first. */
type WrittenOut = { readonly candidate: unknown } | { readonly gap: string };

function writeOut(draft: Draft): WrittenOut {
  const { field, operator } = draft;
  switch (field) {
    case 'status':
      return draft.text === ''
        ? { gap: 'Choose a status.' }
        : { candidate: { field, op: operator, value: draft.text } };
    case 'area':
      // Nothing but spaces is a gap, as an empty box is. The checks table
      // refuses an area that btrim leaves empty (migration 0002), and btrim
      // takes spaces only, so this is the one shape of text no check can
      // have; a value with a space at its edge is kept as typed, since a
      // check can hold that.
      return /^ *$/.test(draft.text)
        ? { gap: 'Enter an area.' }
        : { candidate: { field, op: operator, value: draft.text } };
    case 'lastCaught':
      if (operator === 'never') {
        return { candidate: { field, op: operator } };
      }
      return draft.number === ''
        ? { gap: 'Enter a number of days.' }
        : { candidate: { field, op: operator, days: Number(draft.number) } };
    case 'runs':
      return draft.number === ''
        ? { gap: 'Enter a number of runs.' }
        : { candidate: { field, op: operator, count: Number(draft.number) } };
  }
}
