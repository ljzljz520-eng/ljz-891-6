// ============================================================
// 网点端：授权查询逻辑
// ============================================================
const form = document.getElementById('queryForm');
const codeInput = document.getElementById('code');
const managerInput = document.getElementById('manager');
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
const resultBox = document.getElementById('result');

const STATUS_META = {
  active: { cls: 'badge-active', icon: '✅' },
  expiring: { cls: 'badge-expiring', icon: '⚠️' },
  expired: { cls: 'badge-expired', icon: '⛔' },
  suspended: { cls: 'badge-suspended', icon: '🚫' }
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 演示数据一键填入
document.querySelectorAll('.demo-row').forEach(row => {
  row.addEventListener('click', () => {
    codeInput.value = row.dataset.code;
    managerInput.value = row.dataset.manager;
    codeInput.focus();
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  resultBox.hidden = true;
  const code = codeInput.value.trim();
  const manager = managerInput.value.trim();

  if (!code || !manager) {
    return renderError({ message: '请同时输入网点编号和授权负责人' });
  }

  setLoading(true);
  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, manager })
    });
    const data = await res.json();
    render(data);
  } catch (err) {
    renderError({ message: '网络异常，请稍后重试' });
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  submitBtn.disabled = loading;
  btnText.innerHTML = loading
    ? '<span class="spinner"></span> 正在核验…'
    : '查询授权信息';
}

function render(data) {
  resultBox.hidden = false;
  resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (data.ok) renderSuccess(data.station);
  else renderFailure(data);
}

function stationBlock(s) {
  const meta = STATUS_META[s.status] || STATUS_META.active;
  const days = s.daysLeft;
  return `
    <div class="result-body">
      <div class="kv-grid">
        <div class="kv">
          <div class="k">🏷️ 网点编号</div>
          <div class="v code-cell">${esc(s.code)}</div>
        </div>
        <div class="kv">
          <div class="k">👤 授权负责人</div>
          <div class="v">${esc(s.manager)}</div>
        </div>
        <div class="kv full">
          <div class="k">🏪 网点名称</div>
          <div class="v">${esc(s.name)}</div>
        </div>
        <div class="kv full">
          <div class="k">🛠️ 可维修品牌</div>
          <div class="v brands">
            ${(s.brands || []).map(b => `<span class="brand-tag">${esc(b)}</span>`).join('')}
          </div>
        </div>
        <div class="kv">
          <div class="k">📅 授权开始日期</div>
          <div class="v">${esc(s.startDate)}</div>
        </div>
        <div class="kv">
          <div class="k">📆 授权到期日期</div>
          <div class="v">
            ${esc(s.expireDate)}
            <span class="badge ${meta.cls}" style="margin-left:8px">${meta.icon} ${esc(s.statusLabel)}</span>
          </div>
        </div>
        <div class="kv full">
          <div class="k">⬆️ 上级服务商</div>
          <div class="v">${esc(s.parentProvider)}</div>
        </div>
        <div class="kv">
          <div class="k">🕐 开通时间</div>
          <div class="v">${esc(s.startDate)} 起开通</div>
        </div>
        <div class="kv">
          <div class="k">📞 联系电话</div>
          <div class="v">${esc(s.phone) || '—'}</div>
        </div>
        <div class="kv full">
          <div class="k">📍 网点地址</div>
          <div class="v" style="font-weight:500;font-size:14px">${esc(s.region)} ${esc(s.address)}</div>
        </div>
        ${s.remark ? `<div class="kv full">
          <div class="k">📝 备注</div>
          <div class="v" style="font-weight:500;font-size:13.5px;color:var(--body)">${esc(s.remark)}</div>
        </div>` : ''}
      </div>
    </div>`;
}

function renderSuccess(s) {
  const expiring = s.status === 'expiring';
  const bannerCls = expiring ? 'result-warning' : 'result-success';
  const icon = expiring ? '⚠️' : '✅';
  const title = expiring ? '授权有效 · 即将到期' : '授权核验通过';
  const sub = expiring
    ? `该网点授权将于 ${s.expireDate} 到期（剩余 ${s.daysLeft} 天），请留意续期`
    : `该网点为官方授权服务网点，授权期限至 ${s.expireDate}（剩余 ${s.daysLeft} 天）`;
  resultBox.className = `result card ${bannerCls}`;
  resultBox.innerHTML = `
    <div class="result-banner">
      <div class="icon">${icon}</div>
      <div>
        <h3>${title}</h3>
        <p>${sub}</p>
      </div>
    </div>
    ${stationBlock(s)}`;
}

function renderFailure(data) {
  const reasonMap = {
    not_found: '网点编号不存在',
    manager_mismatch: '授权负责人不匹配',
    expired: '授权已到期',
    suspended: '授权已停用 / 注销',
    invalid_input: '信息填写不完整'
  };
  const title = reasonMap[data.reason] || '授权核验未通过';
  resultBox.className = 'result card result-error';
  let detail = '';
  if (data.station) {
    // 能查到网点但状态不可用（到期/停用）：展示只读信息便于核对
    detail = stationBlock(data.station);
  }
  resultBox.innerHTML = `
    <div class="result-banner">
      <div class="icon">⛔</div>
      <div>
        <h3>${title}</h3>
        <p>${esc(data.message)}</p>
      </div>
    </div>
    ${detail}
    <div class="result-body" ${detail ? 'style="padding-top:0"' : ''}>
      <div class="error-tips">
        <b>处理建议：</b>
        <ul>
          <li>请核对网点编号（区分大小写不敏感）与授权负责人姓名是否与授权证书一致；</li>
          <li>若网点编号遗忘，请联系上级服务商或总部售后服务中心查询；</li>
          <li>授权到期或被停用的网点，需完成续期 / 整改流程后方可恢复派单。</li>
        </ul>
      </div>
    </div>`;
}
