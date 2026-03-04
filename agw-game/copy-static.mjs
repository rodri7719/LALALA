import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, '..'); // BACKUP_NEW_GAME
const outDir = path.resolve(__dirname, 'dist');

const files = [
  'ajedrez.html',
  'pudgy-crush.html',
  'game8.html',
  'arcade-bg.png',
  'fondo picado.png',
];

if (!fs.existsSync(outDir)) {
  console.error('[copy-static] dist/ not found:', outDir);
  process.exit(1);
}

for (const rel of files) {
  const src = path.resolve(root, rel);
  const dst = path.resolve(outDir, rel);
  if (!fs.existsSync(src)) {
    console.warn('[copy-static] missing:', src);
    continue;
  }
  fs.copyFileSync(src, dst);
  console.log('[copy-static] copied:', rel);
}
