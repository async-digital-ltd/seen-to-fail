// @vitest-environment node

import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { createServer, defaultAllowedOrigins } from 'vite';
import type { ServerOptions } from 'vite';
import { expect, it } from 'vitest';

/**
 * What the development server tells a page on another local port: nothing.
 *
 * vite.config.ts sets `server.cors: false` since #187. Left unset, Vite
 * answers a preflight from any `localhost`, `127.0.0.1` or `[::1]` origin,
 * whatever its port, with that origin echoed back. So a page served by some
 * other program on the developer's machine could post JSON to `/graphql`, the
 * proxy would carry it to the API server, and the browser would hand the page
 * the answer: measured with headless Chrome, a check was written that way and
 * the page read its id. The client needs none of it, because every request it
 * makes is to its own origin.
 *
 * Vite here finds and loads vite.config.ts in this package the way
 * `pnpm dev:web` does, so what is tested is the server that file produces
 * rather than the value written in it. Only how it runs is changed, and
 * nothing about CORS or the proxy: it runs quietly, as middleware under a
 * server on a free port, with no file watcher, no HMR socket and no dependency
 * scan, so nothing collides with a development server that is already running.
 *
 * A preflight to `/graphql` is the request tested, because it is the one that
 * decides whether a browser sends a JSON POST at all. With the setting in
 * place Vite's CORS handling does not answer it. The proxy passes it on, and
 * it is refused by the API server, or answered 502 by the proxy when nothing
 * is listening there, as in CI. The status is left alone for that reason, and
 * what is checked is the absence of every access-control header, which is
 * what a browser reads.
 *
 * The second test is the control: the same server given Vite's own default
 * echoes each origin back, so the probe can see the header when it is there.
 * Removing `cors: false` from vite.config.ts makes the first test fail with
 * the headers Vite sent. It has been seen to do so.
 */

/** The web package, where Vite finds vite.config.ts. */
const webRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Other pages on the same machine, one per spelling of the loopback that
 * Vite's default lets in.
 */
const localOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
];

interface Answer {
  readonly origin: string;
  readonly accessControl: Record<string, string>;
}

/**
 * Starts the development server from vite.config.ts with the given server
 * options laid over it, sends a preflight to `/graphql` from each origin, and
 * returns the access-control headers each one was answered with.
 */
async function preflights(
  overrides: ServerOptions = {},
): Promise<readonly Answer[]> {
  const vite = await createServer({
    root: webRoot,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, ws: false, watch: null, ...overrides },
  });
  const http = createHttpServer(vite.middlewares);
  try {
    await new Promise<void>((resolve) => {
      http.listen(0, '127.0.0.1', resolve);
    });
    const { port } = http.address() as AddressInfo;

    const answers: Answer[] = [];
    for (const origin of localOrigins) {
      const response = await fetch(`http://127.0.0.1:${String(port)}/graphql`, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });
      await response.arrayBuffer();
      const accessControl = Object.fromEntries(
        [...response.headers].filter(([name]) =>
          name.startsWith('access-control-'),
        ),
      );
      answers.push({ origin, accessControl });
    }
    return answers;
  } finally {
    http.closeAllConnections();
    await new Promise<void>((resolve) => {
      http.close(() => {
        resolve();
      });
    });
    await vite.close();
  }
}

it('answers a preflight from another local port with no access-control header', async () => {
  const answers = await preflights();

  expect(answers).toStrictEqual(
    localOrigins.map((origin) => ({ origin, accessControl: {} })),
  );
});

it("echoes each local origin back when given Vite's own default, the control for the test above", async () => {
  const answers = await preflights({ cors: { origin: defaultAllowedOrigins } });

  expect(
    answers.map(({ origin, accessControl }) => ({
      origin,
      allowed: accessControl['access-control-allow-origin'],
    })),
  ).toStrictEqual(localOrigins.map((origin) => ({ origin, allowed: origin })));
});
