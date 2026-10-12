/**
 * 定位相关工具
 *
 * 任务书要求学生端"调用微信原生位置 API 获取当前地理位置"。
 * 这里只负责取到经纬度并原样上报，**不做任何范围判断**——
 * 是否允许签到由云函数使用课程阈值裁决（见 docs/design-decisions.md D2）。
 */

/** 位置相关错误码，供页面区分处理 */
const LOCATION_ERROR = {
  DENIED: 'DENIED', // 用户拒绝授权
  SYSTEM_OFF: 'SYSTEM_OFF', // 手机定位服务未开启
  TIMEOUT: 'TIMEOUT', // 定位超时
  FAIL: 'FAIL' // 其他失败
};

/** 把 wx.getLocation 的失败信息归类 */
function classifyError(err) {
  const msg = ((err && (err.errMsg || err.message)) || '').toLowerCase();
  if (/auth deny|auth denied|authorize no response|permission denied/.test(msg)) {
    return LOCATION_ERROR.DENIED;
  }
  if (/system permission denied|location service|system.*off/.test(msg)) {
    return LOCATION_ERROR.SYSTEM_OFF;
  }
  if (/timeout/.test(msg)) {
    return LOCATION_ERROR.TIMEOUT;
  }
  return LOCATION_ERROR.FAIL;
}

/**
 * 获取当前定位
 * @returns {Promise<{latitude:number, longitude:number, accuracy:number}>}
 */
function getLocation() {
  return new Promise((resolve, reject) => {
    wx.getLocation({
      // gcj02 与 wx.chooseLocation 选点使用的坐标系一致，
      // 保证"管理员选点"与"学生定位"在同一坐标系下计算距离
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 4000,
      success: (res) => {
        resolve({
          latitude: res.latitude,
          longitude: res.longitude,
          accuracy: res.accuracy,
          altitude: res.altitude
        });
      },
      fail: (err) => {
        const e = new Error((err && err.errMsg) || '定位失败');
        e.kind = classifyError(err);
        reject(e);
      }
    });
  });
}

/**
 * 检查并引导用户开启定位权限
 * @returns {Promise<boolean>} 是否已授权
 */
function ensureLocationAuth() {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (res) => {
        const auth = (res.authSetting || {})['scope.userLocation'];
        if (auth === false) {
          // 曾经拒绝过，只能通过设置页重新开启
          wx.showModal({
            title: '需要定位权限',
            content: '签到需要获取您的位置信息，请在设置中开启"位置信息"权限',
            confirmText: '去设置',
            success: (r) => {
              if (!r.confirm) {
                resolve(false);
                return;
              }
              wx.openSetting({
                success: (s) => resolve(!!(s.authSetting || {})['scope.userLocation']),
                fail: () => resolve(false)
              });
            },
            fail: () => resolve(false)
          });
        } else {
          // 未询问过或已授权，getLocation 会自动触发授权弹窗
          resolve(true);
        }
      },
      fail: () => resolve(true)
    });
  });
}

/**
 * 打开地图选点（管理员设置签到点位）
 * @returns {Promise<{name:string, latitude:number, longitude:number}>}
 */
function chooseLocation() {
  return new Promise((resolve, reject) => {
    wx.chooseLocation({
      success: (res) => {
        resolve({
          name: res.name || res.address || '',
          address: res.address || '',
          latitude: res.latitude,
          longitude: res.longitude
        });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) {
          const e = new Error('用户取消选点');
          e.canceled = true;
          reject(e);
          return;
        }
        const e = new Error(msg || '选择位置失败');
        e.kind = classifyError(err);
        reject(e);
      }
    });
  });
}

module.exports = { getLocation, chooseLocation, ensureLocationAuth, classifyError, LOCATION_ERROR };
