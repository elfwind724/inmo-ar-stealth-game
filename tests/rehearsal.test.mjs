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

const requiresPostgres = {
  skip: !testDatabase && 'Set REHEARSAL_TEST_DATABASE_URL to a local PostgreSQL database to run this integration test.',
};

async function setupPostgres(t) {
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
  return { pool, publicCall, admin };
}

test('a concurrent rehearsal draw uses 1–13 once each and returns deleted awards to the pool', requiresPostgres, async (t) => {
  const { pool, publicCall, admin } = await setupPostgres(t);
  assert.deepEqual(await publicCall(), {
    phase: 'closed', teamCount: 0, drawnCount: 0, numberLimit: 13, remainingCount: 13, results: [],
  });
  assert.equal((await publicCall('draw', '公益小组', 409)).error, 'wrong_phase');
  assert.equal((await admin('open')).state.phase, 'registering');
  await publicCall('register', '\u3000  ', 400);
  await publicCall('register', 42, 400);

  const normalizedVariants = ['Ａｌｐｈａ　组', 'Alpha  组', ' alpha 组 '];
  const parallelRegistrations = await Promise.all(Array.from({ length: 21 }, (_, i) => (
    publicCall('register', normalizedVariants[i % normalizedVariants.length])
  )));
  assert.equal(new Set(parallelRegistrations.map(({ team }) => team.name)).size, 1);
  assert.equal((await publicCall()).teamCount, 1);
  assert.deepEqual((await publicCall()).results, []);

  await admin('add', { names: ['误录小组', '误录小组'].join('\n') });
  const beforeStart = await admin('remove', { name: '误录小组' });
  assert.equal(beforeStart.state.teamCount, 1);

  const starts = await Promise.all(Array.from({ length: 8 }, () => admin('start')));
  const started = starts[0];
  assert.equal(started.state.phase, 'drawing');
  assert.ok(starts.every(({ state }) => state.phase === 'drawing'));
  assert.equal(started.state.drawnCount, 0);
  assert.equal(started.state.remainingCount, 13);
  assert.deepEqual(started.state.results, []);
  assert.ok(started.teams.every((team) => team.number === null));
  assert.deepEqual(await publicCall(), started.state);
  await publicCall('draw', '', 400);
  assert.equal((await admin('finish', {}, 409)).error, 'draw_incomplete');
  const beforeDraw = await pool.query('SELECT number FROM christmas_rehearsal_teams');
  assert.deepEqual(beforeDraw.rows, [{ number: null }]);

  const newTeams = Array.from({ length: 12 }, (_, index) => `测试小组 ${index + 1}`);
  const draws = await Promise.all([...normalizedVariants, ...newTeams, ...newTeams.slice(0, 4)].map(
    (name) => publicCall('draw', name),
  ));
  assert.ok(draws.every(({ state }) => state.remainingCount === 13 - state.drawnCount));
  const assigned = new Map(draws.map(({ team }) => [team.name, team.number]));
  assert.equal(assigned.size, 13);
  assert.ok(draws.every(({ team }) => team.number === assigned.get(team.name)));

  const complete = await publicCall();
  const completeNumbers = Array.from({ length: 13 }, (_, index) => index + 1);
  assert.equal(complete.phase, 'finished');
  assert.equal(complete.teamCount, 13);
  assert.equal(complete.remainingCount, 0);
  assert.deepEqual(complete.results.map(({ number }) => number), completeNumbers);
  assert.equal((await publicCall('draw', '超出名额的小组', 409)).error, 'pool_full');
  assert.deepEqual(await publicCall(), complete);

  const removed = complete.results[5];
  const staleNumber = removed.number === 1 ? 2 : 1;
  assert.equal((await admin('remove', { name: removed.name, expectedNumber: staleNumber }, 409)).error, 'stale_team');
  assert.deepEqual(await publicCall(), complete);
  const reopened = await admin('remove', { name: removed.name, expectedNumber: removed.number });
  assert.equal(reopened.state.phase, 'drawing');
  assert.equal(reopened.state.remainingCount, 1);
  const unchanged = complete.results.filter(({ name }) => name !== removed.name);
  assert.deepEqual(reopened.state.results, unchanged);

  const replacementName = '更正后的小组';
  const replacements = await Promise.all(Array.from({ length: 6 }, () => publicCall('draw', replacementName)));
  assert.ok(replacements.every(({ team, state }) => team.number === removed.number && state.phase === 'finished'));
  const repaired = await publicCall();
  assert.equal(repaired.remainingCount, 0);
  assert.deepEqual(repaired.results.map(({ number }) => number), completeNumbers);
  assert.deepEqual(repaired.results.filter(({ name }) => name !== replacementName), unchanged);
  assert.equal((await publicCall('draw', removed.name, 409)).error, 'pool_full');
  assert.deepEqual((await admin('start')).state, repaired);
  assert.deepEqual((await admin('adminState')).state, repaired);
});

test('a roster-free draw can open before registration, and prior assignments remain valid', requiresPostgres, async (t) => {
  const { pool, publicCall, admin } = await setupPostgres(t);
  const started = await admin('start');
  assert.equal(started.state.phase, 'drawing');
  assert.equal(started.state.teamCount, 0);

  // Simulate a round created before this release, with a saved code and an unrevealed old assignment.
  const legacyDigest = `${'a'.repeat(32)}:${'b'.repeat(64)}`;
  await pool.query('UPDATE christmas_rehearsal_event SET access_digest = $1 WHERE singleton', [legacyDigest]);
  await pool.query('INSERT INTO christmas_rehearsal_teams (name_key, name, number, revealed) VALUES ($1, $1, 1, true), ($2, $2, 2, false)', [
    '已经抽号小组',
    '原有待抽小组',
  ]);
  assert.deepEqual((await publicCall()).results, [{ name: '已经抽号小组', number: 1 }]);
  const late = await publicCall('draw', '新加入小组');
  assert.ok(late.team.number >= 3 && late.team.number <= 13);
  assert.deepEqual((await publicCall('draw', '原有待抽小组')).team, { name: '原有待抽小组', number: 2 });
  assert.deepEqual((await publicCall('draw', '已经抽号小组')).team, { name: '已经抽号小组', number: 1 });
  const { rows } = await pool.query('SELECT access_digest FROM christmas_rehearsal_event WHERE singleton');
  assert.equal(rows[0].access_digest, legacyDigest);
});
