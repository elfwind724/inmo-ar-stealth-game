import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
await fs.mkdir(path.join(dist,'assets'),{recursive:true});await fs.mkdir(path.join(dist,'vendor'),{recursive:true});
execFileSync(process.execPath,[path.join(root,'node_modules/tailwindcss/lib/cli.js'),'-c',path.join(root,'tailwind.config.cjs'),'-i',path.join(root,'styles/tailwind.css'),'-o',path.join(dist,'assets/ui.css'),'--minify'],{cwd:root,stdio:'inherit'});
let html=await fs.readFile(path.join(root,'index.html'),'utf8');
html=html.replace('<script src="https://cdn.tailwindcss.com/3.4.17"></script>','<link rel="stylesheet" href="./assets/ui.css">').replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js','./vendor/three.min.js').replace(/^\s*<link[^>]+(?:fonts\.googleapis|fonts\.gstatic)[^>]*>\s*$/gm,'');
await fs.writeFile(path.join(dist,'index.html'),html);
const jsFiles=['game-rules.js','showroom-assets.js','launch-venue.js','launch-puzzle.js','launch-intro.js'];
const cssFiles=['ui-polish.css','launch-event.css'];
for(const file of [...jsFiles,...cssFiles])await fs.copyFile(path.join(root,file),path.join(dist,file));
await fs.copyFile(path.join(root,'node_modules/three/build/three.min.js'),path.join(dist,'vendor/three.min.js'));
await fs.copyFile(path.join(root,'node_modules/three/LICENSE'),path.join(dist,'vendor/THREE-LICENSE.txt'));
let standalone=html;
const inlineScript=code=>'<script>\n'+code.replace(/<\/script/gi,'<\\/script')+'\n</script>';
for(const file of [...cssFiles,'assets/ui.css']){
  const css=await fs.readFile(path.join(dist,file),'utf8');
  standalone=standalone.replace('<link rel="stylesheet" href="./'+file+'">',()=>'<style>'+css+'</style>');
}
for(const file of [...jsFiles,'vendor/three.min.js']){
  const code=await fs.readFile(path.join(dist,file),'utf8');
  standalone=standalone.replace('<script src="./'+file+'"></script>',()=>inlineScript(code));
}
const license=await fs.readFile(path.join(dist,'vendor/THREE-LICENSE.txt'),'utf8');
standalone='<!-- '+license+' -->\n'+standalone;
await fs.mkdir(path.join(root,'release'),{recursive:true});
for(const file of ['inmo_launch_event.html','inmo_3d_ar_optimized.html'])await fs.writeFile(path.join(root,'release',file),standalone);
console.log('Built launch-event dist/ and standalone release files with local Three.js, venue and key puzzle.');
