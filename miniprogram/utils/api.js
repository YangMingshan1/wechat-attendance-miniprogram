/**
 * 云函数调用封装
 *
 * 小程序端**不直连数据库**，所有数据操作都通过云函数完成。
 * 原因见 docs/design-decisions.md D3：云开发默认权限模型无法表达"管理员可读写全部
 * 数据、学生不绑定 openid"的需求，且客户端计算结果不可信。
 *
 * 统一约定：云函数返回 { code, msg, data }
 *   code === 0   成功，resolve(data)
 *   code !== 0   业务失败，reject({ code, msg, data })
 */

const SUCCESS = 0;

/** 业务错误码（与 cloudfunctions/_common/response.js 保持一致） */
const CODE = {
  OK: 0,
  PARAM_ERROR: 400,
  NOT_ADMIN: 401,
  NOT_STUDENT: 402,
  NOT_LOGIN: 403,
  NO_DATA: 404,
  OUT_OF_RANGE: 410,
  ALREADY_SIGNED: 411,
  NO_COURSE: 412,
  DUPLICATE: 413,
  SYS_ERROR: 500
};

/**
 * 调用云函数
 * @param {string} name 云函数名
 * @param {string} action 业务动作
 * @param {object} [payload] 其余业务参数
 * @param {object} [options] { loading: string|false, silent: boolean }
 * @returns {Promise<*>} 成功时返回 data 字段
 */
function call(name, action, payload, options) {
  const opts = Object.assign({ loading: false, silent: false }, options || {});
  if (opts.loading) {
    wx.showLoading({ title: opts.loading, mask: true });
  }

  return wx.cloud
    .callFunction({
      name,
      data: Object.assign({ action }, payload || {})
    })
    .then((res) => {
      const body = (res && res.result) || {};
      if (typeof body.code !== 'number') {
        // 云函数返回体异常（例如部署失败、函数不存在）
        const err = new Error('云函数返回格式异常：' + name);
        err.code = CODE.SYS_ERROR;
        throw err;
      }
      if (body.code !== SUCCESS) {
        const err = new Error(body.msg || '操作失败');
        err.code = body.code;
        err.data = body.data;
        throw err;
      }
      return body.data === undefined ? null : body.data;
    })
    .catch((err) => {
      // 网络层错误（callFunction 本身失败）
      if (err && typeof err.code !== 'number') {
        const msg = (err && err.errMsg) || '';
        if (/timeout/i.test(msg)) {
          err.code = CODE.SYS_ERROR;
          err.message = '请求超时，请检查网络后重试';
        } else if (/FunctionName/i.test(msg) || /not found/i.test(msg)) {
          err.code = CODE.SYS_ERROR;
          err.message = '云函数未部署：' + name + '，请先在开发者工具中上传部署';
        }
      }
      throw err;
    })
    .finally(() => {
      if (opts.loading) {
        wx.hideLoading();
      }
    });
}

/** 各云函数的便捷封装 */
const api = {
  // ---------- 登录 ----------
  adminLogin(nickName, avatarUrl) {
    return call('login', 'adminLogin', { nickName, avatarUrl }, { loading: '登录中' });
  },
  studentLogin(sno, name, device) {
    return call(
      'login',
      'studentLogin',
      {
        sno,
        name,
        deviceId: device.deviceId,
        fingerprint: device.fingerprint,
        platform: device.platform
      },
      { loading: '登录中' }
    );
  },
  whoami() {
    return call('login', 'whoami');
  },
  /** 认领管理员：仅首次部署、admins 集合为空时可用 */
  claimAdmin(nickName, avatarUrl) {
    return call('login', 'claimAdmin', { nickName, avatarUrl }, { loading: '正在认领' });
  },

  // ---------- 课程 ----------
  courseList(onlyEnabled) {
    return call('course', 'list', { onlyEnabled: !!onlyEnabled });
  },
  courseDetail(courseId) {
    return call('course', 'detail', { courseId });
  },
  courseCreate(data) {
    return call('course', 'create', data, { loading: '保存中' });
  },
  courseUpdate(data) {
    return call('course', 'update', data, { loading: '保存中' });
  },
  courseRemove(courseId) {
    return call('course', 'remove', { courseId }, { loading: '删除中' });
  },
  stats() {
    return call('course', 'stats');
  },

  // ---------- 学生名单 ----------
  studentList(params) {
    return call('student', 'list', params);
  },
  studentImport(fileID) {
    return call('student', 'import', { fileID }, { loading: '导入中，请稍候' });
  },
  studentRemove(id) {
    return call('student', 'remove', { id }, { loading: '删除中' });
  },
  studentClasses() {
    return call('student', 'classes');
  },

  // ---------- 签到记录 ----------
  recordList(params) {
    return call('record', 'list', params);
  },
  recordDetail(id) {
    return call('record', 'detail', { id });
  },
  recordUpdate(data) {
    return call('record', 'update', data, { loading: '保存中' });
  },
  recordRemove(id) {
    return call('record', 'remove', { id }, { loading: '删除中' });
  },
  recordOptions() {
    return call('record', 'options');
  },

  // ---------- 签到 ----------
  signIn(data) {
    return call('signIn', '', data, { loading: '正在签到' });
  },

  // ---------- 导出 ----------
  exportRecords(params) {
    return call('export', '', params, { loading: '正在生成 Excel' });
  }
};

module.exports = { api, call, CODE };
