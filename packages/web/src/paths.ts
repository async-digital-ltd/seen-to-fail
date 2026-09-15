/**
 * Where each screen lives, built in one place so that a link and the route it
 * points at cannot spell an address differently. routes.tsx declares the
 * patterns; routes.test.tsx opens each address built here and checks the
 * right screen answers.
 */

/** The query parameter the run form reads to pre-select a check. */
export const checkParameter = 'check';

export const paths = {
  /** The list, which is the home page. */
  checks: (): string => '/',
  newCheck: (): string => '/checks/new',
  check: (id: string): string => `/checks/${encodeURIComponent(id)}`,
  /** The run form, pre-selecting a check when one is given. */
  newRun: (options: { readonly check?: string } = {}): string => {
    if (options.check === undefined) {
      return '/runs/new';
    }
    const query = new URLSearchParams({ [checkParameter]: options.check });
    return `/runs/new?${query.toString()}`;
  },
};
