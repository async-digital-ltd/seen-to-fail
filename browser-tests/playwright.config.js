import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  use: { baseURL: 'http://127.0.0.1:4173', screenshot: 'off' },
  webServer: [
    {
      command: 'pnpm dev:server',
      cwd: '..',
      url: 'http://127.0.0.1:4000/health',
    },
    {
      command: 'pnpm dev:web --host 127.0.0.1 --port 4173 --strictPort',
      cwd: '..',
      url: 'http://127.0.0.1:4173',
    },
  ],
});
