import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { repositoryRoot } from '../ledger/location.ts';
import {
  generatedBlocks,
  generatedBlocksIn,
  rewriteReadme,
  stepsOf,
} from './generated.ts';
import { inlineCodeIn, readReadme, sectionOf } from './readme.ts';

/**
 * The root README held to the tree it describes.
 *
 * Each test here reads a claim off the README and the fact it states off the
 * thing that owns it, so a README edited into disagreement fails here rather
 * than waiting for a reader to notice (#149). The claims that need the
 * database or the seeded workspace are held where those are: the table names in
 * the schema tests, and the filter example in the filter tests.
 */
const readme = readReadme();

it('holds every generated block exactly as `pnpm readme` would write it today', () => {
  expect(
    generatedBlocksIn(readme),
    'README.md differs from its sources. Run `pnpm readme` and commit the result.',
  ).toStrictEqual(generatedBlocks());
});

it('puts a generated block edited by hand back as its source writes it, and changes nothing else', () => {
  const blocks = generatedBlocks();
  const byHand = new Map(
    [...blocks.keys()].map((name) => [name, `\nTyped by hand into ${name}.\n`]),
  );

  const edited = rewriteReadme(readme, byHand);
  expect(generatedBlocksIn(edited)).toStrictEqual(byHand);
  expect(rewriteReadme(edited, blocks)).toBe(readme);
});

it("reads a job's steps in order, and refuses one it would have to leave off the list", () => {
  const workflow = (steps: readonly string[]): string =>
    ['jobs:', '  checks:', '    steps:', ...steps, '  publish:', ''].join('\n');

  expect(
    stepsOf(
      workflow([
        '      - name: Check out the repository',
        '        uses: actions/checkout@v7',
        '      # A comment between steps.',
        '      - name: Type check',
        '        run: pnpm typecheck',
        "      - name: 'Publish'",
        "        if: github.ref == 'refs/heads/main'",
        '        run: pnpm publish',
      ]),
      'checks',
    ),
  ).toStrictEqual([
    { name: 'Check out the repository', run: null, condition: null },
    { name: 'Type check', run: 'pnpm typecheck', condition: null },
    {
      name: 'Publish',
      run: 'pnpm publish',
      condition: "github.ref == 'refs/heads/main'",
    },
  ]);

  expect(() =>
    stepsOf(
      workflow([
        '      - name: Type check',
        '        run: pnpm typecheck',
        '      - uses: actions/checkout@v7',
      ]),
      'checks',
    ),
  ).toThrow('opens with "uses:" rather than "name:"');

  expect(() =>
    stepsOf(
      workflow([
        '      - name: Type check',
        '        run: |',
        '          pnpm typecheck',
        '          pnpm lint',
      ]),
      'checks',
    ),
  ).toThrow('runs more than one line');
});

/**
 * Whether a span of inline code is a path, judged by its shape alone.
 *
 * A span with a space in it is a command or a phrase, one starting with a slash
 * is an address on the running server, and one with a scheme is a web address.
 * What is left is a path when it has a slash in it, starts with a dot, or ends in
 * an extension some tracked file has, which keeps out `area.is.git` and
 * `127.0.0.1`.
 */
function looksLikePath(span: string, extensions: ReadonlySet<string>): boolean {
  if (/\s/u.test(span) || span.startsWith('/') || span.includes('://')) {
    return false;
  }
  if (span.includes('/') || span.startsWith('.')) {
    return true;
  }
  const extension = /\.([A-Za-z0-9]+)$/u.exec(span)?.[1];
  return extension !== undefined && extensions.has(extension);
}

/**
 * Spans with a path's shape that name something deliberately not in the tree,
 * and what each names instead. Each is checked to still be in the README, so
 * an entry cannot outlive the sentence it was written for and go on excusing
 * a path nobody is reading any more.
 */
const notInTheTree = new Map([
  ['.env', 'The file `cp .env.example .env` writes, which git ignores.'],
  ['.graphql', 'A file extension rather than a file.'],
  ['packages/web/dist', 'What `pnpm build:web` writes, which git ignores.'],
  ['async-digital-ltd.github.io/seen-to-fail', 'A web address.'],
]);

