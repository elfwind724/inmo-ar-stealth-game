import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { before, after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { JSDOM } from 'jsdom';
import { compileBrowserApp } from '../tools/build-browser-app.mjs';
import { createRehearsalHandler } from '../netlify/rehearsal/api.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const url = 'https://yiage.vip/rehearsal/';
let output;
let app;
let boot;
let html;

before(async () => {
  output = await fs.mkdtemp(path.join(os.tmpdir(), 'yiage-browser-'));
  html = await fs.readFile(path.join(root, 'rehearsal/index.html'), 'utf8');
  for (const name of ['app', 'boot']) {
    const reference = await compileBrowserApp({
      entry: path.join(root, 'rehearsal', `${name}.js`),
      outdir: output,
      publicPrefix: '/rehearsal',
      target: name === 'boot' ? ['es5'] : ['chrome55', 'safari11'],
    });
    assert.match(reference, new RegExp(`^/rehearsal/${name}-[a-f0-9]{12}\\.js$`));
    const script = await fs.readFile(path.join(output, path.basename(reference)), 'utf8');
    assert.equal(await fs.readFile(path.join(output, `${name}.js`), 'utf8'), script);
    assert.doesNotThrow(() => new Script(script, { filename: path.basename(reference) }));
    assert.doesNotMatch(script, /\?\.|\?\?|^\s*(?:import|export)\b/m);
    if (name === 'boot') assert.doesNotMatch(script, /=>|\b(?:let|const|class|async)\b/);
    if (name === 'app') app = script;
    else boot = script;
  }
});

after(async () => {
  if (!output) return;
  if (path.dirname(output) !== path.resolve(os.tmpdir()) || !path.basename(output).startsWith('yiage-browser-')) {
    throw new Error('Unexpected temporary browser output path');
  }
  await fs.rm(output, { recursive: true, force: true });
});

async function until(check, message) {
  const deadline = Date.now() + 1500;
  do {
    if (check()) return;
    await delay(10);
  } while (Date.now() < deadline);
  assert.fail(message);
}

function olderBrowser(t) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = undefined;
  window.AbortController = undefined;
  window.matchMedia = undefined;
  window.Element.prototype.animate = undefined;
  window.Element.prototype.append = undefined;
  window.Element.prototype.after = undefined;
  window.Element.prototype.replaceChildren = undefined;
  window.NodeList.prototype[Symbol.iterator] = undefined;
  window.String.prototype.replaceAll = undefined;
  window.confirm = () => true;
  t.after(() => window.close());
  const node = (id) => window.document.getElementById(id);
  return { window, node, text: (id) => node(id).textContent };
}

test('classic rehearsal scripts show a reload message when a download or startup stalls', (t) => {
  const page = olderBrowser(t);
  const { window, node, text } = page;
  const timers = new Map();
  let nextTimer = 0;
  window.setTimeout = (callback, milliseconds) => {
    timers.set(++nextTimer, { callback, milliseconds });
    return nextTimer;
  };
  window.clearTimeout = (id) => timers.delete(id);
  assert.equal(node('load-help').hidden, false, 'The initial HTML contains a usable loading explanation.');
  assert.equal(node('load-help').querySelector('a').getAttribute('href'), '/rehearsal/?reload=1');
  assert.equal(window.document.querySelector('script[type="module"]'), null);
  window.eval(boot);
  node('app-script').dispatchEvent(new window.Event('error'));
  assert.equal(node('load-help').hidden, false);
  assert.match(text('load-message'), /重新加载/);
  const watchdog = Array.from(timers.values()).find(({ milliseconds }) => milliseconds === 10000);
  assert.ok(watchdog, 'A delayed boot is also detected when a script error event is unavailable.');
  watchdog.callback();
  window.RehearsalBoot.ready();
  assert.equal(node('load-help').hidden, true);
  assert.equal(timers.size, 0);
});

test('an older WebView can retry a slow connection and safely recover a draw whose response was lost', async (t) => {
  const page = olderBrowser(t);
  const { window, node, text } = page;
  const adminKey = randomBytes(24).toString('hex');
  let state = { phase: 'drawing', numberLimit: 14, teams: [] };
  const handler = createRehearsalHandler({
    getAdminKey: () => adminKey,
    store: {
      async read() { return structuredClone(state); },
      async update(change) {
        const next = structuredClone(state);
        const result = await change(next);
        state = next;
        return result;
      },
    },
  });
  const requests = [];
  let failInitialLoad = true;
  let loseFirstDrawResponse = true;
  window.XMLHttpRequest = class {
    headers = {};
    open(method, path) { this.method = method; this.path = path; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) {
      const data = body ? JSON.parse(body) : null;
      requests.push({ method: this.method, data, timeout: this.timeout });
      window.setTimeout(async () => {
        if (failInitialLoad && this.method === 'GET') {
          failInitialLoad = false;
          this.ontimeout();
          return;
        }
        const response = await handler(new Request(new URL(this.path, url), {
          method: this.method, headers: this.headers, body,
        }));
        this.status = response.status;
        this.responseText = await response.text();
        if (loseFirstDrawResponse && data?.action === 'draw') {
          loseFirstDrawResponse = false;
          this.ontimeout();
        } else {
          this.onload();
        }
      }, 0);
    }
  };
  window.eval(boot);
  window.eval(app);
  await until(() => node('phase-badge').dataset.phase === 'offline' && !node('refresh').disabled,
    'The initial network timeout should leave an enabled retry control.');
  assert.equal(node('load-help').hidden, true, 'App startup completed even though the first data request failed.');
  assert.match(text('refresh-notice'), /刷新重试/);
  node('refresh').click();
  await until(() => node('phase-badge').dataset.phase === 'drawing', 'The same page should recover after retry.');
  assert.match(text('action-detail'), /1[–-]14/);
  const initialRequests = requests.length;
  node('team-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(requests.length, initialRequests);
  assert.equal(window.document.activeElement.id, 'team-name');
  node('team-name').value = '旧手机测试小组';
  node('team-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => !node('team-error').hidden && !node('team-submit').disabled,
    'A lost draw response should show a retryable explanation and restore the submit button.');
  assert.equal(state.teams.length, 1, 'The server committed the draw before its response was lost.');
  const awarded = state.teams[0].number;
  assert.equal(node('draw-stage').hidden, true, 'No unconfirmed cosmetic number should be shown.');
  node('team-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => node('draw-stage').dataset.state === 'result' && !node('team-submit').disabled,
    'Retrying should show the previously assigned result.');
  assert.equal(text('draw-number'), String(awarded));
  assert.equal(text('draw-team'), '旧手机测试小组');
  assert.equal(state.teams.length, 1);
  assert.equal(node('results').children.length, 1);
  assert.ok(requests.every(({ timeout }) => timeout === 12000));
  assert.equal(requests.filter(({ data }) => data?.action === 'draw').length, 2);
});
