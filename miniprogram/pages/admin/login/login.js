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
        // 非管理员账号：错误信息里已带 openid 与处理办法，直接展示
        await confirm(err.message, '无法登录');
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

  /** 开发者入口：查看 openid / 认领管理员（首次部署引导） */
  async onShowOpenid() {
    let openid = '';
    try {
      const data = await api.whoami();
      openid = data.openid || '';
    } catch (err) {
      showError(err);
      return;
    }

    if (!openid) {
      await confirm(
        '当前调用没有获取到微信身份。\n\n请确认你是从「编译运行」的小程序里点击本入口，而不是在开发者工具的云函数测试里执行。',
        '未获取到身份'
      );
      return;
    }

    const yes = await confirm(
      `你的 openid：\n${openid}\n\n` +
        '如果这是你第一次部署、且 admins 集合里还没有管理员，可以点「认领管理员」把自己加进去，' +
        '省去手工往数据库插记录。\n\n' +
        '认领入口在以下情况会自动关闭：admins 已有管理员、或配置了 ADMIN_OPENIDS 环境变量。',
      '部署者信息'
    );
    if (!yes) return;

    try {
      const res = await api.claimAdmin();
      getApp().setSession({
        role: 'admin',
        openid: res.openid,
        nickName: (res.admin && res.admin.nickName) || '管理员',
        avatarUrl: (res.admin && res.admin.avatarUrl) || ''
      });
      toast('认领成功，正在进入后台', 'success', 1500);
      setTimeout(() => wx.redirectTo({ url: '/pages/admin/home/home' }), 1000);
    } catch (err) {
      // 把云函数返回的诊断信息一并展示，便于定位"服务异常"的真实原因
      const diag = err && err.data && err.data.diagnosisSummary;
      const detail = diag && diag.length ? '\n\n集合状态：\n· ' + diag.join('\n· ') : '';
      await confirm(
        `${err.message}${detail}\n\n你的 openid：\n${openid}`,
        '无法认领'
      );
    }
  }
});
