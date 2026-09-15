import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Component tests render into a DOM. The few tests that never touch one
    // pay a little start-up for it and nothing else.
    environment: 'jsdom',
    setupFiles: ['src/testing/setup.ts'],
  },
});
