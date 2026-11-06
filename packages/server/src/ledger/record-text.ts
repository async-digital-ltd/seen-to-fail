import type { LedgerContents } from './load.ts';
import type { PageLanguage } from './words.ts';

/**
 * A record's text on the page, in the page's language (#284).
 *
 * The records are written in English, by a person or by the replay, and they
 * stay that way: a Welsh field in the record format could never be filled by
 * the replay, and a fix to a translation would be a new commit on evidence.
 * So the Welsh is held beside the records instead, in a table keyed on each
 * text exactly as its record holds it, in `record-welsh.ts`. A record whose
 * English is edited has a new key and no entry, and the build refuses to
 * publish either page until the entry is written. Nothing on the Welsh page is
 * ever English standing in for Welsh.
 *
 * Identifiers and quoted tool output, such as `REPLAY_AFTER_DAYS` or
 * `[ELIFECYCLE] Test failed`, are printed as they are on both pages, as code,
 * because a reader looks them up exactly as printed. Backticks mark them, in a
 * Welsh entry and in a record alike. Each one the Welsh marks has to be
 * printed in the English as it is, as a word of its own, as many times as the
 * Welsh marks it, which is what lets the English page mark the same code from
 * the same entry and lets nothing that looks like an identifier in the Welsh
 * be a mistyped one.
 */

/**
 * The Welsh for a record's text, keyed on its English exactly as the record
 * holds it.
 */
export type RecordWelsh = ReadonlyMap<string, string>;

/** A piece of a record's text: words in the page's language, or code as printed. */
export interface TextPiece {
  readonly text: string;
  readonly code: boolean;
}

/** One text a page shows from a record, and where it came from. */
export interface ShownText {
  readonly english: string;
  /** The record's file, relative to the repository root. */
  readonly file: string;
  /** Which of the record's fields it is, as a refusal names it. */
  readonly field: string;
}

/** The pieces of one text, or why it cannot be printed beside its English. */
type Reading =
  { readonly pieces: readonly TextPiece[] } | { readonly problem: string };

/**
 * A text split at its backticks into words and code, or null when a backtick
 * has no partner. Empty words between two spans are dropped; an empty span is
 * kept, so whoever reads the result can refuse it.
 */
function atBackticks(text: string): TextPiece[] | null {
  const parts = text.split('`');
  if (parts.length % 2 === 0) {
    return null;
  }
  return parts
    .map((part, index) => ({ text: part, code: index % 2 === 1 }))
    .filter((piece) => piece.code || piece.text !== '');
}

const wordCharacter = /^[\p{L}\p{N}_]$/u;

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && wordCharacter.test(character);
}

/**
 * Whether code found at this point in a text is a word of its own there,
 * rather than part of a longer word: `if` in "an if and", never in
 * "different". Only an end of the code that is itself a letter, a digit or an
 * underscore needs a break beside it, so `$page` is found after a space and
 * `scripts/` before a comma.
 */
function standsAlone(text: string, start: number, code: string): boolean {
  const end = start + code.length;
  const joinedBefore =
    isWordCharacter(code[0]) && isWordCharacter(text[start - 1]);
  const joinedAfter =
    isWordCharacter(code.at(-1)) && isWordCharacter(text[end]);
  return !joinedBefore && !joinedAfter;
}

/** How many times each code span is marked. */
function tally(codes: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const code of codes) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

function times(count: number): string {
  return count === 1 ? 'once' : `${String(count)} times`;
}

/** A stretch of a prose piece claimed as code. */
interface Claim {
  readonly start: number;
  readonly end: number;
}

/**
 * The English, with the code the Welsh entry marks found in it.
 *
 * The record's own backtick spans are code already. Every other span the Welsh
 * marks is looked for in the English words around them, longest first, so a
 * branch name is claimed whole before a prefix of it can be, and each has to
 * be found standing alone exactly as many times as the Welsh marks it.
 */
