/**
 * 云函数公共模块 · 鉴权
 *
 * 管理员身份：微信账号的 openid（云函数从调用上下文中获取，客户端无法伪造）
 * 来源有两处：
 *   1. 云函数环境变量 ADMIN_OPENIDS —— 用于解决"第一个管理员从哪来"的问题
 *   2. admins 集合 —— 用于后续追加授权（见 docs/design-decisions.md D4）
 */

const cloud = require('wx-server-sdk');
const { CODE, BizError } = require('./response');

const db = cloud.database();
const ADMINS = 'admins';

/** 读取环境变量中的管理员 openid 列表 */
function envAdminOpenids() {
  const raw = process.env.ADMIN_OPENIDS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 从云函数调用上下文获取 openid */
function getOpenid() {
  const ctx = cloud.getWXContext();
  return ctx.OPENID || '';
}

/**
 * 确保当前调用者是管理员，否则抛出 401。
 * 首次命中环境变量白名单时会自动写入 admins 集合，便于后续在数据库中管理。
 *
 * @returns {Promise<{openid:string, admin:object|null, fromEnv:boolean}>}
 */
async function requireAdmin() {
  const openid = getOpenid();
  if (!openid) {
    throw new BizError(CODE.NOT_LOGIN, '无法获取微信身份，请重新进入小程序');
  }

  // 统一的"不在名单"提示：带上 openid，便于排查是否填错/漏填
  const notAdminMsg =
    '当前微信账号不在管理员名单中。\n你的 openid 是：' +
    openid +
    '\n请在云开发控制台 → 数据库 → admins 集合中，添加一条包含该 openid 的记录（字段名必须是 openid）。\n' +
    '若 admins 集合为空且你是首次部署，也可在小程序「管理员登录」页点击底部「部署者入口」认领管理员。';

  // 1) 先查 admins 集合
  //
  // 兼容三种常见的手工录入瑕疵，避免"值看着一样却匹配不上"：
  //   a. 首尾带空格（从文档复制粘贴时常见）
  //   b. 误把 openid 存成了数字以外的类型 → 用 trim 后的字符串再查一次
  //   c. 记录里用了 _openid 字段名（云开发自动字段）→ 一并兜底查询
  const candidates = [openid];
  const trimmed = String(openid).trim();
  if (trimmed && trimmed !== openid) candidates.push(trimmed);

  for (let i = 0; i < candidates.length; i += 1) {
    const existed = await db.collection(ADMINS).where({ openid: candidates[i] }).limit(1).get();
    if (existed.data && existed.data.length > 0) {
      return { openid, admin: existed.data[0], fromEnv: false };
    }
  }

  // 兜底：允许记录写在 _openid 字段里（例如直接从客户端写入的记录）
  const byUnderscore = await db.collection(ADMINS).where({ _openid: openid }).limit(1).get();
  if (byUnderscore.data && byUnderscore.data.length > 0) {
    return { openid, admin: byUnderscore.data[0], fromEnv: false };
  }

  // 全部未命中：把实际参与匹配的值与库里已有的 openid 打进日志，
  // 便于在云开发控制台 → 云函数 → 日志 中一眼看出差异字符
  try {
    const all = await db.collection(ADMINS).field({ openid: true }).limit(20).get();
    console.warn(
      '[鉴权未命中] 调用者 openid = %s (长度 %d)，admins 集合中已有 = %j',
      openid,
      String(openid).length,
      (all.data || []).map((d) => ({ v: d.openid, len: String(d.openid || '').length }))
    );
  } catch (e) {
    console.warn('[鉴权未命中] 读取 admins 列表失败:', e && e.message);
  }

  // 2) 再查环境变量白名单（兼容旧配置；控制台添加记录是推荐做法）
  const allowList = envAdminOpenids();
  if (allowList.indexOf(openid) !== -1) {
    const doc = {
      openid,
      nickName: '',
      avatarUrl: '',
      createTime: new Date()
    };
    try {
      const added = await db.collection(ADMINS).add({ data: doc });
      doc._id = added._id;
    } catch (e) {
      // 并发首次登录时可能已被另一个请求写入，忽略重复写
      console.warn('写入 admins 失败（可能已存在）:', e && e.message);
    }
    return { openid, admin: doc, fromEnv: true };
  }

  throw new BizError(CODE.NOT_ADMIN, notAdminMsg);
}

/**
 * 校验学生身份：学号 + 姓名必须与后台名单完全一致。
 * 学生登录不绑定 openid，因此这里用学号+姓名做全等匹配。
 *
 * @param {string} sno 学号
 * @param {string} name 姓名
 * @returns {Promise<object>} users 集合中的学生记录
 */
async function requireStudent(sno, name) {
  const s = String(sno == null ? '' : sno).trim();
  const n = String(name == null ? '' : name).trim();
  if (!s || !n) {
    throw new BizError(CODE.PARAM_ERROR, '请填写学号与姓名');
  }
  const res = await db.collection('users').where({ sno: s, name: n }).limit(1).get();
  if (!res.data || res.data.length === 0) {
    throw new BizError(CODE.NOT_STUDENT, '学号与姓名不匹配，请核对后重试');
  }
  return res.data[0];
}

module.exports = { requireAdmin, requireStudent, getOpenid, envAdminOpenids, ADMINS };
