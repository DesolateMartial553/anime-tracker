// Copies the website from the repo root into www/ so the app ships the exact same files.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(app, '..');
const www = join(app, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(www);
for (const f of ['index.html', 'css', 'js', 'fonts', 'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.json']) {
  cpSync(join(root, f), join(www, f), { recursive: true });
}
console.log('copied site into', www);