function readEnglish(english: string, welshCodes: readonly string[]): Reading {
  const pieces = atBackticks(english) ?? [{ text: english, code: false }];
  const wanted = tally(welshCodes);

  for (const piece of pieces.filter((each) => each.code)) {
    const left = wanted.get(piece.text) ?? 0;
    if (left === 0) {
      return {
        problem: `the English marks \`${piece.text}\` as code, and the Welsh does not`,
      };
    }
    wanted.set(piece.text, left - 1);
  }

  const claims = pieces.map((): Claim[] => []);
  const longestFirst = [...wanted.entries()]
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => right.length - left.length);
  for (const [code, count] of longestFirst) {
    let found = 0;
    for (const [index, piece] of pieces.entries()) {
      if (piece.code) {
        continue;
      }
      const taken = claims[index] ?? [];
      for (
        let start = piece.text.indexOf(code);
        start !== -1;
        start = piece.text.indexOf(code, start + 1)
      ) {
        const end = start + code.length;
        const overlaps = taken.some(
          (claim) => start < claim.end && claim.start < end,
        );
        if (!overlaps && standsAlone(piece.text, start, code)) {
          taken.push({ start, end });
          found += 1;
        }
      }
    }
    if (found !== count) {
      return {
        problem: `the Welsh marks \`${code}\` as code ${times(count)}, and the English prints it as a word of its own ${times(found)}`,
      };
    }
  }

  const read: TextPiece[] = [];
  for (const [index, piece] of pieces.entries()) {
    if (piece.code) {
      read.push(piece);
      continue;
    }
    let at = 0;
    for (const claim of [...(claims[index] ?? [])].sort(
      (left, right) => left.start - right.start,
    )) {
      if (claim.start > at) {
        read.push({ text: piece.text.slice(at, claim.start), code: false });
      }
      read.push({ text: piece.text.slice(claim.start, claim.end), code: true });
      at = claim.end;
    }
    if (at < piece.text.length) {
      read.push({ text: piece.text.slice(at), code: false });
    }
  }
  return { pieces: read };
}

/** A Welsh entry split into its words and its code. */
function readWelsh(welsh: string): Reading {
  if (welsh.trim() === '') {
    return { problem: 'the Welsh is empty' };
  }
  const pieces = atBackticks(welsh);
  if (pieces === null) {
    return { problem: 'the Welsh has a backtick with no partner' };
  }
  if (pieces.some((piece) => piece.code && piece.text === '')) {
    return { problem: 'the Welsh has an empty code span' };
  }
  return { pieces };
}

/** Both sides of one entry, read against each other. */
function readEntry(
  english: string,
  welsh: string,
): { readonly english: Reading; readonly welsh: Reading } {
  const welshReading = readWelsh(welsh);
  if ('problem' in welshReading) {
    return { english: welshReading, welsh: welshReading };
  }
  const codes = welshReading.pieces
    .filter((piece) => piece.code)
    .map((piece) => piece.text);
  const englishReading = readEnglish(english, codes);
  return 'problem' in englishReading
    ? { english: englishReading, welsh: englishReading }
    : { english: englishReading, welsh: welshReading };
}

/**
 * Why an entry's Welsh cannot be printed beside its English, or null when it
 * can.
 */
export function entryProblem(english: string, welsh: string): string | null {
  const read = readEntry(english, welsh).welsh;
  return 'problem' in read ? read.problem : null;
}

/** Thrown when a page is asked to print text it cannot print in its language. */
export class RecordTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordTextError';
  }
}

/**
 * A record's text as the page in this language prints it.
 *
 * The English page prints the record as it is written, with its code marked:
 * the spans the record's own backticks mark, and those its Welsh entry marks.
 * Without an entry it still prints the English, with only the record's own
 * spans, because the English is the record. The Welsh page prints the entry,
 * and has no text to print without one.
 *
 * Neither page reaches here without an entry in a build: the build refuses
 * every text with no entry, or with one that cannot be printed, before the
 * database is touched (see `welshRefusals`). Reaching here with one means that
 * refusal has stopped working, so this throws rather than print English on the
 * Welsh page.
 */