/** Branch lanes the workflows push to, whose names share a path's shape. */
const branchPrefixes = ['ci-control/', 'replay/'];

/** Every file git tracks, and every directory one of them sits in. */
function trackedPaths(): Set<string> {
  const listed = execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const paths = new Set<string>();
  for (const file of listed.split('\0').filter((entry) => entry !== '')) {
    const parts = file.split('/');
    for (let depth = 1; depth <= parts.length; depth += 1) {
      paths.add(parts.slice(0, depth).join('/'));
    }
  }
  return paths;
}

it('takes a span of inline code for a path only when it has the shape of one', () => {
  const extensions = new Set(['json', 'md', 'ts']);
  const spans = [
    'ledger/runs/',
    '.env.example',
    'canfail.json',
    'area.is.git',
    '127.0.0.1',
    '/health',
    'http://127.0.0.1:4000/graphql',
    'pnpm db:seed',
    'STALE_AFTER_DAYS',
  ];

  expect(spans.filter((span) => looksLikePath(span, extensions))).toStrictEqual(
    ['ledger/runs/', '.env.example', 'canfail.json'],
  );
});

it('names only paths that exist in the tree', () => {
  const tracked = trackedPaths();
  const extensions = new Set(
    [...tracked].flatMap((path) => {
      const extension = /\.([A-Za-z0-9]+)$/u.exec(path)?.[1];
      return extension === undefined ? [] : [extension];
    }),
  );
  const paths = [
    ...new Set(
      inlineCodeIn(readme).filter((span) => looksLikePath(span, extensions)),
    ),
  ];

  const missing = paths.filter(
    (path) =>
      !tracked.has(path.replace(/\/$/u, '')) &&
      !notInTheTree.has(path) &&
      !branchPrefixes.some((prefix) => path.startsWith(prefix)),
  );
  expect(missing).toStrictEqual([]);
  expect(
    [...notInTheTree.keys()].filter((path) => !paths.includes(path)),
  ).toStrictEqual([]);
});

/**
 * A line of text as a screen reader would say it, for comparing the drawing's
 * words with the alt text that stands in for them.
 *
 * Case is styling, so it is dropped. The middle dot between the two halves of
 * each label in the drawing is a separator nobody would read aloud, so it is
 * read as the comma the alt text uses in its place.
 */
function spoken(text: string): string {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/\s*·\s*/gu, ', ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** Every piece of text the drawing shows, in the order the file holds it. */
function wordsDrawnIn(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gu)].map((text) =>
    (text[1] ?? '').replace(/<[^>]+>/gu, ''),
  );
}

it('gives the roadmap picture alt text that says every word the drawing shows, in order', () => {
  const section = sectionOf(readme, 'What shipped, and where it could go');
  const picture = /<picture>([\s\S]*?)<\/picture>/u.exec(section)?.[1];
  if (picture === undefined) {
    throw new Error('README.md has no <picture> under "What shipped".');
  }
  const alt = /\balt="([^"]*)"/u.exec(picture)?.[1];
  if (alt === undefined) {
    throw new Error('The roadmap picture in README.md has no alt text.');
  }
  const drawings = [...picture.matchAll(/\b(?:srcset|src)="([^"]+)"/gu)].map(
    (source) => source[1] ?? '',
  );
  expect(drawings).toHaveLength(2);

  const said = spoken(alt);
  for (const drawing of drawings) {
    const words = wordsDrawnIn(
      readFileSync(join(repositoryRoot, drawing), 'utf8'),
    );
    expect(words, drawing).not.toHaveLength(0);

    const unsaid: string[] = [];
    let from = 0;
    for (const line of words) {
      const at = said.indexOf(spoken(line), from);
      if (at === -1) {
        unsaid.push(line);
      } else {
        from = at + spoken(line).length;
      }
    }
    expect(
      unsaid,
      `${drawing}: lines the alt text does not say, in order`,
    ).toStrictEqual([]);
  }
});
