import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { DATA_FILE, SEED_FILE, MAX_LOGS } from './config.js';

let db = null;

function load() {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    copyFileSync(SEED_FILE, DATA_FILE);
  }
  try {
    db = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    throw new Error(`数据文件损坏：${err.message}。可删除 data/db.json 后重启，将自动恢复演示数据。`);
  }
  if (!Array.isArray(db.stations)) db.stations = [];
  if (!Array.isArray(db.logs)) db.logs = [];
  return db;
}

let saveTimer = null;
function persist() {
  // 同步写入，简单可靠（演示级数据量）
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

export function getAllStations() {
  return load().stations.slice();
}

export function getStationById(id) {
  return load().stations.find((s) => s.id === Number(id)) || null;
}

export function getStationByCode(code) {
  const key = String(code).trim().toUpperCase();
  return load().stations.find((s) => s.code.toUpperCase() === key) || null;
}

function nextId() {
  return load().stations.reduce((max, s) => Math.max(max, s.id || 0), 0) + 1;
}

export function addStation(data) {
  const d = load();
  const station = {
    id: nextId(),
    code: String(data.code).trim().toUpperCase(),
    name: String(data.name).trim(),
    principal: String(data.principal).trim(),
    phone: String(data.phone || '').trim(),
    brands: data.brands,
    parentProvider: String(data.parentProvider).trim(),
    openedAt: data.openedAt,
    startAt: data.startAt,
    expireAt: data.expireAt,
    remark: String(data.remark || '').trim(),
  };
  d.stations.push(station);
  persist();
  return station;
}

export function updateStation(id, data) {
  const d = load();
  const station = d.stations.find((s) => s.id === Number(id));
  if (!station) return null;
  Object.assign(station, {
    code: String(data.code).trim().toUpperCase(),
    name: String(data.name).trim(),
    principal: String(data.principal).trim(),
    phone: String(data.phone || '').trim(),
    brands: data.brands,
    parentProvider: String(data.parentProvider).trim(),
    openedAt: data.openedAt,
    startAt: data.startAt,
    expireAt: data.expireAt,
    remark: String(data.remark || '').trim(),
  });
  persist();
  return station;
}

export function deleteStation(id) {
  const d = load();
  const idx = d.stations.findIndex((s) => s.id === Number(id));
  if (idx === -1) return false;
  d.stations.splice(idx, 1);
  persist();
  return true;
}

export function addLog(entry) {
  const d = load();
  d.logs.unshift(entry);
  if (d.logs.length > MAX_LOGS) d.logs.length = MAX_LOGS;
  persist();
}

export function getLogs(limit = 100) {
  return load().logs.slice(0, Number(limit) || 100);
}

// 恢复初始演示数据
export function resetData() {
  copyFileSync(SEED_FILE, DATA_FILE);
  db = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  if (!Array.isArray(db.stations)) db.stations = [];
  if (!Array.isArray(db.logs)) db.logs = [];
  return { stations: db.stations.length, logs: db.logs.length };
}
