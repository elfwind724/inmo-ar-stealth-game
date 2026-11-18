import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist-hub');
const origin = 'https://yiage.vip';
let projects;
let homepage;

before(async () => {
  execFileSync(process.execPath, ['tools/build-hub.mjs'], { cwd: root, stdio: 'pipe' });
  projects = JSON.parse(await fs.readFile(path.join(root, 'portal/projects.json'), 'utf8'));
  homepage = await fs.readFile(path.join(output, 'index.html'), 'utf8');
});

async function assertPublishedReference(reference, pagePath) {
  if (reference.startsWith('#') || reference.startsWith('data:') || reference.startsWith('blob:')) return;
  const url = new URL(reference, origin + pagePath);
  assert.equal(url.origin, origin, `Runtime asset must be local: ${reference}`);
  const relative = decodeURIComponent(url.pathname).replace(/^\//, '');
  let file = path.resolve(output, relative);
  assert.ok(file.startsWith(output + path.sep), `Asset escaped publish directory: ${reference}`);
  const info = await fs.stat(file);
  if (info.isDirectory()) file = path.join(file, 'index.html');
  assert.ok((await fs.stat(file)).isFile(), `Missing project asset: ${url.pathname}`);
}

test('every homepage project opens a complete independent local page without publishing server files', async () => {
  const page = new JSDOM(homepage, { url: origin });
  const cards = [...page.window.document.querySelectorAll('[data-project-id]')];
  assert.equal(cards.length, projects.length);
  assert.ok(projects.some(({ path: url }) => url === '/rehearsal/'));
  assert.ok(projects.some(({ path: url }) => url === '/inmo/'));
  assert.equal(page.window.document.querySelector('#scene'), null);

  for (const project of projects) {
    const card = cards.find((node) => node.dataset.projectId === project.id);
    assert.ok(card, `Missing project card: ${project.id}`);
    assert.equal(card.querySelector('a').getAttribute('href'), project.path);
    await assertPublishedReference(project.path, '/');
    await assertPublishedReference(project.image, '/');

    const html = await fs.readFile(path.join(output, project.path, 'index.html'), 'utf8');
    const document = new JSDOM(html, { url: origin + project.path }).window.document;
    assert.ok([...document.querySelectorAll('a')].some((link) => link.getAttribute('href') === '/'),
      `Project needs a route back home: ${project.id}`);
    for (const element of document.querySelectorAll('script[src], link[rel="stylesheet"][href], audio[src], img[src]')) {
      await assertPublishedReference(element.getAttribute('src') ?? element.getAttribute('href'), project.path);
    }
    assert.equal(document.querySelector('[onclick]'), null, 'Published pages must work with the script policy.');
  }

  const files = await fs.readdir(output, { recursive: true });
  assert.ok(files.every((file) => !/(^|[/\\])(?:netlify|node_modules|\.git|\.codex-tmp|inmo-ad|nimo-ad)([/\\]|$)/.test(file)));
  assert.ok(files.every((file) => !/(?:admin-verifier|admin-key|\.env)(?:[.\/\\]|$)/.test(file)));
  page.window.close();
});

test('project filters and search keep the project navigation usable', async () => {
  const page = new JSDOM(homepage, { url: origin, runScripts: 'outside-only' });
  const { window } = page;
  const { document } = window;
  window.eval(await fs.readFile(path.join(output, 'portal-assets/app.js'), 'utf8'));
  const visible = () => [...document.querySelectorAll('[data-project-id]')].filter((node) => !node.hidden);

  document.querySelector('[data-filter="game"]').click();
  assert.ok(visible().length > 0);
  assert.ok(visible().every((node) => node.dataset.category === 'game'));
  document.querySelector('[data-filter="all"]').click();
  const search = document.querySelector('#project-search');
  search.value = 'ＩＮＭＯ';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.deepEqual(visible().map((node) => node.dataset.projectId), ['inmo']);
  search.value = '不存在的项目名称';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(document.querySelector('#empty-state').hidden, false);
  document.querySelector('#reset-filters').click();
  assert.equal(visible().length, projects.length);
  assert.equal(document.querySelector('#empty-state').hidden, true);
  window.close();
});
