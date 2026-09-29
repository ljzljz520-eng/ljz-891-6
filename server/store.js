// ============================================================
// 数据访问层：基于 JSON 文件持久化（零依赖，适合演示 / 小站场景）
// ============================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_FILE = `${__dirname}/../data/stations.json`;

// 到期提醒阈值（天）
export const WARN_DAYS = 30;

// 授权状态
export const STATUS = {
  ACTIVE: 'active',     // 授权有效
  EXPIRING: 'expiring', // 即将到期
  EXPIRED: 'expired',   // 已到期
  SUSPENDED: 'suspended'// 已停用 / 注销
};

export const STATUS_LABEL = {
  active: '授权有效',
  expiring: '即将到期',
  expired: '已到期',
  suspended: '已停用'
};

function nowISO() {
  return new Date().toISOString();
}

/** 读取全部站点（首次运行自动初始化空库） */
export function loadStations() {
  if (!existsSync(DATA_FILE)) {
    const seed = { version: 1, updatedAt: nowISO(), stations: [] };
    saveStations(seed);
    return seed;
  }
  const raw = readFileSync(DATA_FILE, 'utf-8');
  const data = JSON.parse(raw || '{}');
  if (!Array.isArray(data.stations)) data.stations = [];
  return data;
}

/** 全量写回 */
export function saveStations(data) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  data.updatedAt = nowISO();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

// ---------- 纯函数：日期 / 状态工具 ----------

/** 把 yyyy-mm-dd 解析为本地 00:00 的 Date，避免 UTC 偏移 */
export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function todayStart() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

