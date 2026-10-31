import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { checksDirectory } from '../ledger/load.ts';
import { ledgerDirectory, repositoryRoot } from '../ledger/location.ts';
import { publishingRefusals } from '../ledger/publishable.ts';
import {
  contributorCommands,
  fileAt,
  generatedBlocksIn,
  generatedFiles,
  rewriteReadme,
  stepsOf,
} from './generated.ts';
import type { WorkflowStep } from './generated.ts';
import {
  docsDirectory,
  fencedLinesIn,
  flattened,
  inlineCodeIn,
  readDoc,
  readDocumentation,
  readReadme,
  sectionOf,
} from './readme.ts';

/**
 * The root README held to the tree it describes.
 *
 * Each test here reads a claim off the README and the fact it states off the
 * thing that owns it, so a README edited into disagreement fails here rather
 * than waiting for a reader to notice (#149). The claims that need the
 * database or the seeded workspace are held where those are: the table names in
 * the schema tests, and the filter example in the filter tests.
 *
 * Since the README was split into a front page and `docs/` (#251), a claim is
 * read from the file it moved to: the generated blocks from `docs/tests.md`,
 * the roadmap picture from `docs/roadmap.md`, and the ledger's counts from the
 * files the ledger section became.
 */
const readme = readReadme();

/**
 * Every file that holds generated blocks, with its text as it stands. None of
 * them is moved by a replay: the counts a replay moves are printed by
 * `pnpm ledger:counts` rather than committed (#270).
 */
const generated = generatedFiles().map((file) => ({
  ...file,
  text: readFileSync(fileAt(file.path), 'utf8'),
}));

it.each(generated)(
  'holds every generated block in $path exactly as `pnpm readme` would write it today',
  ({ path, blocks, text }) => {
    expect(
      generatedBlocksIn(text, path),
      `${path} differs from its sources. Run \`pnpm readme\` and commit the result.`,
    ).toStrictEqual(blocks());
  },
);

/**
 * The writer's own behaviour, on each file as `pnpm readme` would leave it, so
 * a file that is merely behind its sources fails only the test above, with
 * its message, and not this one with a diff of the whole file.
 */
it.each(generated)(
  'puts a generated block in $path edited by hand back as its source writes it, and changes nothing else',
  ({ path, blocks: write, text }) => {
    const blocks = write();
    const current = rewriteReadme(text, blocks, path);
    const byHand = new Map(
      [...blocks.keys()].map((name) => [
        name,
        `\nTyped by hand into ${name}.\n`,
      ]),
    );

    const edited = rewriteReadme(current, byHand, path);
    expect(generatedBlocksIn(edited, path)).toStrictEqual(byHand);
    expect(rewriteReadme(edited, blocks, path)).toBe(current);
  },
);

/** A workflow holding one job, `checks`, with these step lines. */
function workflow(steps: readonly string[]): string {
  return ['jobs:', '  checks:', '    steps:', ...steps, '  publish:', ''].join(
    '\n',
  );
}

