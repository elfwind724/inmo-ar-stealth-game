import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.resolve(root,'dist');
// Only this generated output directory is replaced, never project sources.
if(path.dirname(dist)!==root||path.basename(dist)!=='dist')throw new Error('Unsafe output path');
await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(path.join(dist,'assets'),{recursive:true});
await fs.mkdir(path.join(dist,'vendor'),{recursive:true});
let html=await fs.readFile(path.join(root,'index.html'),'utf8');
html=html.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js','./vendor/three.min.js');
const scripts=['showroom-assets.js','theater-show.js','theater-scene.js','theater-models.js','theater-performance.js','venue-music.js','theater-app.js'];
for(const file of [...scripts,'theater.css'])await fs.copyFile(path.join(root,file),path.join(dist,file));
for(const [from,to] of [['build/three.min.js','three.min.js'],['examples/js/loaders/GLTFLoader.js','GLTFLoader.js'],['examples/js/utils/SkeletonUtils.js','SkeletonUtils.js'],['LICENSE','THREE-LICENSE.txt']])await fs.copyFile(path.join(root,'node_modules/three',from),path.join(dist,'vendor',to));
const assets=['venue-bgm.mp3','booth-reference-wide.jpg','booth-reference-close.jpg'];
for(const file of assets)await fs.copyFile(path.join(root,'assets',file),path.join(dist,'assets',file));
const models=path.join(root,'assets/theater-models');
await fs.cp(models,path.join(dist,'assets/theater-models'),{recursive:true});
await fs.writeFile(path.join(dist,'index.html'),html);
let standalone=html;
const mime={'.jpg':'image/jpeg','.mp3':'audio/mpeg','.glb':'model/gltf-binary','.png':'image/png'};
const assetData={};
for(const file of assets){const data=await fs.readFile(path.join(root,'assets',file));assetData[file]='data:'+mime[path.extname(file)]+';base64,'+data.toString('base64');}
const modelData={};
async function embedModels(dir,prefix){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name),name=prefix+'/'+item.name;if(item.isDirectory())await embedModels(file,name);else if(mime[path.extname(file)])modelData[name]='data:'+mime[path.extname(file)]+';base64,'+(await fs.readFile(file)).toString('base64');}}
await embedModels(models,'./assets/theater-models');
const inline=code=>'<script>\n'+code.replace(/<\/script/gi,'<\\/script')+'\n</script>';
standalone=standalone.replace('<script src="./theater-models.js"></script>',()=>inline('window.THEATER_MODEL_DATA='+JSON.stringify(modelData)+';')+'<script src="./theater-models.js"></script>');
for(const file of [...scripts,'vendor/three.min.js','vendor/GLTFLoader.js','vendor/SkeletonUtils.js']){
  const code=await fs.readFile(path.join(dist,file),'utf8');
  standalone=standalone.replace('<script src="./'+file+'"></script>',()=>inline(code));
}
for(const [file,data] of Object.entries(assetData))standalone=standalone.replaceAll('./assets/'+file,data);
const css=await fs.readFile(path.join(dist,'theater.css'),'utf8');standalone=standalone.replace('<link rel="stylesheet" href="./theater.css">',()=>'<style>'+css+'</style>');
await fs.mkdir(path.join(root,'release'),{recursive:true});
for(const file of ['inmo_launch_event.html','inmo_3d_ar_optimized.html'])await fs.writeFile(path.join(root,'release',file),standalone);
console.log('Built first-person INMO comedy theater, local models, music and offline release.');
