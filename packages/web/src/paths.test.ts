import { expect, it } from 'vitest';

import { paths } from './paths';

it('puts the list at the root', () => {
  expect(paths.checks()).toBe('/');
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
