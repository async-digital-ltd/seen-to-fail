import { counted } from '../../days';
import { numberInWords, numberInWordsCapitalised } from '../../words';

/**
 * The sentences above and beside the list, worked out from the counts the API
 * returns. None of their figures is typed in, so they can only say what the
 * data says.
 */

/** "check" or "checks", for a count written before it in words. */
function checksNoun(count: number): string {
  return count === 1 ? 'check' : 'checks';
}

/**
 * The lede under the heading: how many checks there are, how many of them are
 * not proven, and why that matters.
 *
 * "Not proven" is every check whose status is anything but Proven. The clause
 * after the colon names the ways a check gets there, which is why it lists
 * three of them and not the five statuses.
 */
export function describeWorkspace(counts: {
  readonly total: number;
  readonly proven: number;
}): string {
  const { total, proven } = counts;
  const notProven = total - proven;

  const size = `${numberInWordsCapitalised(total)} ${checksNoun(total)} in this workspace.`;

  let standing: string;
  if (notProven === 0) {
    standing =
      total === 1 ? "It's proven." : `All ${numberInWords(total)} are proven.`;
  } else if (notProven === 1) {
    standing =
      'One is not proven: it has never been seen to catch anything, the last proof is old, or the latest run missed.';
  } else {
    standing = `${numberInWordsCapitalised(notProven)} are not proven: they have never been seen to catch anything, the last proof is old, or the latest run missed.`;
  }

  return `${size} ${standing} A check nobody has watched fail is a check you are trusting on faith.`;
}

/** "3 of 8 checks": how many the filter selects, out of every check. */
export function describeMatching(counts: {
  readonly matching: number;
  readonly hidden: number;
}): string {
  const total = counts.matching + counts.hidden;
  return `${String(counts.matching)} of ${counted(total, 'check')}`;
}

/** "5 hidden by this filter", or nothing when the filter hides none. */
export function describeHidden(hidden: number): string | undefined {
  return hidden > 0 ? `${String(hidden)} hidden by this filter` : undefined;
}
