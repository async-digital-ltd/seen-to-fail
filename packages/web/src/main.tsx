import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Provider } from 'urql';

import { createGraphQLClient } from './graphql/client';
import { routes } from './routes';
import './styles/tokens.css';
import './styles/base.css';

/**
 * The entry index.html loads. Everything the screens share is provided here:
 * the client they read through and the router that puts them on screen.
 *
 * Both are made once, outside the tree, which is what the router asks for. The
 * tests never run this file; they mount the same route table under a memory
 * router and a stubbed client through src/testing/render.tsx.
 */
const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error(
    'index.html has no element with the id "root" to render into.',
  );
}

const client = createGraphQLClient();
const router = createBrowserRouter(routes);

createRoot(rootElement).render(
  <StrictMode>
    <Provider value={client}>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>,
);
