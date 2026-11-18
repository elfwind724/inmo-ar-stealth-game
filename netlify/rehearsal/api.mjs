import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

const numberLimit = 13;
const drawNumbers = Array.from({ length: numberLimit }, (_, index) => index + 1);
const maxBodyBytes = 64 * 1024;
const adminActions = new Set(['adminState', 'open', 'add', 'remove', 'clear', 'start', 'finish']);
const nameOrder = new Intl.Collator('zh-CN');
const responseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

class RehearsalError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function reject(status, code, message) {
  throw new RehearsalError(status, code, message);
}

function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { ...responseHeaders, ...headers } });
}

function teamName(value) {
  const name = typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
  if (!name) reject(400, 'name_required', '还没输入小组名称，请填写后再操作。');
  if ([...name].length > 40 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(name)) {
    reject(400, 'invalid_name', '小组名称请使用 1–40 个可见字符。');
  }
  return { key: name.toLowerCase(), name, number: null, revealed: false };
}

function namesFrom(value) {
  const values = typeof value === 'string' ? value.split(/\r\n|\n|\r/u).filter((name) => name.trim()) : value ?? [];
  if (!Array.isArray(values) || values.length > numberLimit) {
    reject(400, 'invalid_names', `请每行输入一个小组名称，名单最多容纳 ${numberLimit} 组。`);
  }
  return values.map(teamName);
}

function teamResult(team) {
  return { name: team.name, number: team.revealed ? team.number : null };
}

function isDrawNumber(number) {
  return Number.isInteger(number) && number >= 1 && number <= numberLimit;
}

function remainingNumbers(teams) {
  return numberLimit - teams.filter((team) => team.revealed && isDrawNumber(team.number)).length;
}

function publicState(state) {
  const results = state.teams.filter((team) => team.revealed).map(teamResult).sort((a, b) => a.number - b.number);
  return {
    phase: state.phase,
    teamCount: state.teams.length,
    drawnCount: results.length,
    numberLimit,
    remainingCount: remainingNumbers(state.teams),
    results,
  };
}

function adminState(state) {
  return {
    state: publicState(state),
    teams: state.teams.map(teamResult).sort((a, b) => nameOrder.compare(a.name, b.name)),
  };
}

function digest(value) {
  return createHash('sha256').update(value).digest();
}

function verifyAdmin(request, getAdminKey, adminKeyDigest) {
  const adminKey = getAdminKey();
  const expected = adminKey ? digest(adminKey) : adminKeyDigest;
  if (!expected) reject(503, 'admin_unconfigured', '负责人入口暂未配置，请联系管理员。');
  const token = /^Bearer ([^ ]+)$/iu.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token || !timingSafeEqual(digest(token), expected)) reject(401, 'unauthorized', '负责人管理码错误。');
}

function checkPhase(state, phase, message) {
  if (state.phase !== phase) reject(409, 'wrong_phase', message);
}

function addTeams(state, teams) {
  const current = new Map(state.teams.map((team) => [team.key, team]));
  for (const team of teams) {
    if (!current.has(team.key)) current.set(team.key, team);
  }
  if (current.size > numberLimit) reject(409, 'roster_full', `名单已达到 ${numberLimit} 组上限。`);
  state.teams = [...current.values()];
}

function claimNumber(state, team) {
  // Earlier rounds could reserve an unpublished number for a registered group.
  if (!isDrawNumber(team.number)) {
    const assigned = new Set(state.teams.map(({ number }) => number));
    const available = drawNumbers.filter((number) => !assigned.has(number));
    if (!available.length) reject(409, 'pool_full', '13 个彩排号码已分配，请联系负责人。');
    team.number = available[randomInt(available.length)];
  }
  team.revealed = true;
  if (remainingNumbers(state.teams) === 0) state.phase = 'finished';
}

function removeTeam(state, body) {
  const { key } = teamName(body.name);
  const index = state.teams.findIndex((team) => team.key === key);
  if (index < 0) return;
  const team = state.teams[index];
  if (Object.hasOwn(body, 'expectedNumber') && body.expectedNumber !== teamResult(team).number) {
    reject(409, 'stale_team', '这个小组的号码有变动，请刷新名单后再删除。');
  }
  state.teams.splice(index, 1);
  if (state.phase === 'finished' && remainingNumbers(state.teams) > 0) state.phase = 'drawing';
}

