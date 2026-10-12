/**
 * 云函数公共模块 · 距离计算
 *
 * 距离必须在云端计算，不能信任客户端上报的"是否在范围内"结论。
 * 参见 docs/design-decisions.md D2。
 */

const EARTH_RADIUS = 6371008.8; // 地球平均半径（米），IUGG 推荐值

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine 公式计算两点间球面距离
 *
 * 精度说明：本函数把地球当作半径 6371008.8 米的球体（IUGG 推荐平均半径）。
 * 与 WGS84 椭球模型相比存在约 0.1% 的差异（例如赤道 1 度经度：球面 111195 米
 * vs 椭球 111319 米，相差约 124 米）。在本系统的签到场景下，判定距离通常在
 * 几十到几百米量级，0.1% 的模型差异远小于手机 GPS 自身的定位误差（室外 5~15 米，
 * 室内可达数十米），因此球面模型完全够用，且避免了引入椭球换算的复杂度。
 *
 * 坐标系说明：小程序端 wx.getLocation 与 wx.chooseLocation 均使用 gcj02 坐标系，
 * 两端一致，因此计算的是同一坐标系下的相对距离，不存在坐标系转换带来的偏移问题。
 *
 * @param {number} lat1 点1纬度
 * @param {number} lng1 点1经度
 * @param {number} lat2 点2纬度
 * @param {number} lng2 点2经度
 * @returns {number} 距离（米），保留两位小数
 */
function haversine(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = EARTH_RADIUS * c;
  return Math.round(d * 100) / 100;
}

/** 判断是否为合法的经纬度数值 */
function isValidLatLng(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  // 排除 (0,0) 这种明显异常值：几内亚湾，签到场景不可能
  if (lat === 0 && lng === 0) return false;
  return true;
}

module.exports = { haversine, isValidLatLng, EARTH_RADIUS };
