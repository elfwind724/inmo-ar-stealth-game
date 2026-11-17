import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await fs.realpath(fileURLToPath(new URL('../', import.meta.url)));
const publish = path.resolve(root, 'dist-rehearsal');
if (path.dirname(publish) !== root || path.basename(publish) !== 'dist-rehearsal') {
  throw new Error('Unexpected rehearsal publish path');
}

const source = path.join(root, 'rehearsal');
const assets = path.join(publish, 'rehearsal');
await fs.rm(publish, { recursive: true, force: true });
await fs.mkdir(assets, { recursive: true });
await fs.copyFile(path.join(source, 'index.html'), path.join(publish, 'index.html'));
for (const file of ['index.html', 'app.js', 'style.css', 'draw-motion.js', 'draw-motion.css', 'chapel.webp']) {
  await fs.copyFile(path.join(source, file), path.join(assets, file));
}

console.log('Built the rehearsal app at / and /rehearsal/.');
