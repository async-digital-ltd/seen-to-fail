import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

/**
 * The one place the entry is run. Everything else mounts the route table
 * through the render helper and never touches main.tsx, so without this a
 * root element renamed in index.html would leave a page that renders nothing
 * and a build that stays green.
 *
 * The body is index.html's own, read off disk, so the id the entry looks for
 * is the id the page really has. jsdom does not run the script tag, which is
 * what the import below does instead.
 */
it('mounts the app into the root element index.html provides', async () => {
  const page = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'),
    'utf8',
  );
  const body = /<body>([\s\S]*)<\/body>/.exec(page)?.[1];
  if (body === undefined) {
    throw new Error('index.html has no body.');
  }
  document.body.innerHTML = body;

  await import('./main');

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Checks' }),
  ).toBeInTheDocument();
});
