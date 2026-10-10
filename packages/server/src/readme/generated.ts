import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repositoryRoot } from '../ledger/location.ts';

/**
 * The parts of the README that are a listing of something in the tree, written
 * from the tree rather than by hand.
 *
 * Each of these used to be typed out in the README and agree with its source
 * only while somebody remembered to keep it agreeing (#149). A generated block
 * has one source and nothing to tend: `pnpm readme` rewrites every block from
 * its source, and a test fails while any block differs from what that would
 * write, so a change to the source cannot merge with the README still telling
 * the old story.
 *
 * A block sits between two HTML comments, which GitHub does not show:
 *
 *     <!-- generated: packages, by pnpm readme from ... -->
 *     ...whatever the generator writes...
 *     <!-- end generated: packages -->
 *
 * Everything between the two lines is the generator's, and an edit made there
 * by hand is undone by the next `pnpm readme` and refused by the test until
 * then. The text after the name in the opening comment is for the person
 * reading the Markdown and is not read here.
 *
 * The blocks sit in `docs/tests.md`, which is the README's Tests section moved
 * out of it when the README was split into a front page and `docs/` (#251).
 * `pnpm readme` keeps its name, because the file is still part of the README's
 * account of the project.
 */

/** The file the generated blocks sit in, from the repository root. */
export const generatedPath = 'docs/tests.md';

/** The same file, as a path this process can read. */
export const generatedFile = join(repositoryRoot, generatedPath);

const opening = /^<!-- generated: ([a-z-]+)\b.*-->$/u;

function closing(name: string): string {
  return `<!-- end generated: ${name} -->`;
}

/** Where a block's lines start and end inside the README's lines. */
interface Region {
  readonly name: string;
  /** The index of the first line after the opening comment. */
  readonly start: number;
  /** The index of the closing comment. */
  readonly end: number;
}

/**
 * Every generated region in the README, in the order it holds them.
 *
 * Refuses an opening comment with no closing one, and a name used twice, rather
 * than guessing which lines belong to which block.
 */
function regionsIn(lines: readonly string[]): Region[] {
  const regions: Region[] = [];
  for (const [index, line] of lines.entries()) {
    const name = opening.exec(line)?.[1];
    if (name === undefined) {
      continue;
    }
    if (regions.some((region) => region.name === name)) {
      throw new Error(
        `${generatedPath} opens the generated block ${name} twice.`,
      );
    }
    const end = lines.indexOf(closing(name), index + 1);
    if (end === -1) {
      throw new Error(
        `${generatedPath} opens the generated block ${name} and never closes it with "${closing(name)}".`,
      );
    }
    regions.push({ name, start: index + 1, end });
  }
  return regions;
}

/**
 * The text the README holds inside each generated block, by name.
 *
 * A block's text is held with a blank line either side of it, which is what
 * keeps Markdown from reading a list or a fence as part of the comment.
 */
export function generatedBlocksIn(readme: string): Map<string, string> {
  const lines = readme.split('\n');
  return new Map(
    regionsIn(lines).map((region) => [
      region.name,
      lines.slice(region.start, region.end).join('\n'),
    ]),
  );
}

/**
 * The README with every generated block replaced by what its source writes now.
 *
 * Refuses a block the README opens that nothing writes, and a block something
 * writes that the README does not open, so a renamed block cannot leave the old
 * text standing.
 */
export function rewriteReadme(
  readme: string,
  blocks: ReadonlyMap<string, string>,
): string {
  const lines = readme.split('\n');
  const regions = regionsIn(lines);

  for (const name of blocks.keys()) {
    if (!regions.some((region) => region.name === name)) {
      throw new Error(`${generatedPath} has no generated block named ${name}.`);
    }
  }

  // From the last region to the first, so that replacing one never moves the
  // lines of a region still to be replaced.
  for (const region of [...regions].reverse()) {
    const text = blocks.get(region.name);
    if (text === undefined) {
      throw new Error(
        `${generatedPath} opens a generated block named ${region.name}, and nothing generates it.`,
      );
    }
    lines.splice(region.start, region.end - region.start, ...text.split('\n'));
  }
  return lines.join('\n');
}

/** A block's text as the README holds it: a blank line, the text, a blank line. */
function spaced(text: string): string {
  return `\n${text}\n`;
}

/**
 * The repository's packages, one line each, from the `packages/` directory and
 * each package's own `description`.
 *
 * The directory is the source for which packages there are, because it is
 * what `pnpm-workspace.yaml` points the workspace at. The description is the
 * package's own account of itself, so it is written once, beside the code it
 * describes.
 */
export function packageList(root: string = repositoryRoot): string {
  const directory = join(root, 'packages');
  const names = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return spaced(
    names
      .map((name) => {
        const manifest: unknown = JSON.parse(
          readFileSync(join(directory, name, 'package.json'), 'utf8'),
        );
        const description =
          typeof manifest === 'object' &&
          manifest !== null &&
          'description' in manifest &&
          typeof manifest.description === 'string'
            ? manifest.description.trim()
            : '';
        if (description === '') {
          throw new Error(
            `packages/${name}/package.json has no description for the README to list.`,
          );
        }
        return `- \`packages/${name}\`: ${description}`;
      })
      .join('\n'),
  );
}

/**
 * What a step does: use an action, run one command written on its `run:` line,
 * or run a script written as a block under `run: |`.
 */
