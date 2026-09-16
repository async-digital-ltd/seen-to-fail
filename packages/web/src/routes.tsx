import type { RouteObject } from 'react-router';

import { AddCheck } from './pages/add-check';
import { CheckDetail } from './pages/check-detail';
import { ChecksPage } from './pages/checks/checks-page';
import { LogRun } from './pages/log-run';
import { NotFound } from './pages/not-found';
import { RouteError } from './pages/route-error';
import { Shell } from './shell/shell';

/**
 * The screens, by the address each answers. Relative to the shell's root, so
 * `checks/:id` is `/checks/:id`. A static segment outranks a parameter, which
 * is why `checks/new` never reads as a check called "new".
 *
 * Every address here answers with the screen its story built. There is no
 * stand-in for one still to come, and the heading test below is not enough to
 * say a screen has landed, so each address is asked for something only its
 * own screen has.
 */
export const screens: RouteObject[] = [
  { index: true, element: <ChecksPage /> },
  { path: 'checks/new', element: <AddCheck /> },
  { path: 'checks/:id', element: <CheckDetail /> },
  { path: 'runs/new', element: <LogRun /> },
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
