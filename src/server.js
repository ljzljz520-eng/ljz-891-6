import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PORT, ADMIN_PASSWORD } from './config.js';
import * as store from './store.js';
import {
  decorate,
  normalizeBrands,
  normalizeName,
  isValidDate,
  todayStr,
} from './util.js';

const PUBLIC_DIR = new URL('../public/', import.meta.url);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

// 简单的内存 token（重启后台需重新登录）
const tokens = new Set();
function makeToken() {
  return 'tk_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function isAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const t = auth.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-admin-token'];
  return t && tokens.has(t);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function ok(res, data) { sendJson(res, 200, { success: true, data }); }
function fail(res, status, code, message, extra = {}) {
  sendJson(res, status, { success: false, error: { code, message, ...extra } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('JSON 格式错误')); }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function nowText() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------- 业务接口 ----------

// 网点查询（公开）
async function handleQuery(req, res) {
  const body = await readBody(req);
  const code = String(body.code || '').trim();
  const principal = String(body.principal || '').trim();
  const ip = clientIp(req);

  if (!code) {
    logQuery({ code, principal, result: 'bad_request', ip });
    return fail(res, 400, 'MISSING_CODE', '请输入网点编号');
  }
  if (!principal) {
    logQuery({ code, principal, result: 'bad_request', ip });
    return fail(res, 400, 'MISSING_PRINCIPAL', '请输入授权负责人姓名');
  }

  const station = store.getStationByCode(code);
  if (!station) {
    logQuery({ code, principal, result: 'not_found', ip });
    return fail(res, 404, 'STATION_NOT_FOUND', '未查询到该网点编号，请核对后重试');
  }

  if (normalizeName(station.principal) !== normalizeName(principal)) {
    logQuery({ code, principal, result: 'principal_mismatch', stationId: station.id, ip });
    return fail(res, 403, 'PRINCIPAL_MISMATCH', '授权负责人姓名与系统登记不符，查询被拒绝', {
      stationName: station.name,
    });
  }

  const info = decorate(station);
  if (info.status === 'expired') {
    logQuery({ code, principal, result: 'expired', stationId: station.id, ip });
    return fail(res, 403, 'AUTH_EXPIRED', `该网点授权已于 ${info.expireAt} 到期，暂不可开展授权维修业务，请联系上级服务商续期`, {
      stationName: station.name,
      expireAt: info.expireAt,
    });
  }
  if (info.status === 'pending') {
    logQuery({ code, principal, result: 'pending', stationId: station.id, ip });
    return fail(res, 403, 'AUTH_PENDING', `该网点授权将于 ${info.startAt} 起生效，当前暂不能开展授权维修业务`, {
      stationName: station.name,
      startAt: info.startAt,
    });
  }

  const data = {
    code: info.code,
    name: info.name,
    principal: info.principal,
    phone: info.phone,
    brands: info.brands,
    parentProvider: info.parentProvider,
    openedAt: info.openedAt,
    startAt: info.startAt,
    expireAt: info.expireAt,
    status: info.status,
    daysToExpire: info.daysToExpire,
  };
  logQuery({ code, principal, result: 'success', stationId: station.id, ip });
  ok(res, data);
}

function logQuery({ code, principal, result, stationId = null, ip }) {
  store.addLog({
    id: Date.now() + Math.floor(Math.random() * 1000),
    time: nowText(),
    code: code || '(空)',
    principal: principal || '(空)',
    result,
    stationId,
    ip,
  });
}

// 后台表单校验
function validateStation(body, { selfId = null } = {}) {
  const required = {
    code: '网点编号', name: '网点名称', principal: '授权负责人',
    parentProvider: '上级服务商', openedAt: '开通时间',
    startAt: '授权开始日期', expireAt: '授权到期日期',
  };
  for (const [k, label] of Object.entries(required)) {
    if (!String(body[k] ?? '').trim()) return `${label}不能为空`;
  }
  const code = String(body.code).trim().toUpperCase();
  if (!/^[A-Za-z0-9][A-Za-z0-9\-_]{1,19}$/.test(code)) {
    return '网点编号需为 2-20 位字母、数字或连字符';
  }
  const dup = store.getStationByCode(code);
  if (dup && dup.id !== Number(selfId)) return '网点编号已存在';
  for (const f of ['openedAt', 'startAt', 'expireAt']) {
    if (!isValidDate(body[f])) return `${f === 'openedAt' ? '开通时间' : f === 'startAt' ? '授权开始日期' : '授权到期日期'}格式应为 YYYY-MM-DD`;
  }
  if (body.startAt > body.expireAt) return '授权开始日期不能晚于到期日期';
  const brands = normalizeBrands(body.brands);
  if (!brands.length) return '请至少填写一个可维修品牌';
  return null;
}

function stationPayload(body) {
  return {
    code: body.code,
    name: body.name,
    principal: body.principal,
    phone: body.phone,
    brands: normalizeBrands(body.brands),
    parentProvider: body.parentProvider,
    openedAt: body.openedAt,
    startAt: body.startAt,
    expireAt: body.expireAt,
    remark: body.remark,
  };
}

// ---------- 路由 ----------

async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/query' && req.method === 'POST') return handleQuery(req, res);

  if (p === '/api/admin/login' && req.method === 'POST') {
    const body = await readBody(req);
    if (String(body.password) === ADMIN_PASSWORD) {
      const token = makeToken();
      tokens.add(token);
      return ok(res, { token });
    }
    return fail(res, 401, 'BAD_PASSWORD', '密码错误');
  }

  // 以下均需管理员登录
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return fail(res, 401, 'UNAUTHORIZED', '请先登录总部后台');

    if (p === '/api/admin/stations' && req.method === 'GET') {
      let list = store.getAllStations().map((s) => decorate(s));
      const status = url.searchParams.get('status');
      if (status) list = list.filter((s) => s.status === status);
      const kw = (url.searchParams.get('kw') || '').trim().toLowerCase();
      if (kw) {
        list = list.filter((s) =>
          [s.code, s.name, s.principal, s.parentProvider, s.brands.join(',')]
            .join(' ').toLowerCase().includes(kw));
      }
      list.sort((a, b) => a.daysToExpire - b.daysToExpire);
      const summary = buildSummary(store.getAllStations().map((s) => decorate(s)));
      return ok(res, { list, summary, today: todayStr() });
    }

    if (p === '/api/admin/stations' && req.method === 'POST') {
      const body = await readBody(req);
      const err = validateStation(body);
      if (err) return fail(res, 400, 'VALIDATION_FAILED', err);
      const station = store.addStation(stationPayload(body));
      return ok(res, decorate(station));
    }

    const m = p.match(/^\/api\/admin\/stations\/(\d+)$/);
    if (m && req.method === 'PUT') {
      const body = await readBody(req);
      if (!store.getStationById(m[1])) return fail(res, 404, 'NOT_FOUND', '网点不存在');
      const err = validateStation(body, { selfId: m[1] });
      if (err) return fail(res, 400, 'VALIDATION_FAILED', err);
      const station = store.updateStation(m[1], stationPayload(body));
      return ok(res, decorate(station));
    }
    if (m && req.method === 'DELETE') {
      if (!store.deleteStation(m[1])) return fail(res, 404, 'NOT_FOUND', '网点不存在');
      return ok(res, { id: Number(m[1]) });
    }

    const renew = p.match(/^\/api\/admin\/stations\/(\d+)\/renew$/);
    if (renew && req.method === 'POST') {
      const station = store.getStationById(renew[1]);
      if (!station) return fail(res, 404, 'NOT_FOUND', '网点不存在');
      const body = await readBody(req);
      if (!isValidDate(body.startAt) || !isValidDate(body.expireAt)) {
        return fail(res, 400, 'VALIDATION_FAILED', '请选择正确的授权起止日期');
      }
      if (body.startAt > body.expireAt) return fail(res, 400, 'VALIDATION_FAILED', '开始日期不能晚于到期日期');
      const updated = store.updateStation(renew[1], { ...station, startAt: body.startAt, expireAt: body.expireAt });
      return ok(res, decorate(updated));
    }

    if (p === '/api/admin/logs' && req.method === 'GET') {
      return ok(res, { logs: store.getLogs(url.searchParams.get('limit') || 100) });
    }

    if (p === '/api/admin/reset' && req.method === 'POST') {
      const r = store.resetData();
      return ok(res, r);
    }

    return fail(res, 404, 'NOT_FOUND', '接口不存在');
  }

  return fail(res, 404, 'NOT_FOUND', '接口不存在');
}

