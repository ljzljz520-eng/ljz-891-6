// ============================================================
// 初始化演示数据
// 用法：npm run seed   （日期相对运行日生成，保证各状态随时可演示）
//
// 演示账号（网点查询页）：
//   成功：AS001 / 张伟   → 授权有效（多品牌、长有效期）
//   成功：AS002 / 李娜   → 即将到期（15 天内，出现在到期提醒）
//   失败：AS003 / 王强   → 授权已到期
//   失败：AS004 / 赵敏   → 授权已停用 / 注销
//   失败：AS999 / 张三   → 网点编号不存在
//   失败：AS001 / 李四   → 负责人不匹配
// ============================================================
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveStations, fmtDate, todayStart, WARN_DAYS } from '../server/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function shiftDate(days, base = todayStart()) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}

// 统一授权起始日：约两年前的 1 月 1 日，让数据更真实
const startBase = (() => {
  const d = todayStart();
  return fmtDate(new Date(d.getFullYear() - 2, 0, 1));
})();

const stations = [
  {
    id: 'DEMO-AS001',
    code: 'AS001',
    name: '上海浦东授权服务中心',
    manager: '张伟',
    phone: '021-5888-1001',
    region: '上海市浦东新区',
    address: '浦东新区张江高科技园区博云路 2 号 A 座 101',
    brands: ['海尔', '美的', '格力', '西门子'],
    parentProvider: '华东区一级服务商 · 上海安捷售后服务有限公司',
    startDate: startBase,
    expireDate: shiftDate(400),
    suspended: false,
    remark: '综合家电金牌服务站，支持上门维修与备件直发。',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'DEMO-AS002',
    code: 'AS002',
    name: '杭州西湖授权维修站',
    manager: '李娜',
    phone: '0571-8765-2002',
    region: '浙江省杭州市西湖区',
    address: '西湖区文三路 90 号东部软件园 3 号楼 2 层',
    brands: ['美的', '小天鹅'],
    parentProvider: '华东区一级服务商 · 浙江佳维技术服务有限公司',
    startDate: startBase,
    expireDate: shiftDate(15), // 15 天后到期 → 即将到期，触发提醒
    suspended: false,
    remark: `将于 ${shiftDate(15)} 到期，请尽快发起续期审批。`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'DEMO-AS003',
    code: 'AS003',
    name: '广州天河授权维修点',
    manager: '王强',
    phone: '020-3899-3003',
    region: '广东省广州市天河区',
    address: '天河区天河路 208 号粤海天河城大厦 1506 室',
    brands: ['格力'],
    parentProvider: '华南区一级服务商 · 广州精诚电器服务有限公司',
    startDate: startBase,
    expireDate: shiftDate(-40), // 40 天前已过期
    suspended: false,
    remark: '授权已过期，续期资料提交中，暂不可派单。',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'DEMO-AS004',
    code: 'AS004',
    name: '成都武侯授权服务站',
    manager: '赵敏',
    phone: '028-8544-4004',
    region: '四川省成都市武侯区',
    address: '武侯区人民南路四段 12 号来福士广场 T2 写字楼 8 层',
    brands: ['海尔', '卡萨帝'],
    parentProvider: '西南区一级服务商 · 成都恒信家电维修有限公司',
    startDate: startBase,
    expireDate: shiftDate(120), // 未到期但已被停用
    suspended: true,
    remark: '因客诉考核不达标，自本月起暂停授权，整改后恢复。',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'DEMO-AS005',
    code: 'AS005',
    name: '北京朝阳旗舰服务中心',
    manager: '陈晨',
    phone: '010-6588-5005',
    region: '北京市朝阳区',
    address: '朝阳区建国路 89 号华贸中心 18 层',
    brands: ['西门子', '博世', '松下'],
    parentProvider: '华北大区服务商 · 北京中维联合售后服务有限公司',
    startDate: startBase,
    expireDate: shiftDate(25), // 25 天后到期 → 同样触发提醒
    suspended: false,
    remark: '高端外资品牌重点站，建议到期前 60 天启动续期。',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'DEMO-AS006',
    code: 'AS006',
    name: '武汉江汉授权维修站',
    manager: '刘洋',
    phone: '027-8277-6006',
    region: '湖北省武汉市江汉区',
    address: '江汉区解放大道 688 号武汉国际广场 B 座 1208',
    brands: ['TCL', '海信'],
    parentProvider: '华中区一级服务商 · 武汉众联电器技术服务有限公司',
    startDate: startBase,
    expireDate: shiftDate(720),
    suspended: false,
    remark: '彩电 / 黑电专项服务站。',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

saveStations({ version: 1, updatedAt: new Date().toISOString(), stations });

console.log('');
console.log('  ✅ 初始化数据已写入 data/stations.json');
console.log(`     共 ${stations.length} 个网点，今日：${fmtDate(todayStart())}，到期提醒阈值：${WARN_DAYS} 天`);
console.log('');
console.log('  ┌───────────────────────────────────────────────────────────┐');
console.log('  │ 演示用查询（网点编号 / 授权负责人）                         │');
console.log('  ├───────────────────────────────────────────────────────────┤');
console.log('  │ ✅ 成功  AS001 / 张伟   授权有效（400+ 天）                 │');
console.log('  │ ⚠️  成功  AS002 / 李娜   授权有效但 15 天后到期             │');
console.log('  │ ❌ 失败  AS003 / 王强   授权已到期                          │');
console.log('  │ ❌ 失败  AS004 / 赵敏   授权已停用 / 注销                   │');
console.log('  │ ❌ 失败  AS999 / 张三   网点编号不存在                      │');
console.log('  │ ❌ 失败  AS001 / 李四   授权负责人不匹配                    │');
console.log('  └───────────────────────────────────────────────────────────┘');
console.log('');
