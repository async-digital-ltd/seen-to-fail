import { expect, it } from 'vitest';

import { uuidPattern } from '../database/checks.ts';
import { ledgerCheckUuid, ledgerFileUuid, ledgerUuid } from './identity.ts';

/**
 * The ids the build gives the records it loads.
 *
 * Three properties, and the published export is wrong in a different way
 * without each of them: the same record always gets the same id, two different
 * records never get the same one, and what comes out is something the uuid
 * columns will take.
 */

it('gives the same record the same id every time', () => {
  expect(ledgerCheckUuid('ci-lint')).toBe(ledgerCheckUuid('ci-lint'));
});

it('gives two records different ids', () => {
  expect(ledgerCheckUuid('ci-lint')).not.toBe(ledgerCheckUuid('ci-test'));
});

/**
 * Without the namespace in the hashed text, a check whose slug happened to read
 * like a path would collide with the file of that name, and one of the two
 * would silently replace the other at insert time.
 */
it('keeps a check and a file of the same name apart', () => {
  expect(ledgerUuid('check', 'ledger/runs/x.json')).not.toBe(
    ledgerFileUuid('ledger/runs/x.json'),
  );
});

it('produces something the uuid columns accept', () => {
  expect(ledgerCheckUuid('ci-lint')).toMatch(uuidPattern);
});

/**
 * Pinned rather than recomputed. A test that hashes the input again would pass
 * whatever the function did, including changing its answer, and every id in
 * every published export would move with it.
 *
 * The value was derived by hand rather than read off the function: the MD5 of
 * `check:ci-lint` is 3e74935bf38cd979db69dd02fd82630f, and setting the version
 * and variant bits turns the seventh byte d9 into 39 and the ninth db into 9b.
 */
it('has not changed its answer', () => {
  expect(ledgerCheckUuid('ci-lint')).toBe(
    '3e74935b-f38c-3979-9b69-dd02fd82630f',
  );
});
