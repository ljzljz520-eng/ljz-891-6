// ============================================================
// HTTP 服务（零依赖）：静态资源 + JSON API
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadStations, listStations, queryStation, getStation,
  createStation, updateStation, deleteStation, renewStation,
  dashboard, httpError
} from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) throw httpError(413, '请求体过大');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw httpError(400, '请求体不是合法 JSON'); }
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  // /admin -> /admin.html
  if (rel === 'admin') rel = 'admin.html';
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    // 前端路由兜底（非 API 请求一律回退 index）
    if (!pathname.startsWith('/api/')) {
      const html = await readFile(join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end(html);
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, message: '接口不存在' }));
  }
}

// ---- API 路由 ----
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const resource = parts[1] || '';
  const id = parts[2] || '';

  // 网点对外查询
  if (resource === 'query' && req.method === 'POST') {
    const body = await readBody(req);
    const result = queryStation(body.code, body.manager);
    return sendJSON(res, result.ok ? 200 : 200, result);
  }

  // 仪表盘 / 到期提醒
  if (resource === 'dashboard' && req.method === 'GET') {
    return sendJSON(res, 200, { ok: true, data: dashboard() });
  }

  // 品牌列表
  if (resource === 'brands' && req.method === 'GET') {
    const rows = listStations();
    const brands = [...new Set(rows.flatMap(r => r.brands))].sort();
    return sendJSON(res, 200, { ok: true, data: brands });
  }

  // 站点 CRUD
  if (resource === 'stations') {
    if (req.method === 'GET' && !id) {
      return sendJSON(res, 200, {
        ok: true,
        data: listStations(url.searchParams.get('q'), url.searchParams.get('brand'), url.searchParams.get('status'))
      });
    }
    if (req.method === 'POST' && !id) {
      const body = await readBody(req);
      return sendJSON(res, 201, { ok: true, message: '授权记录已创建', data: createStation(body) });
    }
    if (req.method === 'GET' && id) {
      const s = getStation(id);
      if (!s) throw httpError(404, '授权记录不存在');
      return sendJSON(res, 200, { ok: true, data: { ...s, status: undefined } });
    }
    if (req.method === 'PUT' && id) {
      const body = await readBody(req);
      return sendJSON(res, 200, { ok: true, message: '授权信息已更新', data: updateStation(id, body) });
    }
    if (req.method === 'DELETE' && id) {
      deleteStation(id);
      return sendJSON(res, 200, { ok: true, message: '授权记录已删除' });
    }
    // 续期 / 停用切换
    if (req.method === 'POST' && id === 'renew') {
      const body = await readBody(req);
      return sendJSON(res, 200, { ok: true, message: '授权续期成功', data: renewStation(body.id, body.months || 12, body.unsuspend !== false) });
    }
  }

  throw httpError(404, '接口不存在');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }
    return await serveStatic(req, res, url.pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[server error]', err);
    return sendJSON(res, status, { ok: false, message: err.message || '服务器内部错误' });
  }
});

// 首次启动确保数据文件存在
loadStations();

server.listen(PORT, () => {
  console.log('');
  console.log('  🔧 售后维修授权站系统已启动');
  console.log(`  ┌─────────────────────────────────────────────┐`);
  console.log(`  │ 网点查询页 : http://localhost:${PORT}/          │`);
  console.log(`  │ 总部后台   : http://localhost:${PORT}/admin     │`);
  console.log(`  └─────────────────────────────────────────────┘`);
  console.log('');
});
