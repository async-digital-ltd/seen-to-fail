import type { ReplayResult } from './report.ts';

/**
 * Which tool scored a replay, and at which version (#101), read from the tool
 * that was installed rather than from anything written in this repository.
 *
 * The report says neither. canfail 0.2.1 prints `breaks`, `catches`,
 * `findings`, `look` and `outcomes` and nothing else, which report.ts holds it
 * to strictly, and it has no `--version` flag. What does say is the package
 * metadata of the installation the replay ran, which the workflow asks pip for
 * (`pip show canfail`) from the same environment the action ran canfail out of,
 * and hands over as text. The version is copied from there and never from the
 * workflow's pin, the action's requirements or a constant here: a restated pin
 * goes on reading the old number after the pin moves, and the record would
 * then name a version nothing ran.
 *
 * The one name written here is the tool whose report this package reads.
 * report.ts and adapt.ts describe canfail's report and nothing else, so a
 * report they accepted came from canfail. Metadata naming any other package
 * describes some other installation, and is refused rather than recorded,
 * because a version copied from it would disagree with the tool that ran.
 */
export const REPLAY_TOOL = 'canfail';

/** The tool and version a replay was scored by. */
export interface ReplayTool {
  /** The package's own name, as its metadata spells it. */
  readonly name: string;
  /** The version the metadata says is installed, copied as it was printed. */
  readonly version: string;
}

/** The longest version this accepts, which is far past any real one. */
export const MAX_TOOL_VERSION_LENGTH = 64;

/**
 * A version as Python packaging writes one: digits, letters, dots and the few
 * marks PEP 440 uses, with no space in it. Not a full PEP 440 parse, which
 * would be a second copy of a standard this does not need to judge; this keeps
 * out a blank, a sentence, or a second line read by mistake.
 */
export const TOOL_VERSION_PATTERN = /^[0-9][0-9A-Za-z.+!_-]*$/;

/** A package name as PEP 503 compares it: lower case, runs of `-_.` as `-`. */
function normalised(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/** The value of the first `Field: value` line with this field, if any. */
function field(text: string, name: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0 && line.slice(0, colon).trim() === name) {
      return line.slice(colon + 1).trim();
    }
  }
  return undefined;
}

/**
 * The tool and version the metadata of an installation names, or every reason
 * it cannot be recorded as the tool that scored the replay.
 */
export function parseToolMetadata(text: string): ReplayResult<ReplayTool> {
  const problems: string[] = [];
  const name = field(text, 'Name');
  const version = field(text, 'Version');

  if (name === undefined || name === '') {
    problems.push('The tool metadata does not name a package.');
  } else if (normalised(name) !== REPLAY_TOOL) {
    problems.push(
      `The tool metadata describes ${name}, not ${REPLAY_TOOL}, the tool whose report this reads.`,
    );
  }
  if (version === undefined || version === '') {
    problems.push('The tool metadata does not give a version.');
  } else if (
    version.length > MAX_TOOL_VERSION_LENGTH ||
    !TOOL_VERSION_PATTERN.test(version)
  ) {
    problems.push(
      'The tool metadata gives a version that is not written as one.',
    );
  }

  if (problems.length > 0 || name === undefined || version === undefined) {
    return { ok: false, problems };
  }
  return { ok: true, value: { name, version } };
}
