import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const args = process.argv.slice(2);
let app = 'game'; // default
for (const a of args) {
  const m = a.match(/^--app=(.+)$/);
  if (m) app = m[1];
}

const appDir = resolve(root, 'apps', app);
const port = app === 'sim' ? '5174' : '5173';

const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';

console.log(`Starting ${app} app on port ${port}...`);

const child = spawn(npx, ['vite', '--port', port], {
  cwd: appDir,
  stdio: 'inherit',
  shell: isWin,
});

child.on('exit', (code) => process.exit(code ?? 0));
