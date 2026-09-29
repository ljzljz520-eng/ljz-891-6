const STATUS_MAP = {
  active: { cls: 'badge-active', text: '有效' },
  expiring: { cls: 'badge-expiring', text: '即将到期' },
  expired: { cls: 'badge-expired', text: '已过期' },
  pending: { cls: 'badge-pending', text: '未生效' },
};

let token = sessionStorage.getItem('admin_token') || '';
let allStations = [];   // 最近一次（筛选后的）列表
let summaryCache = null;

function adminApi(url, options = {}) {
  const opts = { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } };
  return api(url, opts);
}

function showView(loggedIn) {
  document.getElementById('loginView').style.display = loggedIn ? 'none' : 'block';
  document.getElementById('appView').style.display = loggedIn ? 'block' : 'none';
}

// ---------- 登录 ----------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = document.getElementById('loginPwd').value;
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = '登录中…';
  try {
    const data = await api('/api/admin/login', { method: 'POST', body: { password: pwd } });
    token = data.token;
    sessionStorage.setItem('admin_token', token);
    showView(true);
    await loadStations();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '登 录';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  token = '';
  sessionStorage.removeItem('admin_token');
  showView(false);
});

// ---------- 网点列表 ----------
async function loadStations() {
  const status = document.getElementById('filterStatus').value;
  const kw = document.getElementById('kw').value.trim();
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (kw) qs.set('kw', kw);
  try {
    const data = await adminApi('/api/admin/stations?' + qs.toString());
    allStations = data.list;
    summaryCache = data.summary;
    renderSummary(data.summary);
    renderStations(data.list);
    document.getElementById('todayText').textContent = `今天是 ${data.today} · 到期提醒阈值：30 天`;
  } catch (err) {
    if (err.code === 'UNAUTHORIZED') { toast('登录已失效，请重新登录', 'error'); showView(false); }
    else toast(err.message, 'error');
  }
}

function findStation(id) {
  return allStations.find((x) => x.id === Number(id))
    || (summaryCache && [].concat(summaryCache.expiringList || [], summaryCache.expiredList || [])
      .find((x) => x.id === Number(id))) || null;
}

function renderSummary(s) {
  document.getElementById('stTotal').textContent = s.total;
  document.getElementById('stActive').textContent = s.active;
  document.getElementById('stExpiring').textContent = s.expiring;
  document.getElementById('stExpired').textContent = s.expired;

  const alerts = document.getElementById('alerts');
  let html = '';
  if (s.expiredList.length) {
    html += `<div class="alert-box alert-danger">
      <h4>⛔ 已过期网点（${s.expiredList.length}）— 已不具备授权维修资质，请立即处理续期或暂停派单</h4>
      <ul>${s.expiredList.map((x) => `
        <li>
          <span class="who">${esc(x.code)} · ${esc(x.name)}（${esc(x.principal)}）</span>
          <span>到期日 ${esc(x.expireAt)} · 已过期 ${Math.abs(x.daysToExpire)} 天 · ${esc(x.parentProvider)}
            <button class="renew-mini" data-renew-id="${x.id}">续期</button>
          </span>
        </li>`).join('')}</ul></div>`;
  }
  if (s.expiringList.length) {
    html += `<div class="alert-box alert-warning">
      <h4>⏰ 即将到期提醒（${s.expiringList.length}）— 30 天内到期，建议提前联系网点办理续期</h4>
      <ul>${s.expiringList.map((x) => `
        <li>
          <span class="who">${esc(x.code)} · ${esc(x.name)}（${esc(x.principal)}）</span>
          <span>${esc(x.expireAt)} 到期 · 剩余 ${x.daysToExpire} 天
            <button class="renew-mini" data-renew-id="${x.id}">续期</button>
          </span>
        </li>`).join('')}</ul></div>`;
  }
  alerts.innerHTML = html;
}

