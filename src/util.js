// 日期与授权状态相关工具
// 约定：所有日期均为本地“日”粒度字符串 YYYY-MM-DD，比较时按 UTC 构造，避免时区偏移。

export function todayStr(now = new Date()) {
  return toDayStr(now);
}

export function toDayStr(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 把 YYYY-MM-DD 转为 UTC 0 点的 Date，便于做天数差
function dayUTC(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// 距今天的天数差：正数表示还有 n 天，负数表示已过 n 天
export function daysBetween(targetStr, baseStr) {
  return Math.round((dayUTC(targetStr) - dayUTC(baseStr)) / 86400000);
}

export const EXPIRE_WARN_DAYS = 30;

// status: active 有效 | expiring 即将到期 | expired 已过期 | pending 未生效
export function computeStatus(station, today = todayStr()) {
  const daysToExpire = daysBetween(station.expireAt, today);
  const daysToStart = daysBetween(station.startAt, today);
  let status;
  if (daysToExpire < 0) status = 'expired';
  else if (daysToStart > 0) status = 'pending';
  else if (daysToExpire <= EXPIRE_WARN_DAYS) status = 'expiring';
  else status = 'active';
  return { status, daysToExpire, daysToStart };
}

export function decorate(station, today = todayStr()) {
  const { status, daysToExpire, daysToStart } = computeStatus(station, today);
  return { ...station, status, daysToExpire, daysToStart };
}

// 品牌字符串标准化：支持 中文逗号、顿号、分号、英文逗号、空格 分隔
export function normalizeBrands(input) {
  if (Array.isArray(input)) {
    return input.map((b) => String(b).trim()).filter(Boolean);
  }
  return String(input || '')
    .split(/[,，、;；\s]+/)
    .map((b) => b.trim())
    .filter(Boolean);
}

// 标准负责人输入比较（去空白）
export function normalizeName(s) {
  return String(s || '').replace(/\s+/g, '');
}

// 校验 YYYY-MM-DD
export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 把 HTML 特殊字符转义，防止 XSS
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
