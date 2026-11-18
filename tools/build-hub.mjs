import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderProjects } from '../portal/render-projects.mjs';
import { compileBrowserApp } from './build-browser-app.mjs';

const root = await fs.realpath(fileURLToPath(new URL('../', import.meta.url)));
const publish = path.resolve(root, 'dist-hub');
if (path.dirname(publish) !== root || path.basename(publish) !== 'dist-hub') {
  throw new Error('Unexpected project hub publish path');
}

const portal = path.join(root, 'portal');
const projects = JSON.parse(await fs.readFile(path.join(portal, 'projects.json'), 'utf8'));
if (!Array.isArray(projects) || projects.length === 0) throw new Error('The project list must contain a project');

const ids = new Set();
const routes = new Set();
for (const project of projects) {
  if (!/^[a-z][a-z0-9-]*$/.test(project.id) || ids.has(project.id)) {
    throw new Error('Each project needs a unique lowercase id');
  }
  if (project.path !== `/${project.id}/` || routes.has(project.path)) {
    throw new Error(`Unexpected project path for ${project.id}`);
  }
  if (!/^\/portal-assets\/[a-z0-9-]+\.(webp|png|jpg)$/.test(project.image)) {
    throw new Error(`Unexpected project cover for ${project.id}`);
  }
  await fs.access(path.join(portal, 'assets', path.posix.basename(project.image)));
  ids.add(project.id);
  routes.add(project.path);
}

await fs.rm(publish, { recursive: true, force: true });
await fs.mkdir(path.join(publish, 'portal-assets'), { recursive: true });

const portalTemplate = await fs.readFile(path.join(portal, 'index.html'), 'utf8');
if (!portalTemplate.includes('<!-- PROJECT_CARDS -->')) throw new Error('Project card marker is missing');
const portalScript = await compileBrowserApp({
  entry: path.join(portal, 'app.js'),
  outdir: path.join(publish, 'portal-assets'),
  publicPrefix: '/portal-assets',
});
const portalHtml = portalTemplate.replace('<!-- PROJECT_CARDS -->', renderProjects(projects))
  .replace('src="/portal-assets/app.js"', `src="${portalScript}"`);
await fs.writeFile(path.join(publish, 'index.html'), portalHtml);
for (const file of ['style.css', 'projects.json']) {
  await fs.copyFile(path.join(portal, file), path.join(publish, 'portal-assets', file));
}
await fs.cp(path.join(portal, 'assets'), path.join(publish, 'portal-assets'), { recursive: true });

const navigationStyles = `
.hub-home-link { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; color: inherit; text-underline-offset: 4px; }
.hub-game-home { pointer-events: auto; padding: 8px 11px; border: 1px solid #ffffff42; border-radius: 8px; background: #17191ee6; color: #f4f0e8; font: 12px "Microsoft YaHei", sans-serif; text-decoration: none; white-space: nowrap; }
.hub-game-home:focus-visible { outline: 2px solid #f4cc78; outline-offset: 3px; }
.site-footer { gap: 12px; flex-wrap: wrap; }
@media(max-width:600px) { .hub-game-home { padding: 7px; font-size: 10px; min-height: 35px; } .topbar .brand-caption { display:none; } .topbar .top-actions { gap: 4px; } .topbar .top-actions button { padding-inline: 7px; } }
`;
await fs.writeFile(path.join(publish, 'portal-assets', 'project-navigation.css'), navigationStyles);
await fs.writeFile(path.join(publish, 'portal-assets', 'project-navigation.js'),
  "document.querySelector('#boot-error button')?.addEventListener('click', () => location.reload());\n");

function includeNavigation(html) {
  return html.replace('</head>', '<link rel="stylesheet" href="/portal-assets/project-navigation.css"></head>');
}

