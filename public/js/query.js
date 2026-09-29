const form = document.getElementById('queryForm');
const codeInput = document.getElementById('code');
const principalInput = document.getElementById('principal');
const resultBox = document.getElementById('result');
const queryBtn = document.getElementById('queryBtn');

const STATUS_TEXT = {
  active: { cls: 'badge-active', text: '授权有效' },
  expiring: { cls: 'badge-expiring', text: '即将到期' },
};

function showFieldError(inputId, errId, msg) {
  const input = document.getElementById(inputId);
  const err = document.getElementById(errId);
  if (msg) {
    input.classList.add('field-error');
    err.textContent = msg;
    err.classList.add('show');
  } else {
    input.classList.remove('field-error');
    err.classList.remove('show');
  }
}

[codeInput, principalInput].forEach((el) =>
  el.addEventListener('input', () => showFieldError(el.id, el.id + 'Err', ''))
);

// 演示快捷填充
document.querySelectorAll('.demo-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    codeInput.value = chip.dataset.code;
    principalInput.value = chip.dataset.name;
    showFieldError('code', 'codeErr', '');
    showFieldError('principal', 'principalErr', '');
    resultBox.classList.remove('show');
    form.requestSubmit();
  });
});

function renderSuccess(d) {
  const st = STATUS_TEXT[d.status] || STATUS_TEXT.active;
  const warnLine = d.status === 'expiring'
    ? `<p style="margin-top:10px;color:#92400e;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;font-size:13px;">
         ⚠️ 该网点授权将于 <b>${d.daysToExpire} 天</b> 后到期（${esc(d.expireAt)}），请尽快联系上级服务商办理续期。
       </p>` : '';
  resultBox.innerHTML = `
    <div class="result-success">
      <div class="result-head">
        <div class="icon">✅</div>
        <div>
          <h3>授权信息核验通过</h3>
          <p>${esc(d.name)}（编号 ${esc(d.code)}）当前具备授权维修资质</p>
        </div>
      </div>
      <div class="result-body">
        <div class="kv">
          <div class="cell"><div class="k">网点编号</div><div class="v">${esc(d.code)}</div></div>
          <div class="cell"><div class="k">授权状态</div><div class="v"><span class="badge ${st.cls}">${st.text}</span></div></div>
          <div class="cell"><div class="k">授权负责人</div><div class="v">${esc(d.principal)}</div></div>
          <div class="cell"><div class="k">联系电话</div><div class="v">${esc(d.phone || '—')}</div></div>
          <div class="cell" style="grid-column: 1 / -1;">
            <div class="k">可维修品牌</div>
            <div class="v brands">${d.brands.map((b) => `<span class="brand-tag">${esc(b)}</span>`).join('')}</div>
          </div>
          <div class="cell" style="grid-column: 1 / -1;">
            <div class="k">上级服务商</div><div class="v">${esc(d.parentProvider)}</div>
          </div>
          <div class="cell"><div class="k">开通时间</div><div class="v">${formatCN(d.openedAt)}</div></div>
          <div class="cell"><div class="k">授权期限</div><div class="v">${formatCN(d.startAt)} 至 ${formatCN(d.expireAt)}</div></div>
        </div>
        <div style="padding: 12px 20px;">${warnLine}</div>
      </div>
    </div>`;
}

function renderError(err) {
  const map = {
    STATION_NOT_FOUND: {
      title: '未查询到该网点',
      desc: '系统中不存在该网点编号',
      tip: '请核对<b>网点编号</b>是否正确（注意大小写与连字符）。如确认为新网点，请联系上级服务商确认授权开通进度。',
    },
    PRINCIPAL_MISMATCH: {
      title: '负责人核验未通过',
      desc: '授权负责人姓名与登记信息不一致，查询被拒绝',
      tip: '请确认当前操作人为该网点登记的<b>授权负责人</b>。负责人变更需由总部后台更新登记信息。',
    },
    AUTH_EXPIRED: {
      title: '授权已过期',
      desc: '该网点授权已超出有效期限，暂不能开展授权维修业务',
      tip: '请尽快联系<b>上级服务商 / 总部后台</b>办理续期，续期生效后即可恢复查询与派单。',
    },
    AUTH_PENDING: {
      title: '授权尚未生效',
      desc: '未到授权起始日期，当前暂不能开展授权维修业务',
      tip: '请在授权起始日之后再进行查询，或联系上级服务商核实授权安排。',
    },
    MISSING_CODE: { title: '信息不完整', desc: '请输入网点编号', tip: '' },
    MISSING_PRINCIPAL: { title: '信息不完整', desc: '请输入授权负责人姓名', tip: '' },
  };
  const cfg = map[err.code] || { title: '查询失败', desc: err.message, tip: '请稍后重试，或联系系统管理员。' };
  const stationName = err.data && err.data.stationName ? `（${esc(err.data.stationName)}）` : '';
  resultBox.innerHTML = `
    <div class="result-error">
      <div class="result-head">
        <div class="icon">⛔</div>
        <div>
          <h3>${cfg.title}</h3>
          <p>${cfg.desc}${stationName}</p>
        </div>
      </div>
      <div class="result-body">
        <div class="error-detail">
          <div>${esc(err.message)}</div>
          ${cfg.tip ? `<div class="tip">💡 ${cfg.tip}</div>` : ''}
        </div>
      </div>
    </div>`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  const principal = principalInput.value.trim();
  let valid = true;
  if (!code) { showFieldError('code', 'codeErr', '请输入网点编号'); valid = false; }
  if (!principal) { showFieldError('principal', 'principalErr', '请输入授权负责人姓名'); valid = false; }
  if (!valid) return;

  queryBtn.disabled = true;
  queryBtn.textContent = '查询中…';
  try {
    const data = await api('/api/query', { method: 'POST', body: { code, principal } });
    renderSuccess(data);
  } catch (err) {
    if (err.code === 'MISSING_CODE' || err.code === 'MISSING_PRINCIPAL') {
      toast(err.message, 'error');
    }
    renderError(err);
  } finally {
    resultBox.classList.add('show');
    queryBtn.disabled = false;
    queryBtn.textContent = '🔍 查 询';
  }
});
