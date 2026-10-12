/**
 * 签到成功结果页（P12）
 *
 * 通过 redirectTo 进入，因此页面栈中**不保留**签到页，
 * 防止学生返回后触发重复提交（重复提交也会被云端拦截，这里是双重保险）。
 */
const { formatDistance } = require('../../../../utils/helper');

Page({
  data: {
    info: {},
    distanceText: '-'
  },

  onLoad(options) {
    let info = {};
    try {
      info = JSON.parse(decodeURIComponent((options && options.data) || '{}'));
    } catch (e) {
      info = {};
    }
    this.setData({
      info,
      distanceText: formatDistance(info.distance)
    });
  },

  /** 结果页禁止返回签到页，统一回课程列表 */
  goBackHome() {
    wx.redirectTo({ url: '/pages/student/home/home' });
  },

  onUnload() {}
});