async function buildRehearsal(destination) {
  const source = path.join(root, 'rehearsal');
  await fs.mkdir(destination, { recursive: true });
  for (const file of ['style.css', 'draw-motion.js', 'draw-motion.css', 'chapel.webp']) {
    await fs.copyFile(path.join(source, file), path.join(destination, file));
  }
  const sourceHtml = await fs.readFile(path.join(source, 'index.html'), 'utf8');
  const script = await compileBrowserApp({ entry: path.join(source, 'app.js'), outdir: destination, publicPrefix: '/rehearsal' });
  let html = includeNavigation(sourceHtml).replace('<footer class="site-footer">',
    '<footer class="site-footer"><a class="hub-home-link" href="/">← 项目首页</a>');
  html = html.replace('src="/rehearsal/app.js"', `src="${script}"`);
  if (html.includes('src="/rehearsal/boot.js"')) {
    const boot = await compileBrowserApp({
      entry: path.join(source, 'boot.js'),
      outdir: destination,
      publicPrefix: '/rehearsal',
      target: ['es5'],
    });
    html = html.replace('src="/rehearsal/boot.js"', `src="${boot}"`);
  }
  await fs.writeFile(path.join(destination, 'index.html'), html);
}

async function buildInmo(destination) {
  await fs.mkdir(path.join(destination, 'assets'), { recursive: true });
  await fs.mkdir(path.join(destination, 'vendor'), { recursive: true });
  const scripts = [
    'showroom-assets.js', 'theater-show.js', 'theater-scene.js', 'theater-models.js',
    'theater-performance.js', 'venue-music.js', 'theater-app.js',
  ];
  for (const file of [...scripts, 'theater.css']) {
    await fs.copyFile(path.join(root, file), path.join(destination, file));
  }
  const vendor = [
    ['build/three.min.js', 'three.min.js'],
    ['examples/js/loaders/GLTFLoader.js', 'GLTFLoader.js'],
    ['examples/js/utils/SkeletonUtils.js', 'SkeletonUtils.js'],
    ['LICENSE', 'THREE-LICENSE.txt'],
  ];
  for (const [source, filename] of vendor) {
    await fs.copyFile(path.join(root, 'node_modules/three', source), path.join(destination, 'vendor', filename));
  }
  for (const filename of ['venue-bgm.mp3', 'booth-reference-wide.jpg', 'booth-reference-close.jpg']) {
    await fs.copyFile(path.join(root, 'assets', filename), path.join(destination, 'assets', filename));
  }
  for (const folder of ['theater-models', 'products']) {
    await fs.cp(path.join(root, 'assets', folder), path.join(destination, 'assets', folder), { recursive: true });
  }
  let html = includeNavigation(await fs.readFile(path.join(root, 'index.html'), 'utf8'));
  html = html.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', './vendor/three.min.js');
  html = html.replace('<div class="top-actions">',
    '<div class="top-actions"><a class="hub-home-link hub-game-home" href="/" aria-label="返回项目首页">← 首页</a>');
  html = html.replace(' onclick="location.reload()"', '');
  html = html.replace('</body>', '<script src="/portal-assets/project-navigation.js"></script></body>');
  await fs.writeFile(path.join(destination, 'index.html'), html);
}

async function buildStaticProject(project, destination) {
  const expectedSource = `projects/${project.id}`;
  if (project.source !== expectedSource && project.source !== `${expectedSource}/`) {
    throw new Error(`Project ${project.id} needs source ${expectedSource}/`);
  }
  const source = await fs.realpath(path.join(root, expectedSource));
  const projectRoot = path.join(root, 'projects') + path.sep;
  if (!source.startsWith(projectRoot)) throw new Error('Project source is outside the projects folder');
  await fs.access(path.join(source, 'index.html'));
  await fs.cp(source, destination, {
    recursive: true,
    filter: async (file) => {
      if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('Project files must stay inside their source folder');
      return true;
    },
  });
}

for (const project of projects) {
  const destination = path.join(publish, project.id);
  if (project.id === 'rehearsal') await buildRehearsal(destination);
  else if (project.id === 'inmo') await buildInmo(destination);
  else await buildStaticProject(project, destination);
}

console.log(`Built the Yiage project hub and ${projects.length} independent project pages.`);
