import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repositoryRoot } from '../ledger/location.ts';

/**
 * Reading the root README as a set of claims rather than as prose.
 *
 * The README is the most-read page of a project about whether claims were
 * checked, and nothing used to read it: a count in it could go false and every
 * step of CI would still pass (#149). The tests that hold it to the tree, and
 * the generator that writes the parts of it a tree can write, read it through
 * these helpers so that each of them finds a sentence under the heading it sits
 * under rather than wherever in the file a pattern first happens to match.
 */

/** The root README, as a path this process can read. */
export const readmeFile = join(repositoryRoot, 'README.md');

export function readReadme(): string {
  return readFileSync(readmeFile, 'utf8');
}

/**
 * The text under one `## ` heading, up to the next `## ` heading or the end of
 * the file.
 *
 * Refuses a heading the README does not have, and one it has twice, so a test
 * reading a section can neither read nothing nor read the wrong one of two.
 */
export function sectionOf(readme: string, heading: string): string {
  const lines = readme.split('\n');
  const starts = lines.flatMap((line, index) =>
    line === `## ${heading}` ? [index] : [],
  );
  const start = starts[0];
  if (start === undefined || starts.length > 1) {
    throw new Error(
      `README.md has ${String(starts.length)} "## ${heading}" headings, and exactly one was expected.`,
    );
  }

  const next = lines.findIndex(
    (line, index) => index > start && line.startsWith('## '),
  );
  return lines.slice(start + 1, next === -1 ? lines.length : next).join('\n');
}

/**
 * Prose with every run of whitespace, line breaks included, made one space.
 *
 * The README is wrapped at eighty columns, so a phrase a test looks for can be
 * broken across two lines anywhere a space falls, and wherever Prettier next
 * decides to put the break.
 */
export function flattened(text: string): string {
  return text.replace(/\s+/gu, ' ');
}

const numberWords = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

/**
 * A count as the README writes it, which is in words up to twelve and in
 * figures beyond.
 *
 * A word it does not know is refused rather than read as nothing, so a count
 * the README spells some other way fails the test that reads it instead of
 * passing it.
 */
export function countOf(written: string): number {
  if (/^\d+$/u.test(written)) {
    return Number(written);
  }
  const index = numberWords.indexOf(written.toLowerCase());
  if (index === -1) {
    throw new Error(`"${written}" is not a count these README tests can read.`);
  }
  return index;
}

/**
 * Every span of inline code in some Markdown, with fenced blocks left out.
 *
 * A fenced block is a listing rather than a claim made in a sentence, and its
 * backticks would otherwise pair with the ones around it. A span may run across
 * a line break, because the wrapping puts one there whenever it falls on a
 * space inside the span, so a span is returned with its whitespace flattened.
 */
export function inlineCodeIn(markdown: string): string[] {
  const outsideFences = markdown.replace(/^```[^\n]*\n[\s\S]*?^```$/gmu, '');
  return [...outsideFences.matchAll(/`([^`]+)`/gu)].map((span) =>
    flattened(span[1] ?? ''),
  );
}
