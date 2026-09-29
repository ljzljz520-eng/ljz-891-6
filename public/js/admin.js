// ============================================================
// 总部后台：仪表盘 / 到期提醒 / 授权 CRUD / 续期
// ============================================================
const $ = id => document.getElementById(id);
const tbody = $('tableBody');
const emptyBox = $('tableEmpty');
const modalMask = $('modalMask');

let allStations = [];
let filterStatus = '';

const STATUS_BADGE = {
  active: 'badge-active',
  expiring: 'badge-expiring',
  expired: 'badge-expired',
  suspended: 'badge-suspended'
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = ''), 2400);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.message || '请求失败');
  }
  return data;
}

// ---------------- 加载 ----------------
async function loadDashboard() {
  const { data } = await api('/api/dashboard');
  $('today').textContent = data.today;
  renderStats(data.summary);
  renderReminders(data.reminders);
}

function renderStats(s) {
  const items = [
    { key: 'total', label: '授权网点总数', num: s.total, color: 'var(--ink)', dot: '#94a3b8' },
    { key: 'active', label: '授权有效', num: s.active, color: 'var(--green)', dot: 'var(--green)' },
    { key: 'expiring', label: `${'即将到期（30天内）'}`, num: s.expiring, color: 'var(--amber)', dot: 'var(--amber)' },
    { key: 'expired', label: '已到期', num: s.expired, color: 'var(--red)', dot: 'var(--red)' },
    { key: 'suspended', label: '已停用 / 注销', num: s.suspended, color: 'var(--gray)', dot: 'var(--gray)' }
  ];
  $('statGrid').innerHTML = items.map(it => `
    <div class="stat" data-status="${it.key === 'total' ? '' : it.key}">
      <div class="num" style="color:${it.color}"><span class="dot" style="background:${it.dot}"></span>${it.num}</div>
      <div class="lbl">${it.label}</div>
    </div>`).join('');
  document.querySelectorAll('.stat').forEach(el => {
    el.addEventListener('click', () => {
      filterStatus = el.dataset.status;
      $('statusFilter').value = filterStatus;
      renderTable();
    });
  });
}

function renderReminders(list) {
  const box = $('reminderBox');
  if (!list.length) {
    box.innerHTML = `<div class="empty" style="padding:26px"><span class="ico">🎉</span>近期暂无到期网点，所有授权状态良好</div>`;
    return;
  }
  box.innerHTML = list.map(s => {
    const isExpired = s.status === 'expired';
    const dayText = isExpired ? `已过期 ${Math.abs(s.daysLeft)} 天` : `剩余 ${s.daysLeft} 天`;
    return `
      <div class="remind-item ${s.status}">
        <div class="r-main">
          <div class="r-title"><code>${esc(s.code)}</code>${esc(s.name)}
            <span style="font-weight:400;font-size:12.5px;color:var(--muted)">负责人：${esc(s.manager)}</span>
          </div>
          <div class="r-meta">
            到期日 <b style="color:var(--ink)">${esc(s.expireDate)}</b>
            · ${esc(s.parentProvider)}
            · 品牌：${(s.brands || []).map(esc).join('、')}
          </div>
        </div>
        <div class="r-days">${dayText}</div>
        <button class="btn btn-ghost btn-sm" onclick="quickRenew('${s.id}',12,true)">续期 1 年</button>
      </div>`;
  }).join('');
}

window.quickRenew = async (id, months, unsuspend) => {
  try {
    await api('/api/stations/renew', { method: 'POST', body: JSON.stringify({ id, months, unsuspend }) });
    toast('✅ 已顺延 12 个月');
    await refresh();
  } catch (e) { toast(e.message, true); }
};

async function loadStations() {
  const q = $('searchInput').value.trim();
  const brand = $('brandFilter').value;
  const status = $('statusFilter').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (brand) params.set('brand', brand);
  if (status) params.set('status', status);
  const { data } = await api('/api/stations?' + params.toString());
  allStations = data;
  renderTable();
}

