import { createHash } from 'node:crypto';

/**
 * The uuid a ledger record gets when the build loads it into PostgreSQL.
 *
 * The database keys everything by uuid and the ledger keys checks by slug and
 * runs by the file they are written in, so something has to map between them.
 * A random uuid would do it once and differently on the next build, which would
 * make every published id change on every build for no reason, and would leave
 * the export with no way back to the file a run came from.
 *
 * So the uuid is derived from the record's own name. The same file always gets
 * the same id, on every machine and every build, and no table anywhere has to
 * remember the mapping. It is a version 3 uuid: MD5 of the name, with the
 * version and variant bits set as the format requires, which is what the format
 * is for. MD5 is a naming function here and not a security one; nothing is kept
 * secret by it and nothing is authenticated with it.
 */

/** The two kinds of name the ledger derives ids from. */
export type LedgerNamespace = 'check' | 'file';

/**
 * A uuid for a name within a namespace.
 *
 * The namespace is part of the hashed text, so a check whose slug happens to
 * read like a path cannot collide with a file of that name.
 */
export function ledgerUuid(namespace: LedgerNamespace, name: string): string {
  const digest = createHash('md5').update(`${namespace}:${name}`).digest();

  // Version 3, the version that says "this uuid is an MD5 of a name", and the
  // RFC 4122 variant. Both live in fixed bit positions: the top four bits of
  // byte 6 are the version, and the top two bits of byte 8 are the variant.
  // Writing them is what makes the value a uuid rather than sixteen bytes that
  // happen to fit in one.
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x30;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;

  const hex = digest.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * The name a run or an observation is identified by: the file it is written in,
 * as a path relative to the repository root.
 *
 * The file rather than the record's contents, so two runs that happen to read
 * the same are two runs. The recorder names a new file after a digest of what
 * it holds, which is what stops two jobs colliding, but that is the recorder's
 * rule about filenames and not this project's rule about identity.
 */
export function ledgerFileUuid(relativePath: string): string {
  return ledgerUuid('file', relativePath);
}

/** The uuid a check's slug maps to. */
export function ledgerCheckUuid(id: string): string {
  return ledgerUuid('check', id);
}
