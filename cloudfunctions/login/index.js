/**
 * 云函数 login · 管理员与学生登录
 *
 * action:
 *   adminLogin   管理员微信授权登录（校验 openid 白名单）
 *   studentLogin 学生登录（学号 + 姓名匹配后台名单）
 *   whoami       查看当前调用者 openid（部署用）
 *   claimAdmin   认领管理员（仅首次部署、admins 为空时可用）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { withHandler, ok, CODE, BizError, assert } = require('./common/response');
const {
  requireAdmin,
  requireStudent,
  getOpenid,
  envAdminOpenids,
  ADMINS
} = require('./common/auth');
const { str, isDuplicateKeyError } = require('./common/utils');

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

/**
 * 逐个探测集合的可读性，用于把"服务异常"定位到具体原因
 */
async function diagnoseCollections() {
  const names = ['admins', 'users', 'courses', 'records', 'devices'];
  const out = [];
  for (const name of names) {
    try {
      const r = await db.collection(name).count();
      out.push({ collection: name, readable: true, count: r.total });
    } catch (err) {
      out.push({
        collection: name,
        readable: false,
        error: String((err && (err.errMsg || err.message)) || err)
      });
    }
  }
  return out;
}

/**
 * 认领管理员（首次部署引导）
 *
 * 目的：解决"第一个管理员怎么产生"的问题，让部署者不用手工往数据库里插记录。
 *
 * 安全限制（三条同时满足才允许）：
 *   1. 调用者必须携带微信身份（即从真实小程序客户端发起，云端测试不行）
 *   2. admins 集合必须为空
 *   3. 未配置 ADMIN_OPENIDS 环境变量
 *
 * 满足时把当前调用者写入 admins 集合并返回其 openid。
 * 一旦 admins 非空、或配置了 ADMIN_OPENIDS，本动作即自动失效，无法被滥用。
 *
 * 错误处理：每一步数据库操作单独捕获，失败时抛出带 data.diagnosis 的业务异常，
 * 便于前端展示真正的原因，而不是笼统的"服务异常"。
 */
async function claimAdmin(event) {
  const openid = getOpenid();
  if (!openid) {
    throw new BizError(
      CODE.NOT_LOGIN,
      '无法获取微信身份。请在小程序内（不是云端测试）调用本动作。'
    );
  }

  // 安全闸门 1：环境变量已配置时禁止认领
  if (envAdminOpenids().length > 0) {
    throw new BizError(
      CODE.NOT_ADMIN,
      '已配置 ADMIN_OPENIDS 环境变量，请改用它管理管理员，认领入口已关闭。'
    );
  }

  // 支撑信息：各集合可读性（用于出错时定位）
  const diagnosis = await diagnoseCollections();
  const adminsProbe = diagnosis.filter((d) => d.collection === ADMINS)[0];
  const diagnosisSummary = diagnosis.map((d) => {
    return d.collection + ': ' + (d.readable ? '可读(' + d.count + '条)' : '不可读 - ' + d.error);
  });

  // 安全闸门 2：admins 集合必须可读，且为空
  if (!adminsProbe || !adminsProbe.readable) {
    throw new BizError(
      CODE.SYS_ERROR,
      '无法读取 admins 集合，认领失败。' +
        (adminsProbe ? '底层错误：' + adminsProbe.error + '。' : '') +
        '请确认该集合存在。你的 openid 是 ' + openid,
      { openid, diagnosis, diagnosisSummary }
    );
  }
  if (adminsProbe.count > 0) {
    throw new BizError(
      CODE.NOT_ADMIN,
      '已存在 ' + adminsProbe.count + ' 位管理员，认领入口已关闭。如需新增管理员，请直接在 admins 集合中添加记录。',
      { openid, diagnosis, diagnosisSummary }
    );
  }

  // 写入管理员
  const doc = {
    openid,
    nickName: str(event && event.nickName) || '管理员',
    avatarUrl: str(event && event.avatarUrl),
    createTime: new Date()
  };

  let added;
  try {
    added = await db.collection(ADMINS).add({ data: doc });
  } catch (err) {
    const raw = String((err && (err.errMsg || err.message)) || err);
    const dup = isDuplicateKeyError(err);
    throw new BizError(
      CODE.SYS_ERROR,
      (dup
        ? '写入管理员失败：openid 已存在（唯一索引冲突），请检查 admins 集合是否已有同 openid 的记录。'
        : '写入管理员失败：' + raw) +
        ' 你的 openid 是 ' + openid,
      { openid, diagnosis, diagnosisSummary, rawError: raw, isDuplicate: dup }
    );
  }

  doc._id = added._id;

  return ok(
    {
      openid,
      admin: doc,
      diagnosisSummary,
      tip: '已认领管理员身份。请妥善保存此 openid，之后新增管理员需在 admins 集合中手动添加。'
    },
    '认领成功'
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
    case 'claimAdmin':
      return claimAdmin(event);
    case 'diagnose':
      // 部署排障：查看各集合是否可读、管理员与用户数量
      return ok({
        openid: getOpenid() || '(无身份：说明不是从小程序端调用)',
        envAdminOpenids: envAdminOpenids(),
        collections: await diagnoseCollections()
      });
    default:
      throw new BizError(CODE.PARAM_ERROR, '不支持的操作：' + (action || '(空)'));
  }
});
