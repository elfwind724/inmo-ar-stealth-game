import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createRehearsalHandler } from '../netlify/rehearsal/api.mjs';

const url = new URL('http://localhost/rehearsal/');
const html = await readFile(new URL('../rehearsal/index.html', import.meta.url), 'utf8');
const { outputFiles: [appBundle] } = await build({
  entryPoints: [fileURLToPath(new URL('../rehearsal/app.js', import.meta.url))],
  bundle: true,
  write: false,
  format: 'iife',
});

function openPage(t, hash, handler, { reducedMotion = true } = {}) {
  const dom = new JSDOM(html, { url: new URL(hash, url), runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const requests = [];
  window.XMLHttpRequest = class {
    headers = {};
    open(method, path) { this.method = method; this.path = path; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) {
      requests.push({ body: body ? JSON.parse(body) : null, headers: new Headers(this.headers) });
      handler(new Request(new URL(this.path, url), {
        method: this.method, headers: this.headers, body,
      })).then(async (response) => {
        this.status = response.status;
        this.responseText = await response.text();
        this.onload();
      }, () => this.onerror());
    }
  };
  window.confirm = () => true;
  window.matchMedia = (query) => ({ matches: reducedMotion && query === '(prefers-reduced-motion: reduce)' });
  window.eval(appBundle.text);
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

function createTestEvent(phase) {
  const key = randomBytes(24).toString('hex');
  let event = { phase, numberLimit: 13, teams: [] };
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
  return { handler, key, get event() { return event; } };
}

test('a participant draws with just a name and an organizer can return a number from the public list', async (t) => {
  const fixture = createTestEvent('closed');
  const { handler, key } = fixture;
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
  await until(() => organizer.text('roster').includes('测试演唱组'), 'Opening registration imports the pre-entered team');

  registrant.click('refresh');
  await until(() => /报名|登记/.test(registrant.text('team-submit')), 'A separate browser can register directly');
  registrant.input('team-name', '  测试音响组  ');
  registrant.click('team-submit');
  await until(() => registrant.visible('team-message'), 'Participant registers a new team');
  assert.equal(registrant.node('team-name').value, '测试音响组');

  organizer.click('admin-refresh');
  await until(() => organizer.text('roster').includes('测试音响组'), 'Organizer sees the cross-browser registration');
  organizer.click('admin-start');
  await until(() => fixture.event.phase === 'drawing' && !organizer.node('admin-refresh').disabled, 'Organizer opens the draw');
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

  assert.equal(participant.visible('draw-stage'), false);
  participant.input('team-name', '未登记的测试小组');
  participant.click('team-submit');
  await until(() => participant.visible('draw-stage') && !participant.node('team-submit').disabled, 'A first-time team receives their number');
  const slot = participant.text('draw-number');
  assert.match(slot, /^(?:[1-9]|1[0-3])$/);
  assert.ok(participant.text('draw-team').includes('未登记的测试小组'));
  assert.equal(participant.node('results').children.length, 1);
  const draws = participant.requests.filter(({ body }) => body?.action === 'draw').length;
  participant.click('team-submit');
  await until(() => participant.requests.filter(({ body }) => body?.action === 'draw').length === draws + 1 && !participant.node('team-submit').disabled, 'A repeated draw returns the same result');
  assert.equal(participant.text('draw-number'), slot);

  organizer.click('admin-refresh');
  await until(() => organizer.text('roster').includes('未登记的测试小组'), 'Organizer sees the award');
  const mistakeRow = Array.from(organizer.node('roster').children).find((row) => row.textContent.includes('未登记的测试小组'));
  const remove = mistakeRow.querySelector('button');
  assert.ok(remove, 'Organizer can delete a team that already drew');
  remove.click();
  await until(() => !organizer.text('roster').includes('未登记的测试小组'), 'Organizer can remove the incorrect name');
  const removeRequest = organizer.requests.find(({ body }) => body?.action === 'remove' && body.name === '未登记的测试小组');
  assert.equal(removeRequest.body.expectedNumber, Number(slot));
  participant.click('refresh');
  await until(() => participant.node('results').children.length === 0, 'The public list removes the mistake');
  assert.equal(participant.visible('draw-stage'), false, 'The obsolete award is no longer displayed as personal result');
  participant.input('team-name', '更正小组');
  participant.click('team-submit');
  await until(() => participant.visible('draw-stage') && !participant.node('team-submit').disabled, 'The corrected name can draw');
  assert.ok(participant.text('draw-team').includes('更正小组'));
  assert.ok(participant.text('results').includes('更正小组'));

  organizer.click('admin-refresh');
  await until(() => organizer.text('roster').includes('更正小组') && !organizer.node('admin-refresh').disabled,
    'Organizer can review every group before clearing');
  assert.ok(organizer.visible('admin-clear'));
  organizer.window.confirm = () => false;
  const beforeCancel = organizer.requests.length;
  organizer.click('admin-clear');
  assert.equal(organizer.requests.length, beforeCancel, 'Canceling bulk clear keeps every record');
  const clearSnapshot = fixture.event.teams.map(({ name, number, revealed }) => ({ name, number: revealed ? number : null }));
  organizer.window.confirm = () => true;
  organizer.click('admin-clear');
  await until(() => fixture.event.teams.length === 0 && !organizer.node('admin-refresh').disabled,
    'Organizer can clear all records in one action');
  const clearRequest = organizer.requests.findLast(({ body }) => body?.action === 'clear');
  assert.ok(clearRequest, 'The organizer uses the protected clear action');
  assert.deepEqual([...clearRequest.body.expectedTeams].sort((a, b) => a.name.localeCompare(b.name)),
    clearSnapshot.sort((a, b) => a.name.localeCompare(b.name)));
  assert.equal(fixture.event.phase, 'drawing');
  assert.equal(organizer.node('roster').children.length, 0);
  assert.equal(organizer.visible('admin-clear'), false);

  participant.click('refresh');
  await until(() => participant.node('results').children.length === 0 && !participant.visible('draw-stage'),
    'A public refresh clears the withdrawn personal award after bulk clear');
  participant.input('team-name', '重新开始小组');
  participant.click('team-submit');
  await until(() => participant.visible('draw-stage') && !participant.node('team-submit').disabled,
    'The full number pool can be drawn again after bulk clear');
  assert.match(participant.text('draw-number'), /^(?:[1-9]|1[0-3])$/);
  for (const { headers } of [...registrant.requests, ...participant.requests]) {
    assert.equal(headers.has('Authorization'), false);
    assert.equal(headers.has('X-Rehearsal-Code'), false);
  }
  organizer.click('admin-logout');
  assert.equal(organizer.node('roster').children.length, 0);
  assert.ok(organizer.visible('auth-form'));
});

test('the animated draw hides reel numbers from assistive technology and settles on the server assignment', async (t) => {
  const fixture = createTestEvent('drawing');
  const participant = openPage(t, '', fixture.handler, { reducedMotion: false });
  await until(() => participant.node('phase-badge').dataset.phase === 'drawing', 'The animation begins only on a ready draw');
  participant.input('team-name', '动效测试小组');
  participant.click('team-submit');
  const stage = participant.node('draw-stage');
  assert.equal(stage.dataset.state, 'spinning');
  assert.equal(participant.node('draw-number').closest('[aria-hidden]').getAttribute('aria-hidden'), 'true');
  await until(() => stage.dataset.state === 'settling', 'The number reel slows before revealing the award');
  assert.equal(stage.nextElementSibling.textContent, '');
  assert.equal(participant.node('results').children.length, 0);

  await until(() => stage.dataset.state === 'result' && !participant.node('team-submit').disabled, 'The reel reaches the final number');
  const award = fixture.event.teams[0];
  assert.equal(participant.text('draw-number'), String(award.number));
  assert.ok(stage.nextElementSibling.textContent.includes(`第 ${award.number} 号`));
  assert.equal(participant.node('results').children.length, 1);
});

test('the organizer adds a number after a full draw and every participant page shows the updated range', async (t) => {
  const fixture = createTestEvent('drawing');
  for (let index = 0; index < 13; index += 1) {
    const response = await fixture.handler(new Request(new URL('api', url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'draw', name: `已参加 ${index + 1}` }),
    }));
    assert.equal(response.status, 200);
  }
  const originalAwards = structuredClone(fixture.event.teams);
  const participant = openPage(t, '', fixture.handler);
  await until(() => participant.node('phase-badge').dataset.phase === 'finished', 'The initial 13-number draw has completed');
  const organizer = openPage(t, '#organizer', fixture.handler);
  organizer.input('organizer-key', fixture.key);
  organizer.submit('auth-form');
  await until(() => organizer.visible('admin-controls'), 'Organizer can access settings');
  assert.ok(organizer.visible('admin-limit-form'));
  assert.equal(organizer.node('admin-number-limit').value, '13');

  organizer.input('admin-number-limit', '0');
  const beforeInvalid = organizer.requests.length;
  organizer.submit('admin-limit-form');
  assert.equal(organizer.requests.length, beforeInvalid, 'An invalid limit is rejected before a request');
  assert.ok(organizer.text('admin-error'));

  organizer.input('admin-number-limit', '14');
  organizer.submit('admin-limit-form');
  await until(() => fixture.event.numberLimit === 14 && !organizer.node('admin-refresh').disabled, 'Organizer can save 14 as the maximum');
  assert.equal(fixture.event.phase, 'drawing');
  assert.deepEqual(fixture.event.teams, originalAwards);
  const setting = organizer.requests.findLast(({ body }) => body?.action === 'setLimit');
  assert.equal(setting.body.numberLimit, 14);
  assert.equal(setting.body.expectedLimit, 13);

  participant.click('refresh');
  await until(() => participant.node('phase-badge').dataset.phase === 'drawing', 'Another phone sees the added number');
  assert.match(participant.text('action-detail'), /1[–-]14/);
  assert.equal(participant.text('team-submit'), '抽号');
  participant.input('team-name', '临时追加小组');
  participant.click('team-submit');
  await until(() => participant.visible('draw-stage') && !participant.node('team-submit').disabled, 'The additional team can draw');
  assert.equal(participant.text('draw-number'), '14');
  assert.equal(fixture.event.teams.find(({ name }) => name === '临时追加小组').number, 14);
  assert.match(participant.text('order-summary'), /14\s*\/\s*14/);
  assert.deepEqual(fixture.event.teams.filter(({ number }) => number <= 13), originalAwards);

  organizer.input('admin-number-limit', '13');
  organizer.submit('admin-limit-form');
  await until(() => organizer.text('admin-error') && !organizer.node('admin-refresh').disabled, 'A smaller occupied range is rejected');
  assert.equal(fixture.event.numberLimit, 14);
  assert.equal(fixture.event.teams.length, 14);
});
