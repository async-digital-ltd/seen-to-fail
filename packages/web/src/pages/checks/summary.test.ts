import { describe, expect, it } from 'vitest';

import { describeHidden, describeMatching, describeWorkspace } from './summary';

const why =
  'A check nobody has watched fail is a check you are trusting on faith.';

describe('describeWorkspace', () => {
  it('counts the checks and the ones not proven, in words', () => {
    expect(describeWorkspace({ total: 8, proven: 2 })).toBe(
      'Eight checks in this workspace. Six are not proven: they have never been seen to catch anything, the last proof is old, or the latest run missed. ' +
        why,
    );
  });

  it('writes a count above twelve in digits', () => {
    expect(describeWorkspace({ total: 20, proven: 7 })).toBe(
      '20 checks in this workspace. 13 are not proven: they have never been seen to catch anything, the last proof is old, or the latest run missed. ' +
        why,
    );
  });

  it('speaks of one check not proven in the singular', () => {
    expect(describeWorkspace({ total: 3, proven: 2 })).toBe(
      'Three checks in this workspace. One is not proven: it has never been seen to catch anything, the last proof is old, or the latest run missed. ' +
        why,
    );
  });

  it('speaks of a workspace of one check in the singular', () => {
    expect(describeWorkspace({ total: 1, proven: 0 })).toMatch(
      /^One check in this workspace\. One is not proven: it has/,
    );
    expect(describeWorkspace({ total: 1, proven: 1 })).toBe(
      `One check in this workspace. It's proven. ${why}`,
    );
  });

  it('says so when every check is proven', () => {
    expect(describeWorkspace({ total: 4, proven: 4 })).toBe(
      `Four checks in this workspace. All four are proven. ${why}`,
    );
  });
});

describe('describeMatching', () => {
  it('counts the selected checks out of every check', () => {
    expect(describeMatching({ matching: 3, hidden: 5 })).toBe('3 of 8 checks');
    expect(describeMatching({ matching: 0, hidden: 8 })).toBe('0 of 8 checks');
  });

  it('keeps the noun singular for a workspace of one', () => {
    expect(describeMatching({ matching: 1, hidden: 0 })).toBe('1 of 1 check');
  });
});

describe('describeHidden', () => {
  it('counts what the filter hides', () => {
    expect(describeHidden(5)).toBe('5 hidden by this filter');
  });

  it('says nothing when the filter hides nothing', () => {
    expect(describeHidden(0)).toBeUndefined();
  });
});
