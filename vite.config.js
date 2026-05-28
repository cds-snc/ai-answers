import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
      sourcemap: true
    });

    return {
      code: result.code,
      map: result.map
    };
  }
};

export default defineConfig({
  plugins: [jsAsJsx, react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 3000),
    proxy: {
      '/api': 'http://localhost:3001',
      '/config.js': 'http://localhost:3001'
    }
  },
  build: {
    outDir: 'build',
    emptyOutDir: true
  }
});
