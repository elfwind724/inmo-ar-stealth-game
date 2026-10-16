import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await fs.mkdir(path.join(dist, 'assets'), { recursive: true });
await fs.mkdir(path.join(dist, 'vendor'), { recursive: true });
execFileSync(process.execPath, [
  path.join(root, 'node_modules/tailwindcss/lib/cli.js'),
  '-c', path.join(root, 'tailwind.config.cjs'),
  '-i', path.join(root, 'styles/tailwind.css'),
  '-o', path.join(dist, 'assets/ui.css'), '--minify'
], { cwd: root, stdio: 'inherit' });
let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
html = html.replace('<script src="https://cdn.tailwindcss.com/3.4.17"></script>', '<link rel="stylesheet" href="./assets/ui.css">')
  .replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', './vendor/three.min.js')
  .replace(/^\s*<link[^>]+(?:fonts\.googleapis|fonts\.gstatic)[^>]*>\s*$/gm, '');
await fs.writeFile(path.join(dist, 'index.html'), html);
for (const file of ['game-rules.js', 'ui-polish.css']) await fs.copyFile(path.join(root, file), path.join(dist, file));
await fs.copyFile(path.join(root, 'node_modules/three/build/three.min.js'), path.join(dist, 'vendor/three.min.js'));
await fs.copyFile(path.join(root, 'node_modules/three/LICENSE'), path.join(dist, 'vendor/THREE-LICENSE.txt'));
const release = path.join(root, 'release');
await fs.mkdir(release, { recursive: true });
const [uiCss, polishCss, rulesJs, threeJs, threeLicense] = await Promise.all([
  fs.readFile(path.join(dist, 'assets/ui.css'), 'utf8'),
  fs.readFile(path.join(dist, 'ui-polish.css'), 'utf8'),
  fs.readFile(path.join(dist, 'game-rules.js'), 'utf8'),
  fs.readFile(path.join(dist, 'vendor/three.min.js'), 'utf8'),
  fs.readFile(path.join(dist, 'vendor/THREE-LICENSE.txt'), 'utf8')
]);
const inlineScript = text => '<script>\n' + text.replace(/<\/script/gi, '<\\/script') + '\n</script>';
const standalone = html
  .replace('<link rel="stylesheet" href="./assets/ui.css">', () => '<style>' + uiCss + '</style>')
  .replace('<link rel="stylesheet" href="./ui-polish.css">', () => '<style>' + polishCss + '</style>')
  .replace('<script src="./game-rules.js"></script>', () => inlineScript(rulesJs))
  .replace('<script src="./vendor/three.min.js"></script>', () => '<!-- ' + threeLicense + ' -->\n' + inlineScript(threeJs));
await fs.writeFile(path.join(release, 'inmo_3d_ar_optimized.html'), standalone);
console.log('Built dist/ and release/inmo_3d_ar_optimized.html — all runtime assets are local.');
