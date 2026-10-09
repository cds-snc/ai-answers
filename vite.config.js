import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { transform } from 'esbuild';
import fs from 'fs';
import path from 'path';
import {
  SYSTEM_CARD_CONTENT_DIR,
  SYSTEM_CARD_FILES,
  SYSTEM_CARD_DESCRIPTIONS,
} from './src/config/systemCard.js';
import { buildSystemCardMarkdown } from './src/utils/systemCardMarkdown.js';

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

// Serves the repo-root system card (and the images/PDFs it links to) as the
// SystemCardPage's content, so the card keeps a single source of truth and
// the page never depends on GitHub. See src/config/systemCard.js.
const systemCard = () => {
  // A missing linked file is only warned about - the page shows it as
  // unavailable - so a card typo never stops the app from building.
  // systemCardMarkdown.test.js is what fails on it.
  const buildFiles = (warn) => {
    const files = new Map();
    for (const [lang, { source, file }] of Object.entries(SYSTEM_CARD_FILES)) {
      const { markdown, assets, missingAssets } = buildSystemCardMarkdown(
        fs.readFileSync(path.resolve(source), 'utf8'),
        {
          lang,
          description: SYSTEM_CARD_DESCRIPTIONS[lang],
          assetExists: (repoPath) => fs.existsSync(path.resolve(repoPath)),
        }
      );
      files.set(file, markdown);
      for (const asset of assets) {
        files.set(asset, fs.readFileSync(path.resolve(asset)));
      }
      for (const missing of missingAssets) {
        warn(`${source} links ${missing}, which doesn't exist - shown as unavailable`);
      }
    }
    return files;
  };

  const CONTENT_TYPES = {
    '.md': 'text/markdown; charset=utf-8',
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };

  return {
    name: 'system-card',
    configureServer(server) {
      // Built once, then kept until a card file or anything under docs/ (where
      // its images/PDFs live) changes, so `npm start` picks up edits without a
      // restart but doesn't redo every file on every request.
      let files = null;
      const sources = Object.values(SYSTEM_CARD_FILES).map(({ source }) => path.resolve(source));
      const docsDir = path.resolve('docs') + path.sep;
      const invalidate = (changed) => {
        if (sources.includes(changed) || changed.startsWith(docsDir)) files = null;
      };
      server.watcher.add(sources);
      server.watcher.on('change', invalidate);
      server.watcher.on('add', invalidate);
      server.watcher.on('unlink', invalidate);

      server.middlewares.use(`${SYSTEM_CARD_CONTENT_DIR}/`, (req, res, next) => {
        const name = decodeURIComponent(req.url.split('?')[0].replace(/^\//, ''));
        files ??= buildFiles((msg) => server.config.logger.warn(msg));
        const contents = files.get(name);
        if (contents === undefined) return next();
        res.setHeader('Content-Type', CONTENT_TYPES[path.extname(name).toLowerCase()]);
        res.end(contents);
      });
    },
    generateBundle() {
      for (const [name, contents] of buildFiles((msg) => this.warn(msg))) {
        this.emitFile({
          type: 'asset',
          fileName: `${SYSTEM_CARD_CONTENT_DIR.replace(/^\//, '')}/${name}`,
          source: contents,
        });
      }
    },
  };
};

export default defineConfig({
  plugins: [jsAsJsx, react(), systemCard()],
  optimizeDeps: {
    // Vite 8's Rolldown dependency scanner parses .js files before the
    // jsAsJsx transform runs. Keep JSX-enabled .js entry points compatible.
    rolldownOptions: {
      transform: {
        jsx: {
          runtime: 'automatic'
        }
      }
    }
  },
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
