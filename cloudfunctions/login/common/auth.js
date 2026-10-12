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

  // 1) 先查 admins 集合
  const existed = await db.collection(ADMINS).where({ openid }).limit(1).get();
  if (existed.data && existed.data.length > 0) {
    return { openid, admin: existed.data[0], fromEnv: false };
  }

  // 2) 再查环境变量白名单
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

  throw new BizError(CODE.NOT_ADMIN, '当前微信账号不是管理员');
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