export type StepWork =
  | { readonly kind: 'action' }
  | { readonly kind: 'command'; readonly command: string }
  | { readonly kind: 'script' };

/** One step of a job in a workflow file, as far as the README needs one. */
export interface WorkflowStep {
  readonly name: string;
  readonly work: StepWork;
  /** The step's `if:` condition, or null for a step that always runs. */
  readonly condition: string | null;
}

/** A scalar as YAML writes it, with one pair of matching quotes taken off. */
function unquoted(value: string): string {
  const quoted = /^(['"])(.*)\1$/u.exec(value);
  return quoted?.[2] ?? value;
}

/**
 * The steps of one job in a workflow file, in the order they run.
 *
 * This reads the layout `.github/workflows/ci.yml` is written in rather than
 * YAML in general: the job's key indented two spaces, each step opening with
 * `- name:` at six, and its keys at eight. A step it cannot read that way is
 * refused rather than skipped, because a step missing from the list is exactly
 * the quiet wrongness the list exists to prevent. A `run:` written as a block
 * is read as a script, not as its first line, and only the README's list of
 * commands has any objection to one.
 */
export function stepsOf(workflow: string, job: string): WorkflowStep[] {
  const lines = workflow.split('\n');
  const start = lines.indexOf(`  ${job}:`);
  if (start === -1) {
    throw new Error(`The workflow has no job named ${job}.`);
  }
  const next = lines.findIndex(
    (line, index) => index > start && /^ {2}\S/u.test(line),
  );
  const body = lines.slice(start + 1, next === -1 ? lines.length : next);

  const steps: {
    name: string;
    work: StepWork;
    condition: string | null;
  }[] = [];
  for (const line of body) {
    const opened = /^ {6}- (\S+?):\s*(.*)$/u.exec(line);
    if (opened !== null) {
      if (opened[1] !== 'name') {
        throw new Error(
          `A step in the ${job} job opens with "${opened[1] ?? ''}:" rather than "name:", so it has no name to list.`,
        );
      }
      steps.push({
        name: unquoted(opened[2] ?? ''),
        work: { kind: 'action' },
        condition: null,
      });
      continue;
    }

    const current = steps.at(-1);
    const key = /^ {8}(run|if):\s*(.*)$/u.exec(line);
    if (current === undefined || key === null) {
      continue;
    }
    const value = key[2] ?? '';
    if (key[1] === 'run') {
      current.work =
        value === '' || value.startsWith('|') || value.startsWith('>')
          ? { kind: 'script' }
          : { kind: 'command', command: unquoted(value) };
    } else {
      current.condition = unquoted(value);
    }
  }

  if (steps.length === 0) {
    throw new Error(`The ${job} job has no steps this reader can find.`);
  }
  return steps;
}

/** The workflow whose checks job the README describes. */
const ciWorkflow = join(repositoryRoot, '.github', 'workflows', 'ci.yml');

function checksJob(): WorkflowStep[] {
  return stepsOf(readFileSync(ciWorkflow, 'utf8'), 'checks');
}

/**
 * Every step of CI's checks job, by the name the workflow gives it, numbered in
 * the order it runs. A step that runs only under a condition says so, in the
 * workflow's own words, because a list that left it out would claim the step
 * runs every time.
 */
export function ciSteps(steps: readonly WorkflowStep[] = checksJob()): string {
  return spaced(
    steps
      .map((step, index) => {
        const when =
          step.condition === null ? '' : `, only if \`${step.condition}\``;
        return `${String(index + 1)}. ${step.name}${when}`;
      })
      .join('\n'),
  );
}

/**
 * The commands a contributor runs to check a change, which are the ones CI
 * runs between applying the migrations and starting the server.
 *
 * The two steps either side are found by name, so renaming either one in the
 * workflow fails here, loudly, rather than moving the edges of the list.
 */
export function contributorCommands(
  steps: readonly WorkflowStep[] = checksJob(),
): string {
  const named = (name: string): number => {
    const index = steps.findIndex((step) => step.name === name);
    if (index === -1) {
      throw new Error(`The checks job has no step named "${name}".`);
    }
    return index;
  };
  const between = steps.slice(
    named('Apply migrations') + 1,
    named('Check the server starts'),
  );
  if (between.length === 0) {
    throw new Error(
      'The checks job runs nothing between applying the migrations and starting the server.',
    );
  }

  // A step anywhere else in the job can be written however it needs to be.
  // Only these are listed as commands a contributor types, so only these have
  // to be one.
  const fix =
    'Move it before "Apply migrations" or after "Check the server starts"';
  const commands = between.map((step) => {
    switch (step.work.kind) {
      case 'command':
        return step.work.command;
      case 'action':
        throw new Error(
          `The step "${step.name}" uses an action, which a contributor cannot run as a command. ${fix}.`,
        );
      case 'script':
        throw new Error(
          `The step "${step.name}" runs more than one line, which the README cannot list as one command. ${fix}, or put its lines in a script under scripts/ and run that on one line.`,
        );
    }
  });
  return spaced(['```sh', ...commands, '```'].join('\n'));
}

/** Every block the README holds, written from the tree as it stands. */
export function generatedBlocks(): Map<string, string> {
  return new Map([
    ['contributor-commands', contributorCommands()],
    ['packages', packageList()],
    ['ci-steps', ciSteps()],
  ]);
}
