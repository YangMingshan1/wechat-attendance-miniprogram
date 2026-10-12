/**
 * 首页 · 身份选择（P01）
 * 管理员与学生共用一套小程序，在此分流。
 */
Page({
  data: {
    deviceIdShort: ''
  },

  onLoad() {
    this.setData({ deviceIdShort: getApp().getShortDeviceId() });
  },

  /** 已有登录态时提示是否直接进入 */
  onShow() {
    const session = getApp().getSession();
    if (!session || !session.role) return;
    const isAdmin = session.role === 'admin';
    wx.showModal({
      title: '继续上次的身份？',
      content: isAdmin
        ? '你上次以管理员身份登录'
        : `你上次以学生「${session.name || session.sno}」身份登录`,
      confirmText: '继续',
      cancelText: '重新选择',
      success: (res) => {
        if (!res.confirm) {
          getApp().clearSession();
          return;
        }
        wx.redirectTo({
          url: isAdmin ? '/pages/admin/home/home' : '/pages/student/home/home'
        });
      }
    });
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/login/login' });
  },

  goStudent() {
    wx.navigateTo({ url: '/pages/student/login/login' });
  }
});