function buildSummary(list) {
  const count = (st) => list.filter((s) => s.status === st).length;
  return {
    total: list.length,
    active: count('active'),
    expiring: count('expiring'),
    expired: count('expired'),
    pending: count('pending'),
    expiringList: list
      .filter((s) => s.status === 'expiring')
      .map((s) => ({ id: s.id, code: s.code, name: s.name, principal: s.principal, expireAt: s.expireAt, daysToExpire: s.daysToExpire, phone: s.phone, parentProvider: s.parentProvider })),
    expiredList: list
      .filter((s) => s.status === 'expired')
      .map((s) => ({ id: s.id, code: s.code, name: s.name, principal: s.principal, expireAt: s.expireAt, daysToExpire: s.daysToExpire, phone: s.phone, parentProvider: s.parentProvider })),
  };
}

// ---------- 静态资源 ----------

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin.html';
  // 防目录穿越：解析为磁盘绝对路径后，必须仍在 public 目录内
  let fp;
  try {
    fp = fileURLToPath(new URL(pathname.slice(1), PUBLIC_DIR));
  } catch {
    res.writeHead(400); return res.end('Bad Request');
  }
  const publicRoot = fileURLToPath(PUBLIC_DIR);
  if (fp !== publicRoot && !fp.startsWith(publicRoot)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  try {
    const data = await readFile(fp);
    const dot = fp.lastIndexOf('.');
    const ext = dot >= 0 ? fp.slice(dot) : '';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p>页面不存在</p>');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) fail(res, 500, 'SERVER_ERROR', err.message || '服务器内部错误');
  }
});

server.listen(PORT, () => {
  console.log('==============================================');
  console.log('  售后维修授权站 已启动');
  console.log(`  网点查询端 : http://localhost:${PORT}/`);
  console.log(`  总部后台   : http://localhost:${PORT}/admin`);
  console.log(`  后台密码   : ${ADMIN_PASSWORD}（可用环境变量 ADMIN_PASSWORD 修改）`);
  console.log('==============================================');
});
