import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [
  join(root, 'frontend/node_modules/eslint/bin/eslint.js'),
  '-c', join(root, 'eslint.config.mjs'),
  'frontend/src', 'shared', 'backend/services', 'backend/server.js',
], { cwd: root, stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;
