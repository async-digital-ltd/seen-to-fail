import type { RouteObject } from 'react-router';

import { NotFound } from './pages/not-found';
import { Placeholder } from './pages/placeholder';
import { RouteError } from './pages/route-error';
import { Shell } from './shell/shell';

/**
 * The screens, by the address each answers. Relative to the shell's root, so
 * `checks/:id` is `/checks/:id`. A static segment outranks a parameter, which
 * is why `checks/new` never reads as a check called "new".
 *
 * Each one is a placeholder until its own story replaces it.
 */
export const screens: RouteObject[] = [
  { index: true, element: <Placeholder title="Checks" /> },
  { path: 'checks/new', element: <Placeholder title="Add a check" /> },
  { path: 'checks/:id', element: <Placeholder title="Check" /> },
  { path: 'runs/new', element: <Placeholder title="Log a test run" /> },
  { path: '*', element: <NotFound /> },
];

/**
 * Wraps screens in the shell and one error boundary. The boundary is a
 * pathless route between the two, so a screen that throws is replaced inside
 * the shell rather than taking the shell down with it.
 *
 * Takes the screens as a parameter only so a test can put a throwing one
 * through the same wrapper the real table uses.
 */
export function createRoutes(pages: RouteObject[] = screens): RouteObject[] {
  return [
    {
      path: '/',
      element: <Shell />,
      children: [{ errorElement: <RouteError />, children: pages }],
    },
  ];
}

/** The route table the app mounts. */
export const routes = createRoutes();
