/**
 * 管理员工作台（P03）
 */
const { api } = require('../../../utils/api');
const { showError, confirm } = require('../../../utils/helper');
const { exportAndOpen } = require('../../../utils/exporter');

Page({
  data: {
    session: {},
    stats: {
      courseCount: 0,
      enabledCourseCount: 0,
      userCount: 0,
      recordCount: 0
    },
    loading: false
  },

  onLoad() {
    const session = getApp().getSession();
    if (!session || session.role !== 'admin') {
      wx.redirectTo({ url: '/pages/admin/login/login' });
      return;
    }
    this.setData({ session });
  },

  onShow() {
    this.loadStats();
  },

  onPullDownRefresh() {
    this.loadStats().then(() => wx.stopPullDownRefresh());
  },

  async loadStats() {
    try {
      const stats = await api.stats();
      this.setData({ stats });
    } catch (err) {
      // 401 表示登录态已失效（例如 admins 记录被删除）
      if (err && err.code === 401) {
        getApp().clearSession();
        wx.redirectTo({ url: '/pages/admin/login/login' });
        return;
      }
      showError(err);
    }
  },

  goCourses() {
    wx.navigateTo({ url: '/pages/admin/course/list/list' });
  },

  goStudents() {
    wx.navigateTo({ url: '/pages/admin/student/list/list' });
  },

  goRecords() {
    wx.navigateTo({ url: '/pages/admin/record/list/list' });
  },

  /** 导出全部签到记录 */
  async onExport() {
    if (this.data.loading) return;
    if (!this.data.stats.recordCount) {
      wx.showToast({ title: '暂无签到记录可导出', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      await exportAndOpen({});
    } catch (err) {
      showError(err);
    } finally {
      this.setData({ loading: false });
    }
  },

  async onSwitchRole() {
    const yes = await confirm('确定要退出管理员身份，返回首页重新选择吗？');
    if (!yes) return;
    getApp().clearSession();
    // 用 reLaunch 清空页面栈，避免返回到后台页面
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
