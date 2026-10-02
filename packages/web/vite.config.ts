import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The development server serves the API at this address and port, as
      // serverHost and serverPort in the server package's graphql/server.ts.
      // They are spelled out here because this package must not import that
      // one. Proxying keeps the client on one origin, so the browser sends no
      // preflight and the client needs no host, which is what lets the server
      // send no CORS headers at all (#159).
      //
      // The address rather than `localhost`, because the server listens on the
      // IPv4 loopback alone. Where `localhost` resolves to `::1` first, a
      // `localhost` target works only while Node falls back to the next
      // address: measured on macOS with Node 25 and that fallback switched
      // off, the proxy answered 502 with ECONNREFUSED on ::1.
      '/graphql': 'http://127.0.0.1:4000',
    },
  },
});