export function recordPieces(
  english: string,
  language: PageLanguage,
  recordWelsh: RecordWelsh,
): readonly TextPiece[] {
  const welsh = recordWelsh.get(english);
  if (welsh === undefined) {
    if (language === 'en') {
      return atBackticks(english) ?? [{ text: english, code: false }];
    }
    throw new RecordTextError(
      `The Welsh page has no Welsh for this record text: ${JSON.stringify(english)}`,
    );
  }
  const read = readEntry(english, welsh)[
    language === 'en' ? 'english' : 'welsh'
  ];
  if ('problem' in read) {
    throw new RecordTextError(
      `The record text ${JSON.stringify(english)} cannot be printed: ${read.problem}.`,
    );
  }
  return read.pieces;
}

/** Where the table is, as a refusal names it for whoever has to fix it. */
export const recordWelshPath = 'packages/server/src/ledger/record-welsh.ts';

/**
 * Every text the page shows from the records, with where it came from: each
 * check's name, area, what it protects against and how to tell it is switched
 * on; each run's plant, what was expected, why it settled nothing and its note;
 * and each observation's note. A field left empty shows the page's own words
 * rather than the record's, so it is not here.
 */
export function shownTexts(
  contents: LedgerContents,
  ledgerPath: string,
): ShownText[] {
  const shown: ShownText[] = [];
  const add = (file: string, field: string, english: string | null) => {
    if (english !== null && english !== '') {
      shown.push({ english, file: `${ledgerPath}/${file}`, field });
    }
  };
  for (const { file, record } of contents.checks) {
    add(file, 'its name', record.name);
    add(file, 'its area', record.area);
    add(file, 'what it protects against', record.protects);
    add(file, 'how to tell it is switched on', record.howToTellArmed);
  }
  for (const { file, record } of contents.runs) {
    add(file, 'what was planted', record.planted);
    add(file, 'what was expected', record.expected);
    add(file, 'why it settled nothing', record.inconclusiveReason);
    add(file, 'its note', record.note);
  }
  for (const { file, record } of contents.observations) {
    add(file, 'its note', record.note);
  }
  return shown;
}

/**
 * Every record text the page would show with no Welsh, or with Welsh that
 * cannot be printed beside it, one line each, and a last line saying where to
 * write it. An empty list is the only result that lets the build go on.
 *
 * A text many records share, such as what every replay of one check expected,
 * is named once, with the first record that holds it and how many others do.
 * The English is quoted as JSON, so it can be copied into the table exactly.
 */
export function welshRefusals(
  contents: LedgerContents,
  ledgerPath: string,
  recordWelsh: RecordWelsh,
): string[] {
  const byText = new Map<string, { first: ShownText; others: number }>();
  for (const text of shownTexts(contents, ledgerPath)) {
    const seen = byText.get(text.english);
    if (seen === undefined) {
      byText.set(text.english, { first: text, others: 0 });
    } else {
      seen.others += 1;
    }
  }

  const refusals: string[] = [];
  let missing = false;
  for (const [english, { first, others }] of byText) {
    const where = `${first.file}, ${first.field}${others === 0 ? '' : `, and ${String(others)} other record ${others === 1 ? 'text' : 'texts'} like it`}`;
    const welsh = recordWelsh.get(english);
    if (welsh === undefined) {
      missing = true;
      refusals.push(`${where}, has no Welsh: ${JSON.stringify(english)}`);
      continue;
    }
    const problem = entryProblem(english, welsh);
    if (problem !== null) {
      refusals.push(
        `${where}, has Welsh that cannot be printed beside it, because ${problem}: ${JSON.stringify(english)}`,
      );
    }
  }
  if (refusals.length > 0) {
    refusals.push(
      missing
        ? `Add the Welsh to ${recordWelshPath}, keyed on each English text exactly as quoted above, with backticks around every identifier and every piece of tool output. docs/publishing.md says how.`
        : `Correct the Welsh in ${recordWelshPath}. docs/publishing.md says how.`,
    );
  }
  return refusals;
}
