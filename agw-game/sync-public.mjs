import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backupRoot = path.resolve(__dirname, '..'); // BACKUP_NEW_GAME
const publicDir = path.resolve(__dirname, 'public');

const files = [
  'ajedrez.html',
  'pudgy-crush.html',
  'game8.html',
  'arcade-bg.png',
  'fondo picado.png',
];

fs.mkdirSync(publicDir, { recursive: true });

for (const rel of files) {
  const src = path.resolve(backupRoot, rel);
  const dst = path.resolve(publicDir, rel);
  if (!fs.existsSync(src)) {
    console.warn('[sync-public] missing:', src);
    continue;
  }
  fs.copyFileSync(src, dst);
  console.log('[sync-public] copied:', rel);
}