function renderStations(list) {
  const tbody = document.getElementById('stationTbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty">没有符合条件的网点</div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((s) => {
    const st = STATUS_MAP[s.status] || STATUS_MAP.pending;
    const badgeExtra = s.status === 'expiring' ? `（剩 ${s.daysToExpire} 天）`
      : s.status === 'expired' ? `（超期 ${Math.abs(s.daysToExpire)} 天）` : '';
    return `<tr>
      <td><span class="code">${esc(s.code)}</span></td>
      <td>${esc(s.name)}<div class="muted">${esc(s.remark || '')}</div></td>
      <td>${esc(s.principal)}<div class="muted">${esc(s.phone || '—')}</div></td>
      <td class="brands-cell">${s.brands.map((b) => `<span class="brand-tag">${esc(b)}</span>`).join(' ')}</td>
      <td>${esc(s.parentProvider)}</td>
      <td>${esc(s.openedAt)}</td>
      <td>${esc(s.startAt)}<div class="muted">至 ${esc(s.expireAt)}</div></td>
      <td><span class="badge ${st.cls}">${st.text}${badgeExtra}</span></td>
      <td><div class="ops">
        <button class="btn btn-sm" data-act="renew" data-id="${s.id}">续期</button>
        <button class="btn btn-sm" data-act="edit" data-id="${s.id}">编辑</button>
        <button class="btn btn-sm btn-danger" data-act="del" data-id="${s.id}">删除</button>
      </div></td>
    </tr>`;
  }).join('');
}

// 表格事件委托
document.getElementById('stationTbody').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.act === 'edit') openEdit(id);
  else if (btn.dataset.act === 'del') delStation(id);
  else if (btn.dataset.act === 'renew') openRenew(id);
});

// 提醒区事件委托（续期入口）
document.getElementById('alerts').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-renew-id]');
  if (btn) openRenew(btn.dataset.renewId);
});

document.getElementById('filterStatus').addEventListener('change', loadStations);
document.getElementById('searchBtn').addEventListener('click', loadStations);
document.getElementById('kw').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadStations(); });
document.getElementById('resetBtn').addEventListener('click', async () => {
  if (!confirm('确定恢复为初始演示数据？当前所有修改将被清除。')) return;
  try {
    const r = await adminApi('/api/admin/reset', { method: 'POST' });
    toast(`已恢复演示数据（${r.stations} 个网点）`, 'success');
    loadStations();
  } catch (err) { toast(err.message, 'error'); }
});

// ---------- 模态框通用 ----------
const F = ['fId','fCode','fName','fPrincipal','fPhone','fBrands','fParent','fOpened','fStart','fExpire','fRemark']
  .reduce((o, id) => (o[id] = document.getElementById(id), o), {});

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => closeModal(b.dataset.close)));
document.querySelectorAll('.modal-mask').forEach((mask) =>
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.classList.remove('show'); }));

// ---------- 新增 / 编辑 ----------
document.getElementById('addBtn').addEventListener('click', () => {
  document.getElementById('editTitle').textContent = '新增授权网点';
  F.fId.value = '';
  Object.values(F).forEach((el) => { if (el.id !== 'fId') el.value = ''; });
  openModal('editMask');
});