function clearTeams(state, expectedTeams) {
  if (state.teams.length === 0) return;
  if (!Array.isArray(expectedTeams) || expectedTeams.length === 0 || expectedTeams.length > numberLimit) {
    reject(400, 'invalid_roster', '请先刷新完整名单，再清空。');
  }

  const expected = new Map();
  for (const team of expectedTeams) {
    if (!team || typeof team !== 'object' || Array.isArray(team)
        || (team.number !== null && !Number.isInteger(team.number))) {
      reject(400, 'invalid_roster', '请先刷新完整名单，再清空。');
    }
    const { key } = teamName(team.name);
    if (expected.has(key)) reject(400, 'invalid_roster', '请先刷新完整名单，再清空。');
    expected.set(key, team.number);
  }

  if (expected.size !== state.teams.length
      || state.teams.some((team) => !expected.has(team.key) || expected.get(team.key) !== teamResult(team).number)) {
    reject(409, 'stale_roster', '名单刚刚有变化，请刷新后再清空。');
  }
  state.teams = [];
  if (state.phase === 'drawing' || state.phase === 'finished') state.phase = 'drawing';
}

function applyAdmin(state, body) {
  switch (body.action) {
    case 'open':
      if (state.phase === 'registering') break;
      checkPhase(state, 'closed', '本轮抽号已锁定，无法重新开放报名。');
      addTeams(state, namesFrom(body.names));
      state.phase = 'registering';
      break;
    case 'add':
      checkPhase(state, 'registering', '只能在报名阶段补录小组。');
      addTeams(state, namesFrom(body.names));
      break;
    case 'remove':
      removeTeam(state, body);
      break;
    case 'clear':
      clearTeams(state, body.expectedTeams);
      break;
    case 'start':
      if (remainingNumbers(state.teams) > 0) state.phase = 'drawing';
      break;
    case 'finish':
      if (state.phase === 'finished') break;
      checkPhase(state, 'drawing', '请先开放抽号。');
      if (remainingNumbers(state.teams) > 0) reject(409, 'draw_incomplete', '13 个号码还没有全部抽完。');
      state.phase = 'finished';
      break;
  }
  return adminState(state);
}

function applyPublic(state, body) {
  const input = teamName(body.name);
  let team = state.teams.find(({ key }) => key === input.key);
  if (body.action === 'register') {
    if (!team) {
      checkPhase(state, 'registering', '目前没有开放报名，请联系负责人。');
      addTeams(state, [input]);
      team = input;
    }
  } else if (!team?.revealed) {
    if (state.phase === 'finished') {
      if (remainingNumbers(state.teams) === 0) reject(409, 'pool_full', '13 个彩排号码已分配，请联系负责人。');
      reject(409, 'wrong_phase', '抽号已结束，请联系负责人。');
    }
    checkPhase(state, 'drawing', '负责人开放抽号后才能参加。');
    if (!team) {
      if (state.teams.length >= numberLimit) reject(409, 'roster_full', '已有 13 个小组登记，请让负责人核对名单。');
      state.teams.push(input);
      team = input;
    }
    claimNumber(state, team);
  }
  return { team: teamResult(team), state: publicState(state) };
}

async function parseBody(request) {
  const mediaType = request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') reject(415, 'unsupported_media_type', '请提交 JSON 数据。');
  if (Number(request.headers.get('Content-Length')) > maxBodyBytes) {
    reject(413, 'body_too_large', '提交内容过多，请分次提交。');
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBodyBytes) reject(413, 'body_too_large', '提交内容过多，请分次提交。');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    reject(400, 'invalid_json', '提交内容无法读取，请重试。');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    reject(400, 'invalid_json', '提交内容无法读取，请重试。');
  }
  return body;
}

export function createRehearsalHandler({ store, getAdminKey, adminKeyDigest = '' }) {
  const fallbackDigest = /^[a-f0-9]{64}$/iu.test(adminKeyDigest) ? Buffer.from(adminKeyDigest, 'hex') : null;
  return async function handle(request) {
    try {
      if (request.method === 'GET') {
        return json(publicState(await store.read()));
      }
      if (request.method !== 'POST') {
        return json({ error: 'method_not_allowed', message: '不支持该请求方式。' }, 405, { Allow: 'GET, POST' });
      }

      const body = await parseBody(request);
      if (adminActions.has(body.action)) {
        verifyAdmin(request, getAdminKey, fallbackDigest);
        if (body.action === 'adminState') return json(adminState(await store.read()));
        return json(await store.update((state) => applyAdmin(state, body)));
      }
      if (body.action === 'register' || body.action === 'draw') {
        return json(await store.update((state) => applyPublic(state, body)));
      }
      reject(400, 'unknown_action', '未识别该操作，请刷新页面后重试。');
    } catch (error) {
      if (error instanceof RehearsalError) return json({ error: error.code, message: error.message }, error.status);
      console.error('Rehearsal storage failure', error?.code ?? error?.name ?? 'Error');
      return json({ error: 'temporarily_unavailable', message: '抽号服务暂时不可用，请稍后重试。' }, 503);
    }
  };
}
