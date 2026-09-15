import type { RenderResult } from '@testing-library/react';
import { render } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import type { RouteObject } from 'react-router';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Provider } from 'urql';

import { routes as appRoutes } from '../routes';
import type { Answer, Call } from './client';
import { createStubClient } from './client';

/**
 * Renders under the two things every screen needs: a router and a client.
 *
 * The router is a memory router, so a test names the address it opens at and
 * reads where a click went from `router.state.location`. The client is the
 * stub from ./client, fed the answers the test passes in.
 */

export interface RenderOptions {
  /** The address the page opens at. Defaults to the home page. */
  readonly route?: string;
  /**
   * What the stubbed client answers. An operation with no answer renders the
   * error notice, naming the operation.
   */
  readonly answers?: readonly Answer[];
}

export interface Rendered extends RenderResult {
  /** The memory router. Its `state.location` is the current address. */
  readonly router: ReturnType<typeof createMemoryRouter>;
  /** Every operation the screen has sent to the client, oldest first. */
  readonly calls: readonly Call[];
  /** A user-event session, for clicks and typing. */
  readonly user: UserEvent;
}

function renderRoutes(
  routes: RouteObject[],
  { route = '/', answers = [] }: RenderOptions,
): Rendered {
  const { client, calls } = createStubClient(answers);
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const user = userEvent.setup();
  const result = render(
    <Provider value={client}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { ...result, router, calls, user };
}

export interface RenderElementOptions extends RenderOptions {
  /**
   * The route pattern the element is mounted at, for one that reads route
   * params. Defaults to matching any address.
   */
  readonly path?: string;
}

/** Renders one element under the router and the stubbed client, no shell. */
export function renderWithProviders(
  ui: ReactElement,
  { path = '*', ...options }: RenderElementOptions = {},
): Rendered {
  return renderRoutes([{ path, element: ui }], options);
}

export interface RenderAppOptions extends RenderOptions {
  /** A route table other than the app's own, for testing the wrapper. */
  readonly routes?: RouteObject[];
}

/** Renders the app's route table at an address: the shell and the screen. */
export function renderApp({
  routes = appRoutes,
  ...options
}: RenderAppOptions = {}): Rendered {
  return renderRoutes(routes, options);
}
