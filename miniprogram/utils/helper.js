/**
 * 界面与格式化工具
 */

/** 轻提示 */
function toast(title, icon, duration) {
  wx.showToast({
    title: title || '',
    icon: icon || 'none',
    duration: duration || 2000
  });
}

/** 成功提示 */
function toastOk(title) {
  wx.showToast({ title: title || '操作成功', icon: 'success', duration: 1500 });
}

/** 二次确认弹窗，返回 Promise<boolean> */
function confirm(content, title) {
  return new Promise((resolve) => {
    wx.showModal({
      title: title || '提示',
      content: content || '',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    });
  });
}

/** 信息弹窗，返回 Promise<void> */
function alert(content, title) {
  return new Promise((resolve) => {
    wx.showModal({
      title: title || '提示',
      content: content || '',
      showCancel: false,
      success: () => resolve(),
      fail: () => resolve()
    });
  });
}

/** 统一错误提示：优先展示云函数返回的 msg */
function showError(err) {
  const msg = (err && (err.message || err.errMsg)) || '操作失败，请稍后重试';
  toast(msg);
  console.warn('[业务错误]', err);
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * 格式化时间（兼容云函数返回的 Date、ISO 字符串或时间戳）
 * @param {*} v 时间值
 * @param {boolean} [withSeconds] 是否带秒，默认 true
 */
function formatTime(v, withSeconds) {
  if (!v) return '';
  let d;
  if (v instanceof Date) {
    d = v;
  } else if (typeof v === 'number') {
    d = new Date(v);
  } else {
    // 兼容 iOS：将 "2025-03-01T02:15:30.000Z" 或 "2025-03-01 10:15:30" 统一处理
    const s = String(v).replace(/-/g, '/').replace(/\.\d+Z?$/, '').replace('T', ' ').replace('Z', '');
    d = new Date(v);
    if (isNaN(d.getTime())) {
      d = new Date(s);
    }
  }
  if (isNaN(d.getTime())) return String(v);
  const base =
    d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  return withSeconds === false ? base : base + ':' + pad2(d.getSeconds());
}

/** 只取时分秒 */
function formatClock(v) {
  const full = formatTime(v);
  const parts = full.split(' ');
  return parts.length > 1 ? parts[1] : full;
}

/** 距离展示：小于 1000 米显示米，否则显示公里 */
function formatDistance(m) {
  if (typeof m !== 'number' || isNaN(m)) return '-';
  if (m < 1000) return m.toFixed(m < 100 ? 1 : 0) + ' 米';
  return (m / 1000).toFixed(2) + ' 公里';
}

/** 防抖：返回一个包装后的函数 */
function debounce(fn, wait) {
  let timer = null;
  return function () {
    const args = arguments;
    const self = this;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(self, args);
    }, wait || 400);
  };
}

/** Promise 化的 wx API 调用 */
function promisify(fn, options) {
  return new Promise((resolve, reject) => {
    fn(Object.assign({}, options || {}, { success: resolve, fail: reject }));
  });
}

module.exports = {
  toast,
  toastOk,
  confirm,
  alert,
  showError,
  formatTime,
  formatClock,
  formatDistance,
  debounce,
  promisify
};
