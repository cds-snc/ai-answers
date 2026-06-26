import { defineConfig } from 'vitest/config';
import { transform } from 'esbuild';

const jsAsJsx = {
  name: 'js-as-jsx',
  enforce: 'pre',
  async transform(code, id) {
    const normalizedId = id.replace(/\\/g, '/');
    if (!normalizedId.includes('/src/') || !normalizedId.endsWith('.js')) {
      return null;
    }

    const result = await transform(code, {
      loader: 'jsx',
      jsx: 'automatic',
      sourcefile: id,
      sourcemap: true,
    });

    return {
      code: result.code,
      map: result.map,
    };
  },
};

export default defineConfig({
  plugins: [jsAsJsx],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.(js|jsx)$/,
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
    setupFiles: ['./test/vitest-hooks.js'],
    globalSetup: ['./test/setup.js'],
    // Improve test isolation: clear/restore mocks between tests
    clearMocks: true,
    restoreMocks: true,
    // Isolate each test file's module registry to avoid module-level mock leakage
    isolate: true,
    fileParallelism: false,
    // pool options for vitest 3+
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    testTimeout: 20000, // Increase timeout for database operations
    hookTimeout: 60000, // Allow longer async hooks (e.g., database downloads)
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      'tests/e2e/**'
    ],
    sequence: {
      shuffle: false,
      // seed: 12345, // Optionally set a fixed seed for reproducibility of test order when shuffling is enabled
    },
  }
});
