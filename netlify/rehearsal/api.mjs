import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const maxTeams = 500;
const maxBodyBytes = 64 * 1024;
const adminActions = new Set(['adminState', 'open', 'add', 'remove', 'start', 'finish']);
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
  if (!Array.isArray(values) || values.length > maxTeams) {
    reject(400, 'invalid_names', `请每行输入一个小组名称，名单最多容纳 ${maxTeams} 组。`);
  }
  return values.map(teamName);
}

function teamResult(team) {
  return { name: team.name, number: team.revealed ? team.number : null };
}

function publicState(state) {
  const results = state.teams.filter((team) => team.revealed).map(teamResult).sort((a, b) => a.number - b.number);
  return {
    phase: state.phase,
    teamCount: state.teams.length,
    drawnCount: results.length,
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

function equalSecret(actual, expected) {
  return timingSafeEqual(digest(actual), digest(expected));
}

function codeDigest(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^[!-~]{6,64}$/u.test(value)) {
    reject(400, 'invalid_access_code', '访问码需为 6–64 个英文、数字或半角标点，且不能包含空格。');
  }
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${digest(salt + value).toString('hex')}`;
}

function verifyAccess(request, state) {
  if (!state.accessDigest) return;
  const [salt, expected] = state.accessDigest.split(':');
  const code = request.headers.get('X-Rehearsal-Code') ?? '';
  if (!/^[!-~]{6,64}$/u.test(code) || !equalSecret(digest(salt + code).toString('hex'), expected)) {
    reject(401, 'access_code_required', '请输入负责人提供的访问码。');
  }
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
  if (current.size > maxTeams) reject(409, 'roster_full', `名单已达到 ${maxTeams} 组上限。`);
  state.teams = [...current.values()];
}

function assignNumbers(teams) {
  const shuffled = teams.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.forEach((team, index) => { team.number = index + 1; });
}

function applyAdmin(state, body) {
  switch (body.action) {
    case 'open':
      if (state.phase === 'registering') break;
      checkPhase(state, 'closed', '本轮抽号已锁定，无法重新开放报名。');
      addTeams(state, namesFrom(body.names));
      state.accessDigest = codeDigest(body.code);
      state.phase = 'registering';
      break;
    case 'add':
      checkPhase(state, 'registering', '只能在报名阶段补录小组。');
      addTeams(state, namesFrom(body.names));
      break;
    case 'remove': {
      checkPhase(state, 'registering', '名单已锁定，无法移除小组。');
      const { key } = teamName(body.name);
      state.teams = state.teams.filter((team) => team.key !== key);
      break;
    }
    case 'start':
      if (state.phase === 'drawing' || state.phase === 'finished') break;
      checkPhase(state, 'registering', '请先开放报名。');
      if (!state.teams.length) reject(409, 'no_teams', '请至少录入一个小组再开始抽号。');
      assignNumbers(state.teams);
      state.phase = 'drawing';
      break;
    case 'finish':
      if (state.phase === 'finished') break;
      checkPhase(state, 'drawing', '请先锁定名单并开始抽号。');
      for (const team of state.teams) team.revealed = true;
      state.phase = 'finished';
      break;
  }
  return adminState(state);
}

function applyPublic(state, request, body) {
  verifyAccess(request, state);
  const input = teamName(body.name);
  let team = state.teams.find(({ key }) => key === input.key);
  if (body.action === 'register') {
    if (!team) {
      checkPhase(state, 'registering', '目前没有开放报名，请联系负责人。');
      addTeams(state, [input]);
      team = input;
    }
  } else {
    if (state.phase !== 'drawing' && state.phase !== 'finished') {
      reject(409, 'wrong_phase', '负责人锁定名单后才能抽号。');
    }
    if (!team) reject(404, 'unknown_team', '名单里没有这个小组，请核对报名时填写的名称。');
    team.revealed = true;
    if (state.teams.every((entry) => entry.revealed)) state.phase = 'finished';
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
        const state = await store.read();
        verifyAccess(request, state);
        return json(publicState(state));
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
        return json(await store.update((state) => applyPublic(state, request, body)));
      }
      reject(400, 'unknown_action', '未识别该操作，请刷新页面后重试。');
    } catch (error) {
      if (error instanceof RehearsalError) return json({ error: error.code, message: error.message }, error.status);
      console.error('Rehearsal storage failure', error?.code ?? error?.name ?? 'Error');
      return json({ error: 'temporarily_unavailable', message: '抽号服务暂时不可用，请稍后重试。' }, 503);
    }
  };
}
