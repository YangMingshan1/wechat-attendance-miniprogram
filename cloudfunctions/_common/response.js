/**
 * 云函数公共模块 · 统一返回体与错误码
 *
 * 本文件被复制到每个云函数目录下（见 docs/design-decisions.md D6 的说明）。
 * 微信云开发的每个云函数都独立打包部署，无法直接引用上级目录的公共代码，
 * 因此在"单一公共包 + 构建步骤"与"每函数自带一份副本"之间选择了后者：
 * 免构建、可直接上传部署，代价是修改公共代码后需要同步到各函数目录。
 */

/** 业务错误码 */
const CODE = {
  OK: 0,
  PARAM_ERROR: 400,
  NOT_ADMIN: 401,
  NOT_STUDENT: 402,
  NOT_LOGIN: 403,
  OUT_OF_RANGE: 410,
  ALREADY_SIGNED: 411,
  NO_COURSE: 412,
  DUPLICATE: 413,
  NO_DATA: 404,
  SYS_ERROR: 500
};

/** 错误码对应的人工可读说明，用于日志排查 */
const CODE_MSG = {
  0: '成功',
  400: '参数不合法',
  401: '当前微信账号不是管理员',
  402: '学号与姓名不匹配',
  403: '未登录',
  404: '数据不存在',
  410: '不在允许的签到范围内',
  411: '该设备已签到过此课程',
  412: '课程不存在或已停用',
  413: '数据已存在',
  500: '服务异常'
};

/**
 * 构造统一成功返回体
 * @param {*} data 业务数据
 * @param {string} [msg] 自定义提示
 */
function ok(data, msg) {
  return { code: CODE.OK, msg: msg || '成功', data: data === undefined ? null : data };
}

/**
 * 构造统一失败返回体
 * 注意：返回体是给前端的结构化结果，不抛出异常，避免云函数以 error 形式返回导致前端拿到
 * 难以解析的错误对象。真正的异常由 withHandler 统一捕获。
 * @param {number} code 错误码，取自 CODE
 * @param {string} [msg] 自定义提示
 * @param {*} [data] 附加数据（如失败明细）
 */
function fail(code, msg, data) {
  return { code: code, msg: msg || CODE_MSG[code] || '操作失败', data: data === undefined ? null : data };
}

/** 抛出携带错误码的业务异常，由 withHandler 捕获后转为 fail 返回体 */
class BizError extends Error {
  constructor(code, msg, data) {
    super(msg || CODE_MSG[code] || '业务异常');
    this.name = 'BizError';
    this.code = code;
    this.data = data === undefined ? null : data;
  }
}

/** 断言：条件不成立时抛出业务异常 */
function assert(condition, code, msg, data) {
  if (!condition) {
    throw new BizError(code, msg, data);
  }
}

/**
 * 云函数入口的统一包装器
 * 负责：异常捕获、统一返回体、耗时日志
 *
 * @param {(event:object, context:object)=>Promise<*>} fn 业务处理函数
 * @returns {(event:object, context:object)=>Promise<object>} 云函数 main 函数
 */
function withHandler(fn) {
  return async function main(event, context) {
    const startedAt = Date.now();
    const action = (event && event.action) || '(none)';
    try {
      const result = await fn(event || {}, context || {});
      // 允许业务函数直接返回完整返回体（已含 code 字段）
      const body = result && typeof result === 'object' && typeof result.code === 'number'
        ? result
        : ok(result);
      console.log(`[OK] action=${action} cost=${Date.now() - startedAt}ms`);
      return body;
    } catch (err) {
      if (err instanceof BizError) {
        console.warn(`[BIZ] action=${action} code=${err.code} msg=${err.message} cost=${Date.now() - startedAt}ms`);
        return fail(err.code, err.message, err.data);
      }
      console.error(`[ERR] action=${action} cost=${Date.now() - startedAt}ms`, err);
      return fail(CODE.SYS_ERROR, '服务异常，请稍后重试');
    }
  };
}

module.exports = { CODE, CODE_MSG, ok, fail, BizError, assert, withHandler };
