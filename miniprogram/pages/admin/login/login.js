/**
 * 管理员授权登录（P02）
 *
 * 使用微信账号授权登录。真正的鉴权在云函数内完成：
 * openid 由云函数从调用上下文中获取（客户端无法伪造），只有在
 * admins 集合或环境变量 ADMIN_OPENIDS 白名单内的账号才能进入后台。
 */
const { api } = require('../../../utils/api');
const { toast, showError, confirm } = require('../../../utils/helper');

Page({
  data: {
    loading: false
  },

  /** 点击授权登录 */
  async onLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      let nickName = '';
      let avatarUrl = '';

      // 尝试获取微信昵称头像（新版基础库需用户主动点击触发，拒绝也不影响登录）
      try {
        const profile = await this.getUserProfile();
        if (profile) {
          nickName = profile.nickName || '';
          avatarUrl = profile.avatarUrl || '';
        }
      } catch (e) {
        console.log('未获取到用户资料，继续以 openid 身份登录');
      }

      const data = await api.adminLogin(nickName, avatarUrl);

      getApp().setSession({
        role: 'admin',
        openid: data.openid,
        nickName: data.nickName || nickName || '管理员',
        avatarUrl: data.avatarUrl || avatarUrl || ''
      });

      if (data.firstTime) {
        toast('首次登录，已加入管理员名单', 'none', 1800);
      } else {
        toast('登录成功', 'success', 1200);
      }

      setTimeout(() => {
        // 用 redirectTo，避免返回后停留在登录页
        wx.redirectTo({ url: '/pages/admin/home/home' });
      }, 700);
    } catch (err) {
      if (err && err.code === 401) {
        // 非管理员账号：给出可操作的提示
        await confirm(
          '当前微信账号不在管理员名单中。\n\n如果你是本系统的部署者，请把下面的 openid 填入云函数环境变量 ADMIN_OPENIDS 后重试；如需查看自己的 openid，可在开发者工具中调用 login 云函数的 whoami 动作。',
          '无法登录'
        );
      } else {
        showError(err);
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  /** 包装 wx.getUserProfile，用户拒绝时 reject */
  getUserProfile() {
    return new Promise((resolve, reject) => {
      if (typeof wx.getUserProfile !== 'function') {
        reject(new Error('当前基础库不支持获取用户资料'));
        return;
      }
      wx.getUserProfile({
        desc: '用于在管理后台显示您的昵称与头像',
        success: (res) => resolve(res.userInfo || null),
        fail: (err) => reject(err)
      });
    });
  },

  /** 查看本机 openid，便于部署者配置白名单 */
  async onShowOpenid() {
    try {
      const data = await api.whoami();
      await confirm(`你的 openid：\n\n${data.openid}\n\n请将其填入云函数环境变量 ADMIN_OPENIDS（多个用英文逗号分隔）。`, '开发者信息');
    } catch (err) {
      showError(err);
    }
  }
});
