// 前端公共方法
async function api(url, options = {}) {
  const opts = { method: options.method || 'GET', headers: { ...(options.headers || {}) } };
  if (options.body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* 非 JSON */ }
  if (!res.ok || !data || data.success === false) {
    const err = new Error((data && data.error && data.error.message) || `请求失败（${res.status}）`);
    err.status = res.status;
    err.code = data && data.error && data.error.code;
    err.data = data && data.error;
    throw err;
  }
  return data.data;
}

function toast(msg, type = 'info') {
  const box = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = `toast-item toast-${type}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2600);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// YYYY-MM-DD => YYYY年MM月DD日
function formatCN(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${y}年${m}月${d}日`;
}
