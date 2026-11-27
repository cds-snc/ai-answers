#!/usr/bin/env node
// Writes src/config/gcHosts.json: the Government of Canada host lists the chat
// page uses to hide non-GC referring URLs from signed-out visitors (AIA-006).
// The lists come from api/util/govHost.js, so the page and the server apply one
// rule. Run after changing a department URL or a list in govHost.js:
//
//   node scripts/generate-gc-hosts.js
//
// src/utils/__tests__/gcHostParity.test.js fails while the file is stale.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildGcHostConfig } from '../api/util/govHost.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GC_HOSTS_PATH = path.join(__dirname, '..', 'src', 'config', 'gcHosts.json');

export function renderGcHostsJson() {
  return `${JSON.stringify(buildGcHostConfig(), null, 2)}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(GC_HOSTS_PATH, renderGcHostsJson());
  console.log(`Wrote ${path.relative(process.cwd(), GC_HOSTS_PATH)}`);
}
