/**
 * 云函数 init · 一键初始化数据库
 *
 * 职责：
 *   1. 创建全部集合
 *   2. 创建全部索引（其中 records 的复合唯一索引是业务约束的载体，必须成功）
 *   3. 把环境变量 ADMIN_OPENIDS 中的 openid 写入 admins 集合
 *
 * 调用：微信开发者工具 → 云函数 init → 云端测试，事件
 *   { "action": "setup" }
 *
 * 注意：本函数只应由部署者在初始化阶段调用。为避免被滥用，除首次初始化外，
 * 后续调用要求调用者已是管理员（见 handler 中的判断）。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { withHandler, ok, CODE, BizError } = require('./common/response');
const { requireAdmin, envAdminOpenids, getOpenid } = require('./common/auth');

const db = cloud.database();

/** 需要创建的集合 */
const COLLECTIONS = ['courses', 'users', 'records', 'admins', 'devices'];

/** 需要创建的索引 */
const INDEXES = [
  {
    collection: 'records',
    name: 'uk_course_device',
    unique: true,
    keys: [{ name: 'courseId', direction: 'asc' }, { name: 'deviceId', direction: 'asc' }],
    remark: '业务约束：同课程同设备仅 1 次签到（防并发竞态），必须建立'
  },
  {
    collection: 'records',
    name: 'idx_course_time',
    unique: false,
    keys: [{ name: 'courseId', direction: 'asc' }, { name: 'signTime', direction: 'desc' }],
    remark: '按课程查询记录、导出'
  },
  {
    collection: 'records',
    name: 'idx_sno',
    unique: false,
    keys: [{ name: 'sno', direction: 'asc' }],
    remark: '按学号查询'
  },
  {
    collection: 'users',
    name: 'uk_sno',
    unique: true,
    keys: [{ name: 'sno', direction: 'asc' }],
    remark: '学号唯一，保证登录匹配唯一并防重复导入'
  },
  {
    collection: 'courses',
    name: 'idx_status',
    unique: false,
    keys: [{ name: 'status', direction: 'asc' }],
    remark: '学生端只取启用课程'
  },
  {
    collection: 'admins',
    name: 'uk_openid',
    unique: true,
    keys: [{ name: 'openid', direction: 'asc' }],
    remark: '管理员鉴权'
  },
  {
    collection: 'devices',
    name: 'uk_device',
    unique: true,
    keys: [{ name: 'deviceId', direction: 'asc' }],
    remark: '设备审计（可选集合）'
  }
];

/** 创建集合，已存在则跳过 */
async function ensureCollection(name) {
  try {
    await db.createCollection(name);
    return { name, created: true };
  } catch (err) {
    const msg = String((err && (err.errMsg || err.message)) || '');
    // -501001 / 已存在 都视为"本来就有"
    if (/already exist/i.test(msg) || /已存在/.test(msg) || (err && err.errCode === -501001)) {
      return { name, created: false, existed: true };
    }
    return { name, created: false, error: msg };
  }
}

/** 创建索引，失败时记录原因供手工处理 */
async function ensureIndex(def) {
  try {
    await db
      .collection(def.collection)
      .createIndex({
        name: def.name,
        unique: !!def.unique,
        keys: def.keys.map((k) => ({ name: k.name, direction: k.direction }))
      });
    return { collection: def.collection, name: def.name, unique: !!def.unique, created: true };
  } catch (err) {
    const msg = String((err && (err.errMsg || err.message)) || '');
    if (/already exist/i.test(msg) || /已存在/.test(msg)) {
      return { collection: def.collection, name: def.name, unique: !!def.unique, created: false, existed: true };
    }
    return {
      collection: def.collection,
      name: def.name,
      unique: !!def.unique,
      created: false,
      needManual: true,
      keys: def.keys,
      remark: def.remark,
      error: msg
    };
  }
}

/** 只读检查：确认集合与索引是否就绪，不做任何写入 */
async function doVerify() {
  const collectionStatus = [];
  for (const name of COLLECTIONS) {
    try {
      await db.collection(name).limit(1).get();
      collectionStatus.push({ name, ready: true });
    } catch (err) {
      collectionStatus.push({ name, ready: false, error: String(err && (err.errMsg || err.message)) });
    }
  }
  return {
    collections: collectionStatus,
    indexes: INDEXES.map((d) => ({
      collection: d.collection,
      name: d.name,
      unique: !!d.unique,
      keys: d.keys,
      remark: d.remark
    })),
    note: '索引是否已生效无法通过 SDK 直接查询，请在云开发控制台 → 数据库 → 索引管理 中核对。'
  };
}

exports.main = withHandler(async (event) => {
  const action = event.action || 'setup';

  if (action === 'verify') {
    return ok(await doVerify());
  }

  if (action !== 'setup') {
    throw new BizError(CODE.PARAM_ERROR, '不支持的操作：' + action);
  }

  // ---- 首次初始化放行，之后要求管理员身份 ----
  const allowList = envAdminOpenids();
  const callerOpenid = getOpenid();
  const isFirstInit = allowList.length > 0 && allowList.indexOf(callerOpenid) !== -1;

  if (!isFirstInit) {
    // 不是环境变量白名单里的账号，则要求已是管理员
    await requireAdmin();
  }

  // 1) 建集合
  const collections = [];
  for (const name of COLLECTIONS) {
    collections.push(await ensureCollection(name));
  }

  // 2) 建索引
  const indexes = [];
  for (const def of INDEXES) {
    indexes.push(await ensureIndex(def));
  }

  // 3) 写入管理员
  let adminResult = { inserted: 0, total: 0, skipped: '环境变量 ADMIN_OPENIDS 为空' };
  if (allowList.length > 0) {
    let inserted = 0;
    for (const openid of allowList) {
      const existed = await db.collection('admins').where({ openid }).limit(1).get();
      if (existed.data && existed.data.length > 0) continue;
      try {
        await db.collection('admins').add({
          data: { openid, nickName: '', avatarUrl: '', createTime: new Date() }
        });
        inserted += 1;
      } catch (e) {
        console.warn('写入管理员失败:', e && e.message);
      }
    }
    adminResult = { inserted, total: allowList.length };
  }

  const manual = indexes.filter((i) => i.needManual);
  return ok(
    {
      collections,
      indexes,
      admins: adminResult,
      needManualIndexes: manual.length,
      tip: manual.length
        ? '有 ' + manual.length + ' 个索引未能通过 SDK 创建，请在云开发控制台 → 数据库 → 索引管理 中按 needManualIndexes 的 keys 手工创建。'
        : '全部索引创建完成。'
    },
    manual.length ? '初始化完成（部分索引需手工创建）' : '初始化完成'
  );
});
