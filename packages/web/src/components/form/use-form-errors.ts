import { useCallback, useEffect, useRef, useState } from 'react';

import type { FieldError, FieldErrors } from './field-errors';
import { invalidFields, placeErrors } from './field-errors';

/** What a form reads and calls to show its refusals. */
export interface FormErrors<Field extends string> {
  /** The message beside each field at fault. Empty before the first submit. */
  readonly byField: FieldErrors<Field>;
  /** API messages with no field to sit beside, shown with the summary. */
  readonly unplaced: readonly string[];
  /** How many details the summary line counts. Zero hides the summary. */
  readonly count: number;
  /** Shows the form's own findings, replacing whatever was shown. */
  readonly show: (byField: FieldErrors<Field>) => void;
  /** Shows what the API refused, replacing whatever was shown. */
  readonly showFromApi: (errors: readonly FieldError[]) => void;
  /** Takes every mark down. */
  readonly clear: () => void;
}

interface Shown<Field extends string> {
  readonly byField: FieldErrors<Field>;
  readonly unplaced: readonly string[];
}

/**
 * The refusals a form is showing, and where focus goes when they change.
 *
 * `fields` is the form's fields in the order they are laid out, and `idOf`
 * gives the element id of each one's control. Showing errors moves focus to
 * the first field at fault, or to the element `summaryId` names when only
 * unplaced messages are left. Focus moves after the render that marks the
 * field, so a screen reader landing on it hears the message too.
 */
export function useFormErrors<Field extends string>(
  fields: readonly Field[],
  idOf: (field: Field) => string,
  summaryId: string,
): FormErrors<Field> {
  const [shown, setShown] = useState<Shown<Field>>({
    byField: {},
    unplaced: [],
  });
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    const id = focusNext.current;
    if (id === null) {
      return;
    }
    focusNext.current = null;
    document.getElementById(id)?.focus();
  });

  const display = useCallback(
    (next: Shown<Field>) => {
      const [first] = invalidFields(fields, next.byField);
      if (first !== undefined) {
        focusNext.current = idOf(first);
      } else if (next.unplaced.length > 0) {
        focusNext.current = summaryId;
      }
      setShown(next);
    },
    [fields, idOf, summaryId],
  );

  const show = useCallback(
    (byField: FieldErrors<Field>) => {
      display({ byField, unplaced: [] });
    },
    [display],
  );

  const showFromApi = useCallback(
    (errors: readonly FieldError[]) => {
      display(placeErrors(fields, errors));
    },
    [display, fields],
  );

  const clear = useCallback(() => {
    setShown({ byField: {}, unplaced: [] });
  }, []);

  return {
    byField: shown.byField,
    unplaced: shown.unplaced,
    count: invalidFields(fields, shown.byField).length + shown.unplaced.length,
    show,
    showFromApi,
    clear,
  };
}
