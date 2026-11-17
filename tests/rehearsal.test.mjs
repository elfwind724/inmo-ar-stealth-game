import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRehearsalHandler } from '../netlify/rehearsal/api.mjs';
import { createPostgresStore } from '../netlify/rehearsal/postgres.mjs';

const endpoint = 'http://localhost/rehearsal/api';
const testDatabase = process.env.REHEARSAL_TEST_DATABASE_URL;
const adminKey = randomBytes(24).toString('hex');
const migration = new URL('../netlify/database/migrations/20261117000100_create_rehearsal.sql', import.meta.url);

async function call(handler, action, fields = {}, { bearer, expectedStatus = 200 } = {}) {
  const headers = {};
  if (action) headers['content-type'] = 'application/json';
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const request = new Request(endpoint, action ? {
    method: 'POST', headers, body: JSON.stringify({ action, ...fields }),
  } : { headers });
  const response = await handler(request);
  const result = await response.json();
  assert.equal(response.status, expectedStatus, `${action ?? 'GET'}: ${JSON.stringify(result)}`);
  assert.match(response.headers.get('cache-control'), /no-store/);
  return result;
}

test('the rehearsal API rejects missing or wrong organizer credentials without using the database', async () => {
  const handler = createRehearsalHandler({
    store: new Proxy({}, { get: () => assert.fail('unauthorized request touched the database') }),
    getAdminKey: () => adminKey,
  });
  for (const action of ['adminState', 'open', 'add', 'start', 'remove', 'finish']) {
    await call(handler, action, { name: '测试小组', names: ['测试小组'] }, { expectedStatus: 401 });
    await call(handler, action, {}, { bearer: 'wrong-key', expectedStatus: 401 });
  }
});

test('rehearsal API and real PostgreSQL preserve the roster and a unique random draw under concurrent requests', {
  skip: !testDatabase && 'Set REHEARSAL_TEST_DATABASE_URL to a local PostgreSQL database to run this integration test.',
}, async (t) => {
  const url = new URL(testDatabase);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a disposable local database.');
  assert.equal(url.searchParams.has('host'), false);
  const { Pool } = await import('pg');
  const schema = `rehearsal_qa_${randomBytes(8).toString('hex')}`;
  const control = new Pool({ connectionString: testDatabase });
  const pool = new Pool({ connectionString: testDatabase, max: 16, options: `-c search_path=${schema}` });
  t.after(async () => {
    await pool.end();
    try {
      await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await control.end();
    }
  });
  await control.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await readFile(migration, 'utf8'));

  const handler = createRehearsalHandler({ store: createPostgresStore(() => pool), getAdminKey: () => adminKey });
  const publicCall = (action, name, expectedStatus = 200) => call(handler, action, { name }, { expectedStatus });
  const admin = (action, fields, expectedStatus = 200) => call(handler, action, fields, { bearer: adminKey, expectedStatus });
  assert.deepEqual(await publicCall(), { phase: 'closed', teamCount: 0, drawnCount: 0, results: [] });
  await publicCall('register', '公益小组', 409);
  await admin('start', {}, 409);
  assert.equal((await admin('open')).state.phase, 'registering');
  // An event opened by the prior release can still have a saved activity code.
  const legacyDigest = `${'a'.repeat(32)}:${'b'.repeat(64)}`;
  await pool.query('UPDATE christmas_rehearsal_event SET access_digest = $1 WHERE singleton', [legacyDigest]);
  assert.equal((await publicCall()).phase, 'registering');
  await admin('start', {}, 409);
  await publicCall('register', '\u3000  ', 400);
  await publicCall('register', 42, 400);

  const normalizedVariants = ['Ａｌｐｈａ　组', 'Alpha  组', ' alpha 组 '];
  const parallelRegistrations = await Promise.all(Array.from({ length: 21 }, (_, i) => (
    publicCall('register', normalizedVariants[i % normalizedVariants.length])
  )));
  assert.equal(new Set(parallelRegistrations.map(({ team }) => team.name)).size, 1);
  assert.equal((await publicCall()).teamCount, 1);
  assert.deepEqual((await publicCall()).results, []);

  const extraNames = ['测试琴组', '测试唱诗组', '测试舞蹈组', '测试灯光组', '测试布景组', '测试器乐组', '测试短剧组'];
  await admin('add', { names: [...extraNames, '误录小组', extraNames[0]].join('\n') });
  const beforeStart = await admin('remove', { name: '误录小组' });
  assert.equal(beforeStart.state.teamCount, extraNames.length + 1);
  assert.equal(beforeStart.teams.length, extraNames.length + 1);

  const starts = await Promise.all(Array.from({ length: 8 }, () => admin('start')));
  const started = starts[0];
  assert.equal(started.state.phase, 'drawing');
  assert.ok(starts.every(({ state }) => state.phase === 'drawing'));
  assert.equal(started.state.drawnCount, 0);
  assert.deepEqual(started.state.results, []);
  assert.ok(started.teams.every((team) => team.number === null));
  assert.deepEqual(await publicCall(), started.state);
  await publicCall('draw', '', 400);
  await publicCall('draw', '误录小组', 404);
  await publicCall('register', '迟到小组', 409);
  await admin('remove', { name: extraNames[0] }, 409);
  const assignedBeforeAnyDraw = await pool.query('SELECT name, number FROM christmas_rehearsal_teams ORDER BY number');
  assert.deepEqual(assignedBeforeAnyDraw.rows.map(({ number }) => number), Array.from({ length: extraNames.length + 1 }, (_, i) => i + 1));

  // After locking, checking one group's number cannot reveal any other group's assignment.
  const one = await publicCall('draw', normalizedVariants[0]);
  assert.deepEqual(one.state.results, [one.team]);
  const repeated = await Promise.all(normalizedVariants.map(name => publicCall('draw', name)));
  assert.ok(repeated.every(({ team }) => team.number === one.team.number));

  const revealed = await Promise.all([...extraNames.slice(0, -1), ...extraNames.slice(0, -1).reverse()].map(name => publicCall('draw', name)));
  const distinctResults = new Map(revealed.map(({ team }) => [team.name, team.number]));
  assert.equal(distinctResults.size, extraNames.length - 1);
  assert.equal(new Set([one.team.number, ...distinctResults.values()]).size, extraNames.length);
  assert.ok(revealed.every(({ team }) => team.number === distinctResults.get(team.name)));

  // Complete the lottery with one group remaining and verify its preassigned rank is preserved.
  const done = await admin('finish');
  assert.equal(done.state.phase, 'finished');
  assert.equal(done.state.drawnCount, extraNames.length + 1);
  assert.deepEqual(done.state.results, assignedBeforeAnyDraw.rows);
  assert.equal(done.state.results.find(({ name }) => name === one.team.name).number, one.team.number);
  assert.ok(done.state.results.every(({ name, number }) => !distinctResults.has(name) || distinctResults.get(name) === number));
  assert.deepEqual(await publicCall(), done.state);
  assert.deepEqual((await publicCall('draw', normalizedVariants[1])).team, one.team);
  assert.deepEqual((await admin('start')).state, done.state);
  assert.deepEqual((await admin('finish')).state, done.state);
  assert.deepEqual((await admin('adminState')).state, done.state);
});
