import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    exclude: [],
  },
  test: {
    environment: 'node',
    environmentMatch: {
      'src/**': 'jsdom'
    },
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
    // pool options for vitest 3+
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    testTimeout: 20000, // Increase timeout for database operations
    hookTimeout: 60000 // Allow longer async hooks (e.g., database downloads)
  }
});