export function fmtDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffDays(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/**
 * 计算授权状态
 * @param {string} expireDate yyyy-mm-dd
 * @param {boolean} suspended 是否停用
 */
export function computeStatus(expireDate, suspended) {
  if (suspended) return STATUS.SUSPENDED;
  const end = parseDate(expireDate);
  if (!end) return STATUS.EXPIRED;
  const days = diffDays(todayStart(), end);
  if (days < 0) return STATUS.EXPIRED;
  if (days <= WARN_DAYS) return STATUS.EXPIRING;
  return STATUS.ACTIVE;
}

/** 给单条记录补齐展示字段 */
export function decorate(station) {
  const status = computeStatus(station.expireDate, station.suspended);
  const daysLeft = diffDays(todayStart(), parseDate(station.expireDate) ?? todayStart());
  return {
    ...station,
    status,
    statusLabel: STATUS_LABEL[status],
    daysLeft
  };
}

// ---------- 查询 ----------

export function listStations(keyword = '', brand = '', status = '') {
  const data = loadStations();
  let rows = data.stations.map(decorate);
  const kw = String(keyword || '').trim().toLowerCase();
  if (kw) {
    rows = rows.filter(s =>
      s.code.toLowerCase().includes(kw) ||
      s.name.toLowerCase().includes(kw) ||
      s.manager.toLowerCase().includes(kw) ||
      s.phone.toLowerCase().includes(kw)
    );
  }
  if (brand) rows = rows.filter(s => (s.brands || []).includes(brand));
  if (status) rows = rows.filter(s => s.status === status);
  rows.sort((a, b) => a.expireDate.localeCompare(b.expireDate));
  return rows;
}

/**
 * 维修网点对外查询（严格匹配：网点编号 + 授权负责人）
 * 返回 { ok, code, message, station? }
 */
export function queryStation(code, manager) {
  const data = loadStations();
  const c = String(code || '').trim();
  const m = String(manager || '').trim();
  if (!c || !m) {
    return { ok: false, reason: 'invalid_input', message: '请输入网点编号和授权负责人' };
  }
  const station = data.stations.find(s => s.code.toLowerCase() === c.toLowerCase());
  if (!station) {
    return { ok: false, reason: 'not_found', message: `未查询到网点编号「${c}」的授权记录，请核对编号` };
  }
  if (station.manager.trim() !== m) {
    return { ok: false, reason: 'manager_mismatch', message: '授权负责人与备案信息不一致，请核对姓名' };
  }
  const decorated = decorate(station);
  if (decorated.status === STATUS.SUSPENDED) {
    return { ok: false, reason: 'suspended', message: '该网点授权已被停用 / 注销，暂不能承接售后维修业务', station: decorated };
  }
  if (decorated.status === STATUS.EXPIRED) {
    return { ok: false, reason: 'expired', message: '该网点授权已到期，请联系上级服务商或总部续期', station: decorated };
  }
  return { ok: true, reason: 'ok', message: '授权信息查询成功', station: decorated };
}

export function getStation(id) {
  const data = loadStations();
  return data.stations.find(s => s.id === id) || null;
}

// ---------- 写操作（总部后台） ----------

function genId() {
  return 'S' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function createStation(input) {
  const data = loadStations();
  const code = String(input.code || '').trim();
  if (!code) throw httpError(400, '网点编号不能为空');
  if (data.stations.some(s => s.code.toLowerCase() === code.toLowerCase())) {
    throw httpError(409, `网点编号「${code}」已存在`);
  }
  const station = normalizeInput({
    id: genId(),
    code,
    name: '',
    manager: '',
    phone: '',
    region: '',
    address: '',
    brands: [],
    parentProvider: '',
    startDate: '',
    expireDate: '',
    suspended: false,
    remark: '',
    createdAt: nowISO(),
    updatedAt: nowISO()
  }, input);
  data.stations.push(station);
  saveStations(data);
  return decorate(station);
}

export function updateStation(id, input) {
  const data = loadStations();
  const idx = data.stations.findIndex(s => s.id === id);
  if (idx === -1) throw httpError(404, '授权记录不存在');
  if (input.code && input.code.trim().toLowerCase() !== data.stations[idx].code.toLowerCase()) {
    if (data.stations.some(s => s.id !== id && s.code.toLowerCase() === input.code.trim().toLowerCase())) {
      throw httpError(409, `网点编号「${input.code.trim()}」已被占用`);
    }
  }
  data.stations[idx] = normalizeInput({ ...data.stations[idx], updatedAt: nowISO() }, input);
  saveStations(data);
  return decorate(data.stations[idx]);
}

export function deleteStation(id) {
  const data = loadStations();
  const before = data.stations.length;
  data.stations = data.stations.filter(s => s.id !== id);
  if (data.stations.length === before) throw httpError(404, '授权记录不存在');
  saveStations(data);
  return true;
}

/** 续期：在当前到期日（或今天，取较晚者）基础上顺延 months 个月 */
export function renewStation(id, months = 12, unsuspend = false) {
  const data = loadStations();
  const idx = data.stations.findIndex(s => s.id === id);
  if (idx === -1) throw httpError(404, '授权记录不存在');
  const s = data.stations[idx];
  const baseEnd = parseDate(s.expireDate);
  const base = baseEnd && baseEnd > todayStart() ? baseEnd : todayStart();
  base.setMonth(base.getMonth() + Number(months));
  s.expireDate = fmtDate(base);
  if (unsuspend) s.suspended = false;
  s.updatedAt = nowISO();
  data.stations[idx] = s;
  saveStations(data);
  return decorate(s);
}

function normalizeInput(base, input) {
  const str = v => String(v ?? '').trim();
  const out = { ...base };
  if (input.code !== undefined) out.code = str(input.code).toUpperCase();
  if (input.name !== undefined) out.name = str(input.name);
  if (input.manager !== undefined) out.manager = str(input.manager);
  if (input.phone !== undefined) out.phone = str(input.phone);
  if (input.region !== undefined) out.region = str(input.region);
  if (input.address !== undefined) out.address = str(input.address);
  if (input.parentProvider !== undefined) out.parentProvider = str(input.parentProvider);
  if (input.startDate !== undefined) out.startDate = str(input.startDate);
  if (input.expireDate !== undefined) out.expireDate = str(input.expireDate);
  if (input.remark !== undefined) out.remark = str(input.remark);
  if (input.suspended !== undefined) out.suspended = Boolean(input.suspended);
  if (input.brands !== undefined) {
    out.brands = Array.isArray(input.brands)
      ? [...new Set(input.brands.map(str).filter(Boolean))]
      : str(input.brands).split(/[,，、\s]+/).filter(Boolean);
  }
  if (!out.name) out.name = out.code ? `${out.code} 授权维修站` : out.name;
  return out;
}

// ---------- 统计 ----------

export function dashboard() {
  const rows = listStations();
  const summary = { total: rows.length, active: 0, expiring: 0, expired: 0, suspended: 0 };
  for (const r of rows) summary[r.status] += 1;
  // 到期提醒：30 天内到期（含已过期），按到期日升序
  const reminders = rows
    .filter(r => r.status === STATUS.EXPIRING || r.status === STATUS.EXPIRED)
    .sort((a, b) => a.expireDate.localeCompare(b.expireDate));
  const brands = [...new Set(rows.flatMap(r => r.brands))].sort();
  return {
    today: fmtDate(todayStart()),
    warnDays: WARN_DAYS,
    summary,
    reminders,
    brands
  };
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
