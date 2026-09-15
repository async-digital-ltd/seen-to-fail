import { emptyFilter, parseFilterString } from '@seen-to-fail/filter';
import type { Filter } from '@seen-to-fail/filter';
import { expect, it } from 'vitest';

import { filterParameter, paths } from './paths';

it('puts the list at the root', () => {
  expect(paths.checks()).toBe('/');
});

it('gives the filter that hides nothing the bare address', () => {
  expect(paths.checks({ filter: emptyFilter })).toBe('/');
});

/** The example filter from the filter package's README. */
const example: Filter = {
  kind: 'groups',
  joiner: 'and',
  groups: [
    {
      joiner: 'or',
      conditions: [
        { field: 'status', op: 'is', value: 'Unproven' },
        { field: 'status', op: 'is', value: 'Stale' },
      ],
    },
    { joiner: 'and', conditions: [{ field: 'area', op: 'is', value: 'ci' }] },
  ],
};

it('carries a filter in the link grammar, with nothing percent-escaped', () => {
  expect(paths.checks({ filter: example })).toBe(
    '/?f=and!or*status.is.Unproven*status.is.Stale!and*area.is.ci',
  );
});

it('builds an address whose filter reads back as the one given', () => {
  const filter: Filter = {
    kind: 'groups',
    joiner: 'or',
    groups: [
      {
        joiner: 'and',
        conditions: [{ field: 'area', op: 'isNot', value: 'smoke tests' }],
      },
    ],
  };

  const address = new URL(paths.checks({ filter }), 'https://example.test');

  expect(address.pathname).toBe('/');
  expect(parseFilterString(address.searchParams.get(filterParameter))).toEqual({
    ok: true,
    filter,
  });
});

it('keeps the form for a new check apart from a check with that name', () => {
  expect(paths.newCheck()).toBe('/checks/new');
  expect(paths.check('new')).toBe('/checks/new');
});

it('escapes an id so it stays one path segment', () => {
  expect(paths.check('a/b c')).toBe('/checks/a%2Fb%20c');
});

it('links to the run form with no check pre-selected', () => {
  expect(paths.newRun()).toBe('/runs/new');
});

it('pre-selects a check through the query string', () => {
  expect(paths.newRun({ check: 'ci-lint' })).toBe('/runs/new?check=ci-lint');
  expect(paths.newRun({ check: 'a&b' })).toBe('/runs/new?check=a%26b');
});
