const endpoint = '/rehearsal/api';
const byId = (id) => document.getElementById(id);
const teamForm = byId('team-form');
const teamName = byId('team-name');
const teamSubmit = byId('team-submit');
const accessForm = byId('access-form');
const accessInput = byId('access-code');
const accessSubmit = byId('access-submit');
const refreshButton = byId('refresh');
const authForm = byId('auth-form');
const keyInput = byId('organizer-key');
const adminControls = byId('admin-controls');
const rosterForm = byId('admin-roster-form');
const rosterInput = byId('roster-input');
const openCodeInput = byId('admin-code');
const startButton = byId('admin-start');
const finishButton = byId('admin-finish');
const exportButton = byId('admin-export');

const phases = {
  closed: ['等待开放', '报名尚未开放', '请等负责人开放报名，再填写小组名称。'],
  registering: ['报名中', '填写小组名称', '报名后，等待负责人锁定名单并开放抽号。'],
  drawing: ['抽号中', '抽取彩排号码', '输入报名时的小组名称。重复抽号会显示原号码。'],
  finished: ['抽号结束', '彩排顺序已确定', '请在彩排顺序中查看你们小组的号码。'],
};

let state;
let adminState;
let organizer = false;
let adminKey = '';
let participantCode = readCode();
let needsCode = false;
let refreshing = false;
let teamSubmitting = false;
let adminSubmitting = false;
let publicVersion = 0;
let adminVersion = 0;
const validAccessCode = /^[!-~]{6,64}$/;

function readCode() {
  try {
    return sessionStorage.getItem('rehearsal-access') || '';
  } catch {
    return '';
  }
}

function saveCode(code) {
  try {
    if (code) sessionStorage.setItem('rehearsal-access', code);
    else sessionStorage.removeItem('rehearsal-access');
  } catch {
    // The current tab can still use the in-memory value.
  }
}