function openEdit(id) {
  const s = findStation(id);
  if (!s) return toast('数据异常，请刷新列表', 'error');
  document.getElementById('editTitle').textContent = '编辑授权网点';
  F.fId.value = s.id;
  F.fCode.value = s.code;
  F.fName.value = s.name;
  F.fPrincipal.value = s.principal;
  F.fPhone.value = s.phone || '';
  F.fBrands.value = s.brands.join('、');
  F.fParent.value = s.parentProvider;
  F.fOpened.value = s.openedAt;
  F.fStart.value = s.startAt;
  F.fExpire.value = s.expireAt;
  F.fRemark.value = s.remark || '';
  openModal('editMask');
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const payload = {
    code: F.fCode.value.trim(),
    name: F.fName.value.trim(),
    principal: F.fPrincipal.value.trim(),
    phone: F.fPhone.value.trim(),
    brands: F.fBrands.value.trim(),
    parentProvider: F.fParent.value.trim(),
    openedAt: F.fOpened.value,
    startAt: F.fStart.value,
    expireAt: F.fExpire.value,
    remark: F.fRemark.value.trim(),
  };
  const id = F.fId.value;
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  try {
    if (id) await adminApi(`/api/admin/stations/${id}`, { method: 'PUT', body: payload });
    else await adminApi('/api/admin/stations', { method: 'POST', body: payload });
    toast('保存成功', 'success');
    closeModal('editMask');
    loadStations();
  } catch (err) { toast(err.message, 'error'); }
  finally { btn.disabled = false; }
});

async function delStation(id) {
  const s = findStation(id);
  if (!confirm(`确定删除「${s ? s.name : id}」？删除后该网点将无法查询。`)) return;
  try {
    await adminApi(`/api/admin/stations/${id}`, { method: 'DELETE' });
    toast('已删除', 'success');
    loadStations();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- 续期 ----------
function openRenew(id) {
  const s = findStation(id);
  if (!s) return toast('数据异常，请刷新列表', 'error');
  window.__renewId = s.id;
  document.getElementById('renewWho').textContent = `${s.code} · ${s.name}`;
  document.getElementById('rStart').value = s.expireAt;
  const d = new Date(s.expireAt + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  document.getElementById('rExpire').value = d.toISOString().slice(0, 10);
  openModal('renewMask');
}

document.getElementById('renewSaveBtn').addEventListener('click', async () => {
  const startAt = document.getElementById('rStart').value;
  const expireAt = document.getElementById('rExpire').value;
  const btn = document.getElementById('renewSaveBtn');
  btn.disabled = true;
  try {
    await adminApi(`/api/admin/stations/${window.__renewId}/renew`, {
      method: 'POST', body: { startAt, expireAt },
    });
    toast('续期成功', 'success');
    closeModal('renewMask');
    loadStations();
  } catch (err) { toast(err.message, 'error'); }
  finally { btn.disabled = false; }
});

// ---------- 查询日志 ----------
const LOG_MAP = {
  success: ['查询成功', 'log-success'],
  not_found: ['编号不存在', 'log-error'],
  principal_mismatch: ['负责人不符', 'log-error'],
  expired: ['授权已过期', 'log-error'],
  pending: ['尚未生效', 'log-warn'],
  bad_request: ['参数缺失', 'log-muted'],
};

async function loadLogs() {
  try {
    const data = await adminApi('/api/admin/logs?limit=200');
    const tbody = document.getElementById('logTbody');
    if (!data.logs.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty">暂无查询记录，可先到查询端发起一次查询</div></td></tr>`;
      return;
    }
    tbody.innerHTML = data.logs.map((l) => {
      const [text, cls] = LOG_MAP[l.result] || [l.result, 'log-muted'];
      return `<tr>
        <td>${esc(l.time)}</td>
        <td><span class="code">${esc(l.code)}</span></td>
        <td>${esc(l.principal)}</td>
        <td class="log-result ${cls}">${esc(text)}</td>
        <td class="muted">${esc(l.ip || '—')}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    if (err.code === 'UNAUTHORIZED') showView(false);
    toast(err.message, 'error');
  }
}
document.getElementById('refreshLogsBtn').addEventListener('click', loadLogs);

// Tab 切换
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogs = tab.dataset.tab === 'logs';
    document.getElementById('tabStations').style.display = isLogs ? 'none' : 'block';
    document.getElementById('tabLogs').style.display = isLogs ? 'block' : 'none';
    if (isLogs) loadLogs();
  });
});

// 已登录则直接进入后台
if (token) {
  showView(true);
  loadStations();
} else {
  showView(false);
}