it("reads a job's steps in order, and refuses one it would have to leave off the list", () => {
  expect(
    stepsOf(
      workflow([
        '      - name: Check out the repository',
        '        uses: actions/checkout@v7',
        '      # A comment between steps.',
        '      - name: Type check',
        '        run: pnpm typecheck',
        '      - name: Lint the workflows',
        '        run: |',
        '          actionlint',
        '          zizmor .',
        "      - name: 'Publish'",
        "        if: github.ref == 'refs/heads/main'",
        '        run: pnpm publish',
      ]),
      'checks',
    ),
  ).toStrictEqual([
    {
      name: 'Check out the repository',
      work: { kind: 'action' },
      condition: null,
    },
    {
      name: 'Type check',
      work: { kind: 'command', command: 'pnpm typecheck' },
      condition: null,
    },
    { name: 'Lint the workflows', work: { kind: 'script' }, condition: null },
    {
      name: 'Publish',
      work: { kind: 'command', command: 'pnpm publish' },
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
});

/** The checks job's edges, with these step lines between them and after. */
function checksJobWith(
  between: readonly string[],
  after: readonly string[] = [],
): WorkflowStep[] {
  return stepsOf(
    workflow([
      '      - name: Apply migrations',
      '        run: pnpm db:migrate',
      '      - name: Type check',
      '        run: pnpm typecheck',
      ...between,
      '      - name: Check the server starts',
      '        run: bash scripts/check-server-starts.sh',
      ...after,
    ]),
    'checks',
  );
}

const scriptStep = [
  '      - name: Lint the workflows',
  '        run: |',
  '          actionlint',
  '          zizmor .',
];

it('lists the commands between the migrations and the server start, whatever steps come after them', () => {
  expect(contributorCommands(checksJobWith([], scriptStep))).toBe(
    '\n```sh\npnpm typecheck\n```\n',
  );
  expect(
    contributorCommands(
      checksJobWith(
        [],
        ['      - name: Keep the output', '        uses: actions/upload@v7'],
      ),
    ),
  ).toBe('\n```sh\npnpm typecheck\n```\n');
});

it('refuses a step between them that a contributor cannot type, and says where to put it', () => {
  expect(() => contributorCommands(checksJobWith(scriptStep))).toThrow(
    'runs more than one line, which the README cannot list as one command. Move it before "Apply migrations" or after "Check the server starts", or put its lines in a script',
  );
  expect(() =>
    contributorCommands(
      checksJobWith([
        '      - name: Keep the output',
        '        uses: actions/upload@v7',
      ]),
    ),
  ).toThrow(
    'uses an action, which a contributor cannot run as a command. Move it before "Apply migrations" or after "Check the server starts".',
  );
});

/**
 * The words in spans of inline code, and in the lines of fenced blocks, that
 * are paths, judged by their shape alone.
 *
 * A span or a line is split at its spaces, so a path inside a command such as
 * `ls ledger/checks` is read as well as a span that is only a path. A word
 * starting with a slash is an address on the running server, one with a scheme
 * is a web address, one in quotes is a value in a command or a condition, such
 * as `'refs/heads/main'`, and one with no letter or digit in it is punctuation.
 * What is left is a path when it has a slash in it, starts with a dot, or ends
 * in an extension some tracked file has, which keeps out `area.is.git` and
 * `127.0.0.1`.
 *
 * A word with no slash, no dot and no extension cannot be told from a name by
 * its shape, so `LICENSE` is the one path in the README this does not read.
 */
function pathsIn(
  spans: readonly string[],
  extensions: ReadonlySet<string>,
): string[] {
  const looksLikePath = (word: string): boolean => {
    if (
      word.startsWith('/') ||
      word.startsWith("'") ||
      word.startsWith('"') ||
      word.includes('://') ||
      !/[A-Za-z0-9]/u.test(word)
    ) {
      return false;
    }
    if (word.includes('/') || word.startsWith('.')) {
      return true;
    }
    const extension = /\.([A-Za-z0-9]+)$/u.exec(word)?.[1];
    return extension !== undefined && extensions.has(extension);
  };
  return [
    ...new Set(spans.flatMap((span) => span.split(' ').filter(looksLikePath))),
  ];
}

/**
 * Whether a path is in the tree. A trailing slash names the directory, and a
 * word with a `*` in it is a pattern the shell expands, which is in the tree
 * when some tracked file matches it.
 */
function inTree(path: string, tracked: ReadonlySet<string>): boolean {
  const bare = path.replace(/\/$/u, '');
  if (!bare.includes('*')) {
    return tracked.has(bare);
  }
  const pattern = new RegExp(
    `^${bare
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
      .join('[^/]*')}$`,
    'u',
  );
  return [...tracked].some((file) => pattern.test(file));
}

/**
 * Words with a path's shape that name something deliberately not in the tree,
 * and what each names instead. Each is checked to still be in the README, so
 * an entry cannot outlive the sentence it was written for and go on excusing
 * a path nobody is reading any more.
 */
const notInTheTree = new Map([
  ['.env', 'The file `cp .env.example .env` writes, which git ignores.'],
  ['.graphql', 'A file extension rather than a file.'],
  ['packages/web/dist', 'What `pnpm build:web` writes, which git ignores.'],
  ['dist/ledger', 'What `pnpm ledger:build` writes, which git ignores.'],
  ['async-digital-ltd.github.io/seen-to-fail', 'A web address.'],
  ['NVM_DIR=/opt/nvm', "A variable set to the cloud container's nvm."],
  [
    'repos/async-digital-ltd/seen-to-fail/actions/permissions/workflow',
    "A path in GitHub's REST API, which `gh api` is given.",
  ],
  [
    'async-digital-ltd/canfail-action@5ffd94d2598c9f9ce91aecf1122b9296a38b56e7',
    'An action in another repository, as a `uses:` line names it.',
  ],
]);

/** Branch lanes the workflows push to, whose names share a path's shape. */
const branchPrefixes = ['ci-control/', 'replay/', 'record/'];

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

it('reads a word of inline code as a path only when it has the shape of one', () => {
  const extensions = new Set(['json', 'md', 'ts']);
  const spans = [
    'ledger/runs/',
    '.env.example',
    'canfail.json',
    'ls ledger/checks',
    "! grep -qi '<script' ...",
    "github.ref == 'refs/heads/main'",
    'area.is.git',
    '127.0.0.1',
    '/health',
    'http://127.0.0.1:4000/graphql',
    'pnpm db:seed',
    'STALE_AFTER_DAYS',
  ];

  expect(pathsIn(spans, extensions)).toStrictEqual([
    'ledger/runs/',
    '.env.example',
    'canfail.json',
    'ledger/checks',
  ]);
});

it('finds a path with a pattern in it only when a tracked file matches', () => {
  const tracked = new Set(['ledger', 'ledger/runs', 'ledger/runs/a.json']);

  expect(inTree('ledger/runs/*.json', tracked)).toBe(true);
  expect(inTree('ledger/runs/*.yml', tracked)).toBe(false);
  expect(inTree('ledger/*.json', tracked)).toBe(false);
});

it('names only paths that exist in the tree', () => {
  const documentation = [...readDocumentation().values()];
  const tracked = trackedPaths();
  const extensions = new Set(
    [...tracked].flatMap((path) => {
      const extension = /\.([A-Za-z0-9]+)$/u.exec(path)?.[1];
      return extension === undefined ? [] : [extension];
    }),
  );
  const paths = pathsIn(
    documentation.flatMap((text) => [
      ...inlineCodeIn(text),
      ...fencedLinesIn(text),
    ]),
    extensions,
  );

  const missing = paths.filter(
    (path) =>
      !inTree(path, tracked) &&
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
  const section = readDoc('roadmap.md');
  const picture = /<picture>([\s\S]*?)<\/picture>/u.exec(section)?.[1];
  if (picture === undefined) {
    throw new Error('docs/roadmap.md has no <picture>.');
  }
  const alt = /\balt="([^"]*)"/u.exec(picture)?.[1];
  if (alt === undefined) {
    throw new Error('The roadmap picture in docs/roadmap.md has no alt text.');
  }
  const drawings = [...picture.matchAll(/\b(?:srcset|src)="([^"]+)"/gu)].map(
    (source) => source[1] ?? '',
  );
  expect(drawings).toHaveLength(2);

  const said = spoken(alt);
  for (const drawing of drawings) {
    // The picture's sources are relative to docs/, where the page sits.
    const words = wordsDrawnIn(
      readFileSync(join(docsDirectory, drawing), 'utf8'),
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

/**
 * The README's ledger section, which the split put in four files of `docs/` and
 * one section the front page keeps, because the published page links it
 * (#251). Read as one, so each sentence below is still found exactly once in
 * the text it was written into.
 */
function ledgerSection(): string {
  return flattened(
    [
      readDoc('published-ledger.md'),
      readDoc('replay.md'),
      readDoc('automatic.md'),
      readDoc('publishing.md'),
      sectionOf(readme, 'What belongs on a public ledger'),
    ].join('\n'),
  );
}

/**
 * The README says this ledger is safe to publish because every check in it is
 * about quality. That used to be read off the area each check is filed under
 * (#216), which its author chooses, so a secret scanner filed under Code would
 * have passed (#234). It is read instead off a list of check ids that someone
 * added by hand, so a new check fails here until a person has named it as safe
 * to publish. The build refuses the same ledger (#280).
 */
it('names every check in the ledger on the list of checks safe to publish', () => {
  const directory = join(ledgerDirectory, checksDirectory);
  const ids = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map(
      (name) =>
        (
          JSON.parse(readFileSync(join(directory, name), 'utf8')) as {
            id: string;
          }
        ).id,
    );

  const prose = ledgerSection();
  const found = [
    ...prose.matchAll(
      /Every check in `ledger\/checks\/` is named by hand on the list of checks safe to publish, in `packages\/server\/src\/ledger\/publishable\.ts`, and the build and the tests refuse a check that is not on it, whatever area it is filed under\./gu,
    ),
  ];
  const [only] = found;
  if (only === undefined || found.length > 1) {
    throw new Error(
      `The ledger section has ${String(found.length)} sentences naming the list of checks safe to publish, and exactly one was expected.`,
    );
  }

  expect(publishingRefusals(ids)).toStrictEqual([]);
});

it('refuses a check nobody has listed, whatever its area, and a listed id nothing declares', () => {
  const listed = ['ci-lint', 'ci-test'];

  expect(publishingRefusals(['ci-lint', 'ci-test'], listed)).toStrictEqual([]);
  expect(
    publishingRefusals(['ci-lint', 'ci-test', 'ci-secret-scan'], listed),
  ).toStrictEqual([
    'ci-secret-scan is declared in ledger/checks/ but is not on the list of checks safe to publish. Add it to publishableCheckIds by name only once it is clear it guards no secret, access rule or leak.',
  ]);
  expect(publishingRefusals(['ci-lint'], listed)).toStrictEqual([
    'ci-test is on the list of checks safe to publish, but no check in ledger/checks/ declares it. Take it off the list.',
  ]);
});
