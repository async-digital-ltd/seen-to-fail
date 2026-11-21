import { describe, expect, it } from 'vitest';

import { parseToolMetadata } from './tool.ts';

/**
 * What `pip show canfail` printed for the installation the replay action makes
 * from its pinned requirements, with the install path replaced, because the
 * path is the runner's and says nothing about the tool. Every other line is as
 * pip wrote it.
 */
function pipShow(name: string, version: string): string {
  return [
    `Name: ${name}`,
    `Version: ${version}`,
    'Summary: Break the thing on purpose and check that your check notices. A guard that never fails may be incapable of failing.',
    'Home-page: ',
    'Author: ',
    'Author-email: ',
    'License: MIT',
    'Location: /venv/lib/python3/site-packages',
    'Requires: didrun, restore-verified',
    'Required-by: ',
    '',
  ].join('\n');
}

describe('the tool that scored a replay (#101)', () => {
  it('reads the name and version from the installation metadata', () => {
    expect(parseToolMetadata(pipShow('canfail', '0.2.1'))).toEqual({
      ok: true,
      value: { name: 'canfail', version: '0.2.1' },
    });
  });

  it('copies whatever version is installed, rather than the one pinned today', () => {
    const result = parseToolMetadata(pipShow('canfail', '0.3.0rc1'));
    expect(result.ok && result.value.version).toBe('0.3.0rc1');
  });

  it('refuses metadata for another package, whose version would not be the tool that ran', () => {
    const result = parseToolMetadata(pipShow('didrun', '0.1.6'));
    expect(result).toEqual({
      ok: false,
      problems: [
        'The tool metadata describes didrun, not canfail, the tool whose report this reads.',
      ],
    });
  });

  it('refuses metadata with no version, rather than recording one from elsewhere', () => {
    const result = parseToolMetadata('Name: canfail\nSummary: x\n');
    expect(result).toEqual({
      ok: false,
      problems: ['The tool metadata does not give a version.'],
    });
  });

  it('refuses empty metadata, such as a pip that printed nothing', () => {
    const result = parseToolMetadata('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(2);
  });

  it('refuses a version that is not written as one', () => {
    expect(parseToolMetadata(pipShow('canfail', 'not a version')).ok).toBe(
      false,
    );
    expect(parseToolMetadata(pipShow('canfail', '1'.repeat(65))).ok).toBe(
      false,
    );
  });
});
