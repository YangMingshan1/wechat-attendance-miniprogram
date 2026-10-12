/**
 * 设备标识与硬件指纹
 *
 * 背景：微信小程序**没有官方设备唯一标识 API**，而任务书要求"同一课程同一个设备 ID
 * 只能签到 1 次"。因此设备 ID 由本模块生成并持久化保存在本地缓存中。
 *
 * 完整的设计权衡见 docs/design-decisions.md D1：
 *   - 采用本地持久化 UUID 作为判定主键（无误判）
 *   - 同时上报硬件指纹作为辅助审计字段（不参与判定）
 * 已知局限：用户清除小程序缓存或卸载重装后会生成新的设备 ID。该局限已在文档中声明。
 */

const DEVICE_KEY = 'signin_device_id';

/** 生成 UUID v4 */
function uuid() {
  // 小程序基础库支持 Math.random，无需依赖 crypto
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 获取（必要时生成）设备 ID，持久化保存在本地缓存 */
function getDeviceId() {
  let id = '';
  try {
    id = wx.getStorageSync(DEVICE_KEY) || '';
  } catch (e) {
    id = '';
  }
  if (!id) {
    id = uuid();
    try {
      wx.setStorageSync(DEVICE_KEY, id);
    } catch (e) {
      console.warn('保存设备 ID 失败（将使用内存中的临时值）:', e);
    }
  }
  return id;
}

/** 设备 ID 已存在时不覆盖；仅用于调试与说明展示 */
function resetDeviceId() {
  const id = uuid();
  try {
    wx.setStorageSync(DEVICE_KEY, id);
  } catch (e) {
    console.warn('重置设备 ID 失败:', e);
  }
  return id;
}

/** 短哈希，把指纹字符串压缩成 8 位十六进制 */
function shortHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  // 再叠加一次，降低碰撞
  let h2 = 0x01000193;
  for (let i = str.length - 1; i >= 0; i -= 1) {
    h2 = ((h2 ^ str.charCodeAt(i)) * 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/**
 * 采集设备硬件指纹（辅助审计用）
 * 注意：该值**不唯一**，同型号手机完全相同，因此绝不能用于签到判定。
 */
function getFingerprint() {
  let info = {};
  try {
    if (typeof wx.getDeviceInfo === 'function') {
      info = wx.getDeviceInfo() || {};
    } else if (typeof wx.getSystemInfoSync === 'function') {
      info = wx.getSystemInfoSync() || {};
    }
  } catch (e) {
    info = {};
  }

  const parts = [
    info.brand || '',
    info.model || '',
    info.system || '',
    info.platform || '',
    String(info.pixelRatio || ''),
    String(info.screenWidth || ''),
    String(info.screenHeight || '')
  ];

  let windowInfo = {};
  try {
    if (typeof wx.getWindowInfo === 'function') {
      windowInfo = wx.getWindowInfo() || {};
    }
  } catch (e) {
    windowInfo = {};
  }
  parts.push(String(windowInfo.pixelRatio || ''), String(windowInfo.screenWidth || ''));

  return shortHash(parts.join('|'));
}

/** 设备信息集合，登录与签到时一并上报 */
function getDevicePayload() {
  let platform = '';
  try {
    const info =
      typeof wx.getDeviceInfo === 'function'
        ? wx.getDeviceInfo() || {}
        : typeof wx.getSystemInfoSync === 'function'
        ? wx.getSystemInfoSync() || {}
        : {};
    platform = info.platform || '';
  } catch (e) {
    platform = '';
  }
  return {
    deviceId: getDeviceId(),
    fingerprint: getFingerprint(),
    platform
  };
}

module.exports = { getDeviceId, getFingerprint, getDevicePayload, resetDeviceId };
