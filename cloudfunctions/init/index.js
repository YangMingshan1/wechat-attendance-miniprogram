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
 * 鉴权策略（解决"配置管理员之前无法初始化"的鸡生蛋问题）：
 *   1. 配置了 ADMIN_OPENIDS  → 必须通过管理员校验
 *   2. 配置了 INIT_TOKEN     → 可用 { "action":"setup", "setupToken":"..." } 初始化
 *   3. 两者都没配            → 放行首次初始化（此时只建空集合与索引，无业务数据）
 * 配置 ADMIN_OPENIDS 后本函数会自动收紧，无需改代码。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { withHandler, ok, CODE, BizError } = require('./common/response');
const { requireAdmin, envAdminOpenids, getOpenid } = require('./common/auth');
const { str } = require('./common/utils');

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

  // ---- 鉴权 ----
  //
  // 这里必须允许"无身份首次初始化"，否则会出现鸡生蛋死锁：
  //   初始化要写管理员 → 需要 ADMIN_OPENIDS 环境变量
  //   但环境变量还没配 → 判定为非首次初始化 → 要求管理员身份
  //   调用者没有身份（例如从云开发控制台"云端测试"触发）→ 403，永远初始化不了
  //
  // 因此采用"宽松初始化 + 事后自动收紧"的策略：
  //   1) 一旦配置了 ADMIN_OPENIDS，后续调用必须通过管理员校验（自动收紧）
  //   2) 若配置了 INIT_TOKEN，则可用令牌替代身份做首次初始化（可选）
  //   3) 两者都没配时放行——此时只创建空集合与索引，不含任何业务数据，风险可控
  const allowList = envAdminOpenids();
  const callerOpenid = getOpenid();
  const initToken = str(process.env.INIT_TOKEN);
  const providedToken = str(event.setupToken);

  let authorizedBy = '';
  if (initToken && providedToken === initToken) {
    // 方式一：初始化令牌（适合无身份的云端测试场景）
    authorizedBy = 'setupToken';
  } else if (allowList.length > 0) {
    // 方式二：环境变量已配置，必须严格校验管理员身份
    //
    // 注意：云端测试/控制台触发时拿不到调用者 openid，此时若 ADMIN_OPENIDS 的值
    // 填错了（或填的不是本人），这里必然失败且报错难懂。因此先单独判断 openid 是否为空，
    // 给出可操作的排查指引。
    if (!callerOpenid) {
      throw new BizError(
        CODE.NOT_LOGIN,
        '当前调用没有微信身份（云端测试/控制台触发时属于正常现象）。' +
          '由于已配置 ADMIN_OPENIDS，本函数要求管理员身份，因此无法执行。' +
          '解决办法：① 临时清空 init 的 ADMIN_OPENIDS 后重跑；或 ② 配置 INIT_TOKEN 并传入 setupToken；' +
          '或 ③ 在小程序里以管理员身份进入后再执行初始化。'
      );
    }
    await requireAdmin();
    authorizedBy = 'admin';
  } else if (initToken) {
    // 配了令牌但没传对
    throw new BizError(CODE.PARAM_ERROR, '初始化令牌不正确，请在调用参数中传入 setupToken');
  } else {
    // 方式三：无任何配置时放行首次初始化
    authorizedBy = 'bootstrap';
    console.warn('[init] 以 bootstrap 模式执行：尚未配置 ADMIN_OPENIDS 或 INIT_TOKEN');
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

  // 组装后续操作指引
  const nextSteps = [];
  if (allowList.length === 0) {
    nextSteps.push(
      '尚未配置 ADMIN_OPENIDS 环境变量，因此没有写入任何管理员。请把 openid 配到 login 与 init 云函数的环境变量后，重新执行一次以写入管理员。'
    );
  }
  if (authorizedBy === 'bootstrap') {
    nextSteps.push(
      '本次以 bootstrap 模式执行（无身份校验）。配置 ADMIN_OPENIDS 或 INIT_TOKEN 后，本函数会自动收紧，无需修改代码。'
    );
  }
  nextSteps.push('请在云开发控制台 → 数据库 → 索引管理 中确认 records 的唯一索引 uk_course_device 已生效。');

  return ok(
    {
      authorizedBy,
      collections,
      indexes,
      admins: adminResult,
      needManualIndexes: manual.length,
      tip: manual.length
        ? '有 ' + manual.length + ' 个索引未能通过 SDK 创建，请在云开发控制台 → 数据库 → 索引管理 中按 needManualIndexes 的 keys 手工创建。'
        : '全部索引创建完成。',
      nextSteps
    },
    manual.length ? '初始化完成（部分索引需手工创建）' : '初始化完成'
  );
});
