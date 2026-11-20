import fs from 'node:fs/promises';
import path from 'node:path';

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const size = bytes => (bytes / 1048576).toFixed(bytes >= 104857600 ? 0 : 1) + ' MiB';
const statuses = {tested:'真机体验', matched:'已装同包', installed:'已安装'};
const external = (url, label, cls) => '<a class="' + cls + '" href="' + esc(url) + '" rel="noreferrer">' + label + '</a>';

function renderCard([name,version,category,status,desc,pkg,url,kind,bytes,hash,note,release]) {
  const text = esc([name, category, pkg, desc].join(' ').toLowerCase());
  const main = url ? external(url, kind === 'apk' ? '下载 APK ↓' : '打开下载来源 ↗', 'button') : '<span class="unavailable">暂无公开下载</span>';
  const backup = release ? external(release, '发布页 ↗', 'secondary') : '';
  const meta = category + ' · ' + version + (bytes ? ' · ' + size(bytes) : '');
  const details = ['<li>包名：<code>' + esc(pkg) + '</code></li>'];
  if (hash) details.push('<li>' + (status === 'matched' ? '该发布包 SHA-256' : '报告所用 APK 的 SHA-256') + '：<code>' + esc(hash) + '</code></li>');
  if (note) details.push('<li>' + esc(note) + '</li>');
  return `<article class="card" data-app="${text}"${url ? ' data-ready' : ''}${status === 'tested' ? ' data-tested' : ''}>
<div class="card-header"><span class="glyph" aria-hidden="true">${esc(category)}</span><div><h3>${esc(name)}</h3><div class="meta">${esc(meta)}</div></div></div>
<span class="badge${status === 'installed' ? ' dim' : ''}">${statuses[status]}</span><p>${esc(desc)}</p><div class="links">${main}${backup}</div>
<details><summary>版本与说明</summary><ul>${details.join('')}</ul></details></article>`;
}

export async function renderDownloadDirectory(source, destination) {
  const [template,json] = await Promise.all(['index.html','apps.json'].map(file => fs.readFile(path.join(source,file),'utf8')));
  const apps = JSON.parse(json);
  if (apps.some(a => !statuses[a[3]] || [a[6],a[11]].some(link => link && new URL(link).protocol !== 'https:'))) throw new Error('Invalid download catalog');
  const feature = apps.find(a => a[5] === 'io.deepseekharness.mobile');
  const [name,version,,status,desc,,url,,bytes,,,release] = feature;
  const top = `<section class="feature" aria-labelledby="feature-title"><div><p class="eyebrow">${statuses[status]} · ${esc(size(bytes))}</p><h2 id="feature-title">${esc(name)} <small>v${esc(version)}</small></h2><p>${esc(desc)} 它与 DeepSeek 官方聊天 App 是两款应用。</p></div><div class="feature-actions">${external(url,'下载 APK ↓','button main')}${external(release,'GitHub 发布页 ↗','secondary')}</div></section>`;
  const count = '共 ' + apps.length + ' 款 · ' + apps.filter(a => a[6]).length + ' 款有下载入口';
  const cards = [...apps].sort((a,b) => Number(Boolean(b[6])) - Number(Boolean(a[6]))).map(renderCard).join('\n');
  await fs.writeFile(path.join(destination,'index.html'),template.replace('<!-- FEATURE -->',() => top).replace('<!-- COUNT -->',count).replace('<!-- CARDS -->',() => cards));
}
