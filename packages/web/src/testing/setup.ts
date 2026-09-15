// Runs before every test file in this package (see vitest.config.ts).
//
// The matchers give `expect` the DOM assertions the component tests read
// with, such as toBeInTheDocument. The cleanup unmounts whatever a test
// rendered, which Testing Library only does by itself when the test runner
// exposes afterEach as a global, and this one does not.

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
