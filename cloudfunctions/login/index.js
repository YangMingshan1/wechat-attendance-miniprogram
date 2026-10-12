/**
 * 云函数 login · 管理员与学生登录
 *
 * action:
 *   adminLogin   管理员微信授权登录（校验 openid 白名单）
 *   studentLogin 学生登录（学号 + 姓名匹配后台名单）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { withHandler, ok, CODE, BizError, assert } = require('./common/response');
const { requireAdmin, requireStudent, getOpenid } = require('./common/auth');
const { str } = require('./common/utils');

const db = cloud.database();

/**
 * 管理员登录
 * 鉴权逻辑全部在 requireAdmin 中：先查 admins 集合，再查环境变量 ADMIN_OPENIDS。
 * 首次以环境变量身份登录时会自动写入 admins 集合。
 */
async function adminLogin(event) {
  const { openid, admin, fromEnv } = await requireAdmin();

  // 若客户端带上了昵称头像（用户授权后可得），补写到 admins 记录上
  const nickName = str(event.nickName);
  const avatarUrl = str(event.avatarUrl);
  if (admin && admin._id && (nickName || avatarUrl)) {
    const patch = {};
    if (nickName) patch.nickName = nickName;
    if (avatarUrl) patch.avatarUrl = avatarUrl;
    try {
      await db.collection('admins').doc(admin._id).update({ data: patch });
      Object.assign(admin, patch);
    } catch (e) {
      console.warn('更新管理员资料失败:', e && e.message);
    }
  }

  return ok(
    {
      role: 'admin',
      openid,
      nickName: (admin && admin.nickName) || '',
      avatarUrl: (admin && admin.avatarUrl) || '',
      firstTime: !!fromEnv
    },
    '登录成功'
  );
}

/**
 * 学生登录
 * 不绑定 openid、不需要密码，仅校验学号 + 姓名是否在导入名单中。
 * 同时登记设备信息到 devices 集合（仅审计用途，不参与签到判定）。
 */
async function studentLogin(event) {
  const sno = str(event.sno);
  const name = str(event.name);
  const deviceId = str(event.deviceId);
  const fingerprint = str(event.fingerprint);
  const platform = str(event.platform);

  assert(sno, CODE.PARAM_ERROR, '请输入学号');
  assert(name, CODE.PARAM_ERROR, '请输入姓名');

  // 名单为空时给出更明确的提示
  const total = await db.collection('users').count();
  if (!total.total) {
    throw new BizError(CODE.NO_DATA, '管理员尚未导入学生名单');
  }

  const student = await requireStudent(sno, name);

  // 设备登记（best-effort，失败不影响登录）
  if (deviceId && event.registerDevice !== false) {
    try {
      const existed = await db.collection('devices').where({ deviceId }).limit(1).get();
      if (existed.data && existed.data.length > 0) {
        await db.collection('devices').doc(existed.data[0]._id).update({
          data: { lastSeen: new Date(), platform: platform || existed.data[0].platform }
        });
      } else {
        await db.collection('devices').add({
          data: {
            deviceId,
            fingerprint: fingerprint || '',
            platform: platform || '',
            firstSeen: new Date(),
            lastSeen: new Date()
          }
        });
      }
    } catch (e) {
      console.warn('登记设备失败:', e && e.message);
    }
  }

  return ok(
    {
      role: 'student',
      studentRecordId: student._id,
      sno: student.sno,
      name: student.name,
      className: student.className || ''
    },
    '登录成功'
  );
}

exports.main = withHandler(async (event) => {
  const action = event.action;

  switch (action) {
    case 'adminLogin':
      return adminLogin(event);
    case 'studentLogin':
      return studentLogin(event);
    case 'whoami':
      // 仅供部署者查看自己的 openid，用于配置环境变量 ADMIN_OPENIDS
      return ok({ openid: getOpenid() });
    default:
      throw new BizError(CODE.PARAM_ERROR, '不支持的操作：' + (action || '(空)'));
  }
});
