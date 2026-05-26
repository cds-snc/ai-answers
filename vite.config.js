import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

const jsAsJsx = {
  name: 'js-as-jsx',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('/src/') || !id.endsWith('.js')) {
      return null;
    }

    return transformWithEsbuild(code, id, {
      loader: 'jsx',
      jsx: 'automatic'
    });
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
