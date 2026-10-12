/**
 * 学生首页 · 课程选择（P10）
 *
 * 只展示管理员**启用**的课程（status === 1）。
 * 已在本地记录过的课程标记为"已签到"——这只是界面提示，真正的拦截在云端：
 * 即便本地缓存被清除，signIn 云函数仍会返回 ALREADY_SIGNED。
 */
const { api } = require('../../../utils/api');
const { showError, confirm } = require('../../../utils/helper');

const SIGNED_KEY = 'signin_signed_courses';

Page({
  data: {
    session: {},
    deviceIdShort: '',
    list: [],
    loading: true
  },

  onLoad() {
    const app = getApp();
    const session = app.getSession();
    if (!session || session.role !== 'student') {
      wx.redirectTo({ url: '/pages/student/login/login' });
      return;
    }
    this.setData({
      session,
      deviceIdShort: app.getShortDeviceId()
    });
  },

  onShow() {
    this.loadCourses();
  },

  onPullDownRefresh() {
    this.loadCourses().then(() => wx.stopPullDownRefresh());
  },

  /** 读取本地已签到标记 */
  getSignedMap() {
    try {
      return wx.getStorageSync(SIGNED_KEY) || {};
    } catch (e) {
      return {};
    }
  },

  async loadCourses() {
    this.setData({ loading: true });
    try {
      const res = await api.courseList(true);
      const signed = this.getSignedMap();
      const list = (res.list || []).map((c) => ({
        _id: c._id,
        name: c.name,
        teacher: c.teacher || '',
        locationName: c.locationName || '',
        signed: !!signed[c._id]
      }));
      this.setData({ list });
    } catch (err) {
      showError(err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onSignIn(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/student/signin/signin?courseId=${id}&courseName=${encodeURIComponent(name || '')}`
    });
  },

  async onLogout() {
    const yes = await confirm('确定要退出登录吗？\n设备标识会保留在本机。');
    if (!yes) return;
    // 只清除登录态，保留设备 ID，防止通过退出登录重置签到次数限制
    getApp().clearSession();
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
