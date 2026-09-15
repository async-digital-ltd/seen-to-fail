import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The development server serves the API on this port, as serverPort in
      // the server package's graphql/server.ts. It is a number here because
      // this package must not import that one. Proxying keeps the client on
      // one origin, so the browser sends no preflight and the client needs
      // no host.
      '/graphql': 'http://localhost:4000',
    },
  },
});
