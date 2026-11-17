import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { createRehearsalHandler } from '../netlify/rehearsal/api.mjs';

const url = new URL('http://localhost/rehearsal/');
const html = await readFile(new URL('../rehearsal/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../rehearsal/app.js', import.meta.url), 'utf8');

function openPage(t, hash, handler) {
  const dom = new JSDOM(html, { url: new URL(hash, url), runScripts: 'outside-only' });
  const { window } = dom;
  const requests = [];
  window.fetch = (path, options = {}) => {
    requests.push({ body: options.body ? JSON.parse(options.body) : null, headers: new Headers(options.headers) });
    return handler(new Request(new URL(path, url), options));
  };
  window.confirm = () => true;
  window.eval(app);
  t.after(() => window.close());
  const node = (id) => window.document.getElementById(id);
  return {
    window,
    requests,
    node,
    text: (id) => node(id).textContent,
    visible: (id) => !node(id).hidden,
    input: (id, value) => { node(id).value = value; },
    click: (id) => node(id).click(),
    submit: (id) => node(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })),
  };
}

async function until(check, message) {
  const deadline = Date.now() + 1500;
  do {
    if (check()) return;
    await delay(10);
  } while (Date.now() < deadline);
  assert.fail(message);
}

test('organizer and separate participant pages complete a rehearsal lottery without public codes', async (t) => {
  const key = randomBytes(24).toString('hex');
  let event = { phase: 'closed', teams: [] };
  const handler = createRehearsalHandler({
    getAdminKey: () => key,
    store: {
      async read() { return structuredClone(event); },
      async update(change) {
        const candidate = structuredClone(event);
        const result = await change(candidate);
        event = candidate;
        return result;
      },
    },
  });
  const organizer = openPage(t, '#organizer', handler);
  assert.ok(organizer.visible('organizer'));
  assert.equal(organizer.visible('participants'), false);
  const registrant = openPage(t, '', handler);
  await until(() => registrant.text('phase-label') === '尚未开始', 'The participant page loads without signing in');
  assert.ok(registrant.visible('team-form'));
  assert.equal(registrant.node('participants').querySelectorAll('input[type="password"]').length, 0);
  registrant.input('team-name', '尚未开放的小组');
  registrant.click('team-submit');
  await until(() => registrant.text('team-message').includes('抽号还没开始'), 'The page explains when drawing has not opened');
  assert.ok(registrant.requests.every(({ body }) => body === null));

  organizer.input('organizer-key', key);
  organizer.submit('auth-form');
  await until(() => organizer.visible('admin-controls'), 'Organizer can sign in');
  assert.equal(organizer.window.sessionStorage.length, 0);
  assert.equal(organizer.node('admin-roster-form').querySelectorAll('input[type="password"]').length, 0);
  organizer.input('roster-input', '测试演唱组');
  organizer.submit('admin-roster-form');
  await until(() => organizer.text('roster-summary') === '共 1 组', 'Opening registration imports the pre-entered team');

  registrant.click('refresh');
  await until(() => /报名|登记/.test(registrant.text('team-submit')), 'A separate browser can register directly');
  registrant.input('team-name', '  测试音响组  ');
  registrant.click('team-submit');
  await until(() => registrant.visible('team-message'), 'Participant registers a new team');
  assert.equal(registrant.node('team-name').value, '测试音响组');

  organizer.click('admin-refresh');
  await until(() => organizer.text('roster-summary') === '共 2 组', 'Organizer sees the cross-browser registration');
  organizer.click('admin-start');
  await until(() => organizer.visible('admin-finish'), 'Organizer locks and opens the draw');
  const participant = openPage(t, '', handler);
  await until(() => participant.node('phase-badge').dataset.phase === 'drawing', 'A fresh page can draw directly');
  assert.ok(participant.visible('team-form'));
  assert.equal(participant.text('team-submit'), '抽号');
  assert.equal(participant.node('participants').querySelectorAll('input[type="password"]').length, 0);
  assert.equal(participant.visible('results'), false);

  participant.input('team-name', '　 ');
  const count = participant.requests.length;
  participant.click('team-submit');
  assert.equal(participant.requests.length, count);
  assert.match(participant.text('team-error'), /还没输入小组名称/);
  assert.equal(participant.window.document.activeElement.id, 'team-name');
  assert.equal(participant.node('team-name').getAttribute('aria-invalid'), 'true');

  participant.input('team-name', '测试音响组');
  participant.click('team-submit');
  await until(() => participant.visible('my-result'), 'Participant receives their number');
  const slot = participant.text('my-number');
  assert.match(slot, /^[12]$/);
  assert.equal(participant.text('my-team'), '测试音响组');
  assert.equal(participant.node('results').children.length, 1);
  const draws = participant.requests.filter(({ body }) => body?.action === 'draw').length;
  participant.click('team-submit');
  await until(() => participant.requests.filter(({ body }) => body?.action === 'draw').length === draws + 1 && !participant.node('team-submit').disabled, 'A repeated draw returns the same result');
  assert.equal(participant.text('my-number'), slot);

  organizer.click('admin-finish');
  await until(() => organizer.visible('admin-export'), 'Finishing enables download');
  participant.click('refresh');
  await until(() => participant.node('results').children.length === 2, 'Both groups appear on the public page in draw order');
  assert.deepEqual(Array.from(participant.node('results').children, (item) => item.firstElementChild.textContent.replace(/\s|号/g, '')), ['1', '2']);
  assert.equal(participant.text('team-submit'), '查看号码');
  for (const { headers } of [...registrant.requests, ...participant.requests]) {
    assert.equal(headers.has('Authorization'), false);
    assert.equal(headers.has('X-Rehearsal-Code'), false);
  }
  organizer.click('admin-logout');
  assert.equal(organizer.node('roster').children.length, 0);
  assert.ok(organizer.visible('auth-form'));
});
