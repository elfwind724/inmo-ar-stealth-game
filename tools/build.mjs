import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await fs.mkdir(path.join(dist, 'assets'), { recursive: true });
await fs.mkdir(path.join(dist, 'vendor'), { recursive: true });
await build({ entryPoints:[path.join(root,'physics-bridge.js')],bundle:true,minify:true,
  format:'iife',platform:'browser',target:'es2020',legalComments:'inline',outfile:path.join(dist,'vendor/rapier.min.js') });
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
for (const file of ['game-rules.js', 'ui-polish.css', 'showroom-assets.js', 'police-chapter.js', 'police-chapter.css', 'highway-chase.js', 'highway-chase.css']) await fs.copyFile(path.join(root, file), path.join(dist, file));
await fs.cp(path.join(root,'assets/products'),path.join(dist,'assets/products'),{recursive:true});
await fs.copyFile(path.join(root, 'node_modules/three/build/three.min.js'), path.join(dist, 'vendor/three.min.js'));
await fs.copyFile(path.join(root, 'node_modules/three/LICENSE'), path.join(dist, 'vendor/THREE-LICENSE.txt'));
await fs.writeFile(path.join(dist,'vendor/RAPIER-NOTICE.txt'),'Rapier 3D JavaScript compatibility bindings 0.21.0\nCopyright Dimforge and contributors\nApache License 2.0: https://www.apache.org/licenses/LICENSE-2.0\nhttps://github.com/dimforge/rapier\n');
const release = path.join(root, 'release');
await fs.mkdir(release, { recursive: true });
const [uiCss, polishCss, rulesJs, threeJs, threeLicense, showroomJs, chapterJs, chapterCss, chaseJs, chaseCss, physicsJs] = await Promise.all([
  fs.readFile(path.join(dist, 'assets/ui.css'), 'utf8'),
  fs.readFile(path.join(dist, 'ui-polish.css'), 'utf8'),
  fs.readFile(path.join(dist, 'game-rules.js'), 'utf8'),
  fs.readFile(path.join(dist, 'vendor/three.min.js'), 'utf8'),
  fs.readFile(path.join(dist, 'vendor/THREE-LICENSE.txt'), 'utf8'),
  fs.readFile(path.join(dist, 'showroom-assets.js'), 'utf8'),
  fs.readFile(path.join(dist, 'police-chapter.js'), 'utf8'),
  fs.readFile(path.join(dist, 'police-chapter.css'), 'utf8'),
  fs.readFile(path.join(dist, 'highway-chase.js'), 'utf8'),
  fs.readFile(path.join(dist, 'highway-chase.css'), 'utf8'),
  fs.readFile(path.join(dist, 'vendor/rapier.min.js'), 'utf8')
]);
const inlineScript = text => '<script>\n' + text.replace(/<\/script/gi, '<\\/script') + '\n</script>';
let standalone = html
  .replace('<link rel="stylesheet" href="./assets/ui.css">', () => '<style>' + uiCss + '</style>')
  .replace('<link rel="stylesheet" href="./ui-polish.css">', () => '<style>' + polishCss + '</style>')
  .replace('<script src="./game-rules.js"></script>', () => inlineScript(rulesJs))
  .replace('<script src="./showroom-assets.js"></script>', () => inlineScript(showroomJs))
  .replace('<script src="./police-chapter.js"></script>', () => inlineScript(chapterJs))
  .replace('<link rel="stylesheet" href="./police-chapter.css">', () => '<style>' + chapterCss + '</style>')
  .replace('<script src="./highway-chase.js"></script>', () => inlineScript(chaseJs))
  .replace('<link rel="stylesheet" href="./highway-chase.css">', () => '<style>' + chaseCss + '</style>')
  .replace('<script src="./vendor/rapier.min.js" defer></script>', () => inlineScript(physicsJs))
  .replace('<script src="./vendor/three.min.js"></script>', () => '<!-- ' + threeLicense + ' -->\n' + inlineScript(threeJs));
for(const code of ['air1','air2','air3','go1','go2','go3']){
  const data=await fs.readFile(path.join(root,'assets/products',code+'.png'));
  standalone=standalone.replaceAll('./assets/products/'+code+'.png','data:image/png;base64,'+data.toString('base64'));
}
await fs.writeFile(path.join(release, 'inmo_3d_ar_optimized.html'), standalone);
console.log('Built dist/ and release/inmo_3d_ar_optimized.html — all runtime assets are local.');
