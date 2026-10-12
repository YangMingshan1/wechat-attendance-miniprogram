/**
 * 云函数公共模块 · 通用工具
 */

/** 转正整数，失败返回默认值 */
function toInt(v, def) {
  const n = parseInt(v, 10);
  return isNaN(n) ? def : n;
}

/** 转浮点数，失败返回 null */
function toNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** 去空格字符串 */
function str(v, def) {
  if (v === null || v === undefined) return def === undefined ? '' : def;
  return String(v).trim();
}

/** 本地时间字符串 YYYY-MM-DD HH:mm:ss（云函数时区为 UTC，这里统一转为东八区） */
function formatTimeCN(date, withSeconds) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  // 云函数运行环境时区为 UTC，手动加 8 小时得到北京时间
  const cn = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  const base =
    cn.getUTCFullYear() + '-' + p(cn.getUTCMonth() + 1) + '-' + p(cn.getUTCDate()) +
    ' ' + p(cn.getUTCHours()) + ':' + p(cn.getUTCMinutes());
  return withSeconds === false ? base : base + ':' + p(cn.getUTCSeconds());
}

/** 生成导入批次号，如 20250301120000 */
function batchNo(date) {
  const d = date instanceof Date ? date : new Date();
  const cn = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return (
    '' + cn.getUTCFullYear() + p(cn.getUTCMonth() + 1) + p(cn.getUTCDate()) +
    p(cn.getUTCHours()) + p(cn.getUTCMinutes()) + p(cn.getUTCSeconds())
  );
}

/** 判断是否为"唯一索引冲突"类错误（云开发重复键错误） */
function isDuplicateKeyError(err) {
  if (!err) return false;
  const msg = String(err.errMsg || err.message || err);
  return (
    err.errCode === -501001 ||
    /duplicate key/i.test(msg) ||
    /E11000/i.test(msg) ||
    /已存在/i.test(msg) ||
    /duplicate/i.test(msg)
  );
}

/** 分页参数归一化 */
function normalizePage(event, defaultSize) {
  const page = Math.max(1, toInt(event.page, 1));
  const size = Math.min(100, Math.max(1, toInt(event.pageSize, defaultSize || 20)));
  return { page, size, skip: (page - 1) * size };
}

module.exports = {
  toInt,
  toNum,
  str,
  formatTimeCN,
  batchNo,
  isDuplicateKeyError,
  normalizePage
};
