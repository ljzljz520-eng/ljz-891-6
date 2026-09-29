// 全局配置
export const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// 总部后台登录密码（演示用。生产环境请务必通过环境变量 ADMIN_PASSWORD 覆盖）
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// 演示数据 / 运行时数据文件路径
export const DATA_FILE = new URL('../data/db.json', import.meta.url);
export const SEED_FILE = new URL('../data/seed.json', import.meta.url);

// 查询日志最多保留条数
export const MAX_LOGS = 300;
