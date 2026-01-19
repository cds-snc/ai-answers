import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8'
    },
    setupFiles: ['./test/setup.js'],
    globalSetup: ['./test/setup.js'],
    // Improve test isolation: clear/restore mocks between tests
    clearMocks: true,
    restoreMocks: true,
    // Isolate each test file's module registry to avoid module-level mock leakage
    isolate: true,
    // Run tests in the same process to avoid cross-worker mongoose/model issues
    threads: false,
    testTimeout: 20000, // Increase timeout for database operations
    hookTimeout: 60000 // Allow longer async hooks (e.g., database downloads)
  }
});