function renderTable() {
  // 顶部统计卡点击时本地过滤
  let rows = allStations;
  if (filterStatus) rows = rows.filter(r => r.status === filterStatus);

  if (!rows.length) {
    tbody.innerHTML = '';
    emptyBox.hidden = false;
    return;
  }
  emptyBox.hidden = true;
  tbody.innerHTML = rows.map(s => `
    <tr>
      <td><span class="code-cell">${esc(s.code)}</span></td>
      <td class="name-cell">${esc(s.name)}<small>${esc(s.manager)} · ${esc(s.phone || '未填电话')}</small></td>
      <td>${(s.brands || []).slice(0, 3).map(b => `<span class="brand-tag" style="margin:1px">${esc(b)}</span>`).join('')}${s.brands.length > 3 ? ` <span class="brand-tag">+${s.brands.length - 3}</span>` : ''}</td>
      <td style="max-width:180px;font-size:12.5px;color:var(--body)">${esc(s.parentProvider)}</td>
      <td style="white-space:nowrap;font-size:12.8px">${esc(s.startDate)}<br>～ ${esc(s.expireDate)}</td>
      <td style="white-space:nowrap;font-weight:700;color:${s.daysLeft < 0 ? 'var(--red)' : s.daysLeft <= 30 ? 'var(--amber)' : 'var(--green)'}">
        ${s.status === 'suspended' ? '—' : s.daysLeft < 0 ? `超期 ${Math.abs(s.daysLeft)} 天` : `${s.daysLeft} 天`}
      </td>
      <td><span class="badge ${STATUS_BADGE[s.status]}">${esc(s.statusLabel)}</span></td>
      <td class="actions">
        <button class="btn btn-ghost btn-sm" onclick="editStation('${s.id}')">编辑</button>
        ${(s.status === 'expired' || s.status === 'expiring' || s.status === 'suspended')
          ? `<button class="btn btn-ghost btn-sm" style="color:var(--green);border-color:#a7f3d0" onclick="quickRenew('${s.id}',12,true)">续期</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="removeStation('${s.id}')">删除</button>
      </td>
    </tr>`).join('');
}

// ---------------- 弹窗 ----------------
function openModal(station = null) {
  $('stationForm').reset();
  $('f_id').value = station?.id || '';
  $('modalTitle').textContent = station ? '编辑授权信息' : '新增授权网点';
  if (station) {
    $('f_code').value = station.code;
    $('f_name').value = station.name;
    $('f_manager').value = station.manager;
    $('f_phone').value = station.phone || '';
    $('f_region').value = station.region || '';
    $('f_address').value = station.address || '';
    $('f_parent').value = station.parentProvider || '';
    $('f_brands').value = (station.brands || []).join('、');
    $('f_start').value = station.startDate || '';
    $('f_expire').value = station.expireDate || '';
    $('f_remark').value = station.remark || '';
    $('f_suspended').checked = !!station.suspended;
  } else {
    // 默认值：今天开通，一年后到期
    const t = new Date();
    const fmt = d => d.toISOString().slice(0, 10);
    $('f_start').value = fmt(t);
    const y = new Date(t); y.setFullYear(y.getFullYear() + 1);
    $('f_expire').value = fmt(y);
  }
  modalMask.classList.add('show');
}
function closeModal() { modalMask.classList.remove('show'); }

$('btnCreate').addEventListener('click', () => openModal());
$('modalClose').addEventListener('click', closeModal);
$('modalCancel').addEventListener('click', closeModal);
modalMask.addEventListener('click', e => { if (e.target === modalMask) closeModal(); });

window.editStation = id => {
  const s = allStations.find(x => x.id === id);
  if (s) openModal(s);
};

window.removeStation = async id => {
  const s = allStations.find(x => x.id === id);
  if (!confirm(`确认删除网点「${s.code} ${s.name}」的授权记录？\n删除后网点端将无法查询到该授权。`)) return;
  try {
    await api('/api/stations/' + id, { method: 'DELETE' });
    toast('🗑️ 已删除');
    await refresh();
  } catch (e) { toast(e.message, true); }
};

$('stationForm').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    code: $('f_code').value,
    name: $('f_name').value,
    manager: $('f_manager').value,
    phone: $('f_phone').value,
    region: $('f_region').value,
    address: $('f_address').value,
    parentProvider: $('f_parent').value,
    brands: $('f_brands').value,
    startDate: $('f_start').value,
    expireDate: $('f_expire').value,
    remark: $('f_remark').value,
    suspended: $('f_suspended').checked
  };
  if (payload.startDate && payload.expireDate && payload.expireDate < payload.startDate) {
    return toast('到期日不能早于开通时间', true);
  }
  const id = $('f_id').value;
  $('modalSave').disabled = true;
  try {
    if (id) {
      await api('/api/stations/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      toast('✅ 授权信息已更新');
    } else {
      await api('/api/stations', { method: 'POST', body: JSON.stringify(payload) });
      toast('✅ 授权网点已创建');
    }
    closeModal();
    await refresh();
  } catch (err) {
    toast(err.message, true);
  } finally {
    $('modalSave').disabled = false;
  }
});

// ---------------- 筛选 ----------------
let searchTimer;
$('searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadStations, 250);
});
$('brandFilter').addEventListener('change', loadStations);
$('statusFilter').addEventListener('change', () => { filterStatus = ''; loadStations(); });
$('btnReset').addEventListener('click', () => {
  $('searchInput').value = '';
  $('brandFilter').value = '';
  $('statusFilter').value = '';
  filterStatus = '';
  loadStations();
});

// 品牌下拉
async function loadBrandOptions() {
  const { data } = await api('/api/brands');
  const sel = $('brandFilter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">全部品牌</option>' +
    data.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  sel.value = cur;
}

async function refresh() {
  await Promise.all([loadDashboard(), loadStations(), loadBrandOptions()]);
}

refresh().catch(err => toast('初始化失败：' + err.message, true));