async function request(data, { key = '', code = '' } = {}) {
  const headers = { Accept: 'application/json' };
  if (data) headers['Content-Type'] = 'application/json';
  if (key) headers.Authorization = `Bearer ${key}`;
  if (code) headers['X-Rehearsal-Code'] = code;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(endpoint, {
      method: data ? 'POST' : 'GET',
      headers,
      body: data ? JSON.stringify(data) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      throw Object.assign(new Error(result?.message || '暂时无法连接，请稍后再试。'), {
        code: result?.error,
        status: response.status,
      });
    }
    return result;
  } catch (error) {
    if (error instanceof TypeError || error.name === 'AbortError') {
      throw new Error('连接超时或网络不稳定，请稍后重试。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function feedback(id, message = '') {
  const node = byId(id);
  if (node.textContent !== message) node.textContent = message;
  node.hidden = !message;
}

function clearTeamFeedback() {
  feedback('team-error');
  feedback('team-message');
  teamName.removeAttribute('aria-invalid');
}

function phaseLabel(key, label, title, detail) {
  byId('phase-badge').dataset.phase = key;
  byId('phase-label').textContent = label;
  byId('action-title').textContent = title;
  byId('action-detail').textContent = detail;
}

function groupRow(team) {
  const row = document.createElement('li');
  if (team.number != null) {
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = `${team.number} 号`;
    row.append(number);
  }
  const name = document.createElement('span');
  name.className = 'group';
  name.textContent = team.name;
  row.append(name);
  return row;
}

function renderPublic(nextState) {
  if (state?.phase !== nextState.phase) clearTeamFeedback();
  state = nextState;
  needsCode = false;
  accessForm.hidden = true;
  phaseLabel(state.phase, ...phases[state.phase]);
  const registering = state.phase === 'registering';
  const drawing = state.phase === 'drawing';
  teamForm.hidden = !(registering || drawing);
  teamSubmit.textContent = registering ? '报名' : '抽号';
  byId('order-summary').textContent = registering
    ? `已报名 ${state.teamCount} 组`
    : (drawing || state.phase === 'finished')
      ? `已公布 ${state.drawnCount} / ${state.teamCount} 组`
      : '抽出的号码会在这里公布。';
  const results = [...state.results].sort((a, b) => a.number - b.number);
  byId('results').replaceChildren(...results.map(groupRow));
  byId('results').hidden = results.length === 0;
  byId('empty-results').hidden = results.length > 0;
  byId('empty-results').textContent = drawing ? '等候第一个小组抽号' : '彩排顺序将在抽号后更新';
  feedback('refresh-notice');
}

function requireCode(error, triedCode = false) {
  state = undefined;
  needsCode = true;
  participantCode = '';
  saveCode('');
  phaseLabel('private', '需要口令', '输入活动口令', '请向活动负责人获取口令。');
  accessForm.hidden = false;
  teamForm.hidden = true;
  byId('my-result').hidden = true;
  byId('results').replaceChildren();
  byId('results').hidden = true;
  byId('empty-results').hidden = false;
  byId('empty-results').textContent = '输入活动口令后查看名单';
  byId('order-summary').textContent = '仅供参加彩排的小组查看。';
  feedback('team-error', triedCode ? error.message : '');
  feedback('team-message');
  feedback('refresh-notice');
}

async function refreshPublic({ code = participantCode, manual = false } = {}) {
  if (refreshing || teamSubmitting || organizer) return;
  const version = ++publicVersion;
  refreshing = true;
  refreshButton.disabled = true;
  try {
    const result = await request(null, { code });
    if (version !== publicVersion || organizer) return;
    participantCode = code;
    saveCode(code);
    accessInput.value = '';
    renderPublic(result);
    if (manual) feedback('refresh-notice', '已更新。');
  } catch (error) {
    if (version !== publicVersion || organizer) return;
    if (error.code === 'access_code_required') {
      requireCode(error, Boolean(code));
    } else {
      if (!state && !needsCode) {
        phaseLabel('offline', '无法连接', '暂时无法获取活动状态', '请点击「刷新」重试。');
        byId('empty-results').textContent = '暂时无法加载彩排顺序';
      }
      feedback('refresh-notice', error.message);
    }
  } finally {
    refreshing = false;
    refreshButton.disabled = false;
  }
}

accessForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = accessInput.value.trim();
  if (!validAccessCode.test(code)) {
    feedback('team-error', code ? '请检查活动口令中的字母、数字或半角符号。' : '请输入活动口令。');
    accessInput.focus();
    return;
  }
  accessSubmit.disabled = true;
  await refreshPublic({ code });
  if (needsCode) accessInput.focus();
  else if (!teamForm.hidden) teamName.focus();
  accessSubmit.disabled = false;
});

teamForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (teamSubmitting || !state || teamForm.hidden) return;
  clearTeamFeedback();
  const name = teamName.value.trim();
  const action = state.phase === 'registering' ? 'register' : 'draw';
  if (!name) {
    feedback('team-error', action === 'draw' ? '还没输入小组名称，请输入后再点击抽号。' : '还没输入小组名称，请输入后再点击报名。');
    teamName.setAttribute('aria-invalid', 'true');
    teamName.focus();
    return;
  }

  const version = ++publicVersion;
  teamSubmitting = true;
  teamSubmit.disabled = true;
  teamName.readOnly = true;
  teamSubmit.textContent = action === 'register' ? '正在报名…' : '正在抽号…';
  byId('my-result').hidden = true;
  try {
    const result = await request({ action, name }, { code: participantCode });
    if (version !== publicVersion || organizer) return;
    renderPublic(result.state);
    teamName.value = result.team.name;
    if (result.team.number == null) {
      feedback('team-message', `「${result.team.name}」已报名，请留意抽号开放时间。`);
    } else {
      byId('my-team').textContent = result.team.name;
      byId('my-number').textContent = result.team.number;
      byId('my-result').hidden = false;
    }
  } catch (error) {
    if (version !== publicVersion || organizer) return;
    if (error.code === 'access_code_required') {
      requireCode(error, Boolean(participantCode));
    } else {
      feedback('team-error', error.message);
      if (error.status === 409) {
        try {
          const updated = await request(null, { code: participantCode });
          if (version !== publicVersion || organizer) return;
          renderPublic(updated);
          feedback('team-error', error.message);
        } catch {
          // Keep the original explanation available if the refresh also fails.
        }
      }
    }
  } finally {
    teamSubmitting = false;
    teamSubmit.disabled = false;
    teamName.readOnly = false;
    teamSubmit.textContent = state?.phase === 'registering' ? '报名' : '抽号';
  }
});

teamName.addEventListener('input', () => {
  clearTeamFeedback();
  byId('my-result').hidden = true;
});

refreshButton.addEventListener('click', () => {
  if (needsCode) accessInput.focus();
  else void refreshPublic({ manual: true });
});

function renderAdmin(payload) {
  adminState = payload;
  const { state: event, teams } = payload;
  const registering = event.phase === 'registering';
  const closed = event.phase === 'closed';
  const drawing = event.phase === 'drawing';
  authForm.hidden = true;
  adminControls.hidden = false;
  byId('admin-list').hidden = false;
  byId('organizer-hint').textContent = `当前状态：${phases[event.phase][0]}`;
  rosterForm.hidden = !(closed || registering);
  byId('roster-input').labels[0].textContent = closed ? '小组名单（选填）' : '补充小组名单';
  byId('roster-help').textContent = closed ? '一行一个名字。也可以留空，让各组自行报名。' : '每行填写一个要增加的小组名称。';
  byId('admin-roster-submit').textContent = closed ? '开放报名' : '添加小组';
  byId('admin-code-row').hidden = !closed;
  startButton.hidden = !registering;
  startButton.disabled = teams.length === 0;
  finishButton.hidden = !drawing;
  exportButton.hidden = event.results.length === 0;
  const roster = byId('roster');
  byId('roster-summary').textContent = `共 ${event.teamCount} 组${drawing || event.phase === 'finished' ? `，已公布 ${event.drawnCount} 组` : ''}`;
  const sorted = [...teams].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
  roster.replaceChildren(...sorted.map((team) => {
    const row = groupRow(team);
    if (registering) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button secondary compact';
      remove.textContent = '移除';
      remove.setAttribute('aria-label', `移除 ${team.name}`);
      remove.addEventListener('click', () => {
        if (window.confirm(`从报名名单移除「${team.name}」？`)) {
          void adminAction({ action: 'remove', name: team.name }, '已移除。');
        }
      });
      row.append(remove);
    }
    return row;
  }));
  roster.hidden = teams.length === 0;
  byId('empty-roster').hidden = teams.length > 0;
}

