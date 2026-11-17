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
  window.fetch = (path, options) => {
    requests.push(options.body ? JSON.parse(options.body) : null);
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

test('organizer and separate participant pages complete a protected rehearsal lottery', async (t) => {
  const accessCode = randomBytes(8).toString('hex');
  const key = randomBytes(24).toString('hex');
  let event = { phase: 'closed', teams: [], accessDigest: null };
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
  const participant = openPage(t, '', handler);
  await until(() => participant.text('phase-label') === '等待开放', 'Closed state is shown');

  organizer.input('organizer-key', key);
  organizer.submit('auth-form');
  await until(() => organizer.visible('admin-controls'), 'Organizer can sign in');
  assert.equal(organizer.window.sessionStorage.length, 0);
  organizer.input('roster-input', '测试演唱组');
  organizer.input('admin-code', accessCode);
  organizer.submit('admin-roster-form');
  await until(() => organizer.text('roster-summary') === '共 1 组', 'Opening registration imports the pre-entered team');

  participant.click('refresh');
  await until(() => participant.visible('access-form'), 'A separate browser must provide the access code');
  participant.input('access-code', 'wrong-code');
  participant.submit('access-form');
  await until(() => participant.visible('team-error'), 'Wrong access code triggers feedback');
  participant.input('access-code', accessCode);
  participant.submit('access-form');
  await until(() => participant.visible('team-form'), 'Valid access code permits registration');
  participant.input('team-name', '  测试音响组  ');
  participant.submit('team-form');
  await until(() => participant.visible('team-message'), 'Participant registers a new team');
  assert.equal(participant.node('team-name').value, '测试音响组');

  organizer.click('admin-refresh');
  await until(() => organizer.text('roster-summary') === '共 2 组', 'Organizer sees the cross-browser registration');
  organizer.click('admin-start');
  await until(() => organizer.visible('admin-finish'), 'Organizer locks and opens the draw');
  participant.click('refresh');
  await until(() => participant.text('team-submit') === '抽号', 'Participant sees the draw button');
  assert.equal(participant.visible('results'), false);

  participant.input('team-name', '　 ');
  const count = participant.requests.length;
  participant.submit('team-form');
  assert.equal(participant.requests.length, count);
  assert.match(participant.text('team-error'), /还没输入小组名称.*抽号/);
  assert.equal(participant.window.document.activeElement.id, 'team-name');
  assert.equal(participant.node('team-name').getAttribute('aria-invalid'), 'true');

  participant.input('team-name', '测试音响组');
  participant.submit('team-form');
  await until(() => participant.visible('my-result'), 'Participant receives their number');
  const slot = participant.text('my-number');
  assert.match(slot, /^[12]$/);
  assert.equal(participant.text('my-team'), '测试音响组');
  assert.equal(participant.node('results').children.length, 1);
  participant.submit('team-form');
  await until(() => participant.visible('my-result'), 'A repeated draw returns the same result');
  assert.equal(participant.text('my-number'), slot);

  organizer.click('admin-finish');
  await until(() => organizer.visible('admin-export'), 'Finishing enables download');
  participant.click('refresh');
  await until(() => participant.node('results').children.length === 2, 'Both groups appear on the public page in draw order');
  assert.deepEqual(Array.from(participant.node('results').children, (item) => item.firstElementChild.textContent), ['1 号', '2 号']);
  assert.equal(participant.text('phase-label'), '抽号结束');
  organizer.click('admin-logout');
  assert.equal(organizer.node('roster').children.length, 0);
  assert.ok(organizer.visible('auth-form'));
});
