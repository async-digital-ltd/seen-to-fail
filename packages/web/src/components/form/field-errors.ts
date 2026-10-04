/**
 * What a form knows about the details it refused, and how it says so.
 *
 * Every form follows one pattern. Nothing is marked until the first submit.
 * On submit the form's own required checks run first, and only a form that
 * passes them is sent; what the API then refuses arrives as a list of field
 * errors and is shown the same way. Either kind puts one summary line at the
 * top, a message beside each field at fault, and focus on the first of them.
 */

/** One refusal from the API, as its ValidationErrors type carries it. */
export interface FieldError {
  /** The input field at fault, named as the input names it, such as runOn. */
  readonly path: string;
  /** Written for the person filling in the form, ready to show. */
  readonly message: string;
}

/** The message to show beside each field at fault, by field name. */
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

/** The API's errors, put on the fields the form has. */
export interface PlacedErrors<Field extends string> {
  readonly byField: FieldErrors<Field>;
  /**
   * Messages for a path the form has no field for. Today every path the API
   * can name has a field; this is what keeps a message from being dropped
   * when the API grows one and the form has not caught up.
   */
  readonly unplaced: readonly string[];
}

/**
 * Sorts the API's errors onto the form's fields.
 *
 * The first message for a field wins, because a field shows one message. The
 * API sends errors in form order, but the form does not rely on that: the
 * order a form reads its errors in is always the order of `fields`.
 */
export function placeErrors<Field extends string>(
  fields: readonly Field[],
  errors: readonly FieldError[],
): PlacedErrors<Field> {
  const byField: FieldErrors<Field> = {};
  const unplaced: string[] = [];
  for (const { path, message } of errors) {
    const field = fields.find((candidate) => candidate === path);
    if (field === undefined) {
      unplaced.push(message);
    } else {
      byField[field] ??= message;
    }
  }
  return { byField, unplaced };
}

/** The fields that carry a message, in form order. */
export function invalidFields<Field extends string>(
  fields: readonly Field[],
  byField: FieldErrors<Field>,
): Field[] {
  return fields.filter((field) => byField[field] !== undefined);
}

/**
 * The summary line. It says how many details need attention and never what
 * is wrong with them, because the count covers every kind of fault at once: an
 * empty field, a date after today, a name already in use, and any refusal from
 * the API with no field to sit beside. It used to call all of them missing,
 * which sent a reader looking for an empty box above a field they had filled
 * in (#44). What is wrong is the message beside each field.
 */
export function summarySentence(count: number): string {
  return count === 1
    ? 'One detail needs attention. It is marked below.'
    : `${String(count)} details need attention. They are marked below.`;
}
