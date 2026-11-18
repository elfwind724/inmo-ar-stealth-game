import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileBrowserApp } from './build-browser-app.mjs';

const root = await fs.realpath(fileURLToPath(new URL('../', import.meta.url)));
const publish = path.resolve(root, 'dist-rehearsal');
if (path.dirname(publish) !== root || path.basename(publish) !== 'dist-rehearsal') {
  throw new Error('Unexpected rehearsal publish path');
}

const source = path.join(root, 'rehearsal');
const assets = path.join(publish, 'rehearsal');
await fs.rm(publish, { recursive: true, force: true });
await fs.mkdir(assets, { recursive: true });
for (const file of ['style.css', 'draw-motion.js', 'draw-motion.css', 'chapel.webp']) {
  await fs.copyFile(path.join(source, file), path.join(assets, file));
}
const script = await compileBrowserApp({ entry: path.join(source, 'app.js'), outdir: assets, publicPrefix: '/rehearsal' });
let html = (await fs.readFile(path.join(source, 'index.html'), 'utf8'))
  .replace('src="/rehearsal/app.js"', `src="${script}"`);
if (html.includes('src="/rehearsal/boot.js"')) {
  const boot = await compileBrowserApp({
    entry: path.join(source, 'boot.js'),
    outdir: assets,
    publicPrefix: '/rehearsal',
    target: ['es5'],
  });
  html = html.replace('src="/rehearsal/boot.js"', `src="${boot}"`);
}
await fs.writeFile(path.join(publish, 'index.html'), html);
await fs.writeFile(path.join(assets, 'index.html'), html);

console.log('Built the rehearsal app at / and /rehearsal/.');