function logout() {
  adminVersion++;
  adminKey = '';
  adminState = undefined;
  keyInput.value = '';
  rosterInput.value = '';
  openCodeInput.value = '';
  authForm.hidden = false;
  adminControls.hidden = true;
  byId('admin-list').hidden = true;
  byId('roster').replaceChildren();
  byId('organizer-hint').textContent = '输入负责人口令后管理报名和抽号。';
  feedback('admin-error');
  feedback('admin-message');
}

async function adminAction(data, success = '', candidate = adminKey) {
  if (adminSubmitting || !candidate) return false;
  const version = ++adminVersion;
  adminSubmitting = true;
  const controls = [...byId('organizer').querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
  for (const control of controls) control.disabled = true;
  feedback('admin-error');
  feedback('admin-message');
  let result;
  try {
    result = await request(data, { key: candidate });
    if (!organizer || version !== adminVersion) return false;
    adminKey = candidate;
    feedback('admin-message', success);
    return true;
  } catch (error) {
    if (organizer && version === adminVersion) {
      if (error.status === 401 || error.status === 403) logout();
      feedback('admin-error', error.message);
    }
    return false;
  } finally {
    for (const control of controls) control.disabled = false;
    adminSubmitting = false;
    if (result && organizer && version === adminVersion) renderAdmin(result);
  }
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const key = keyInput.value.trim();
  if (!key) {
    feedback('admin-error', '请输入负责人口令。');
    keyInput.focus();
    return;
  }
  if (await adminAction({ action: 'adminState' }, '', key)) keyInput.value = '';
  else keyInput.focus();
});

rosterForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const opening = adminState?.state.phase === 'closed';
  const names = rosterInput.value;
  const code = openCodeInput.value.trim();
  if (!opening && !names.trim()) {
    feedback('admin-error', '请输入要添加的小组名称。');
    rosterInput.focus();
    return;
  }
  if (opening && code && !validAccessCode.test(code)) {
    feedback('admin-error', '活动口令须为 6 至 64 个英文字母、数字或半角符号。');
    openCodeInput.focus();
    return;
  }
  const data = opening ? { action: 'open', names, code } : { action: 'add', names };
  if (await adminAction(data, opening ? '报名已开放。' : '名单已更新。')) {
    rosterInput.value = '';
    openCodeInput.value = '';
  }
});

startButton.addEventListener('click', () => {
  if (window.confirm(`当前 ${adminState.state.teamCount} 组。锁定后名单无法更改，确定开放抽号？`)) {
    void adminAction({ action: 'start' }, '名单已锁定，各组可以开始抽号。');
  }
});

finishButton.addEventListener('click', () => {
  if (window.confirm('公布尚未抽出的号码，结束本场抽号？')) {
    void adminAction({ action: 'finish' }, '号码已全部公布。');
  }
});

function csvCell(value) {
  const text = String(value);
  const safeText = /^\s*[=+@\-]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

exportButton.addEventListener('click', () => {
  const rows = [...adminState.state.results].sort((a, b) => a.number - b.number);
  const contents = rows.map(({ name, number }) => `${number},${csvCell(name)}`);
  const file = new Blob(['\ufeff彩排顺序,小组名称\r\n', contents.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '2026-圣诞彩排名单.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

byId('admin-refresh').addEventListener('click', () => void adminAction({ action: 'adminState' }, '已更新。'));
byId('admin-logout').addEventListener('click', () => {
  logout();
  keyInput.focus();
});

function route() {
  organizer = location.hash === '#organizer';
  byId('participants').hidden = organizer;
  byId('organizer').hidden = !organizer;
  const link = byId('view-link');
  link.href = organizer ? '#participants' : '#organizer';
  link.textContent = organizer ? '返回彩排抽号' : '负责人入口';
  if (!organizer) {
    logout();
    if (!needsCode) void refreshPublic();
  }
}

window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !needsCode) void refreshPublic();
});
setInterval(() => {
  if (document.visibilityState === 'visible' && !needsCode) void refreshPublic();
}, 15000);

route();
