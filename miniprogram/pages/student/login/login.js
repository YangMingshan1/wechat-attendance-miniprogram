/**
 * 学生登录（P09）
 *
 * 任务书要求：输入学号 + 姓名，与后台导入的学生名单匹配即可登录；
 * 不需要密码，不绑定微信 openid。
 *
 * 设备 ID 在首次进入小程序时已生成并持久化保存（utils/device.js），
 * 此处一并上报云端登记，作为签到去重的依据。
 */
const { api } = require('../../../utils/api');
const { toast, showError, confirm } = require('../../../utils/helper');

Page({
  data: {
    sno: '',
    name: '',
    deviceIdShort: '',
    loading: false
  },

  onLoad() {
    const app = getApp();
    this.setData({ deviceIdShort: app.getShortDeviceId() });

    // 若已有学生登录态，直接进入
    const session = app.getSession();
    if (session && session.role === 'student') {
      wx.redirectTo({ url: '/pages/student/home/home' });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  async onLogin() {
    if (this.data.loading) return;

    const sno = String(this.data.sno || '').trim();
    const name = String(this.data.name || '').trim();

    if (!sno) {
      toast('请输入学号');
      return;
    }
    if (!name) {
      toast('请输入姓名');
      return;
    }

    this.setData({ loading: true });
    try {
      const app = getApp();
      const device = app.getDevice();
      const data = await api.studentLogin(sno, name, device);

      app.setSession({
        role: 'student',
        studentRecordId: data.studentRecordId,
        sno: data.sno,
        name: data.name,
        className: data.className
      });

      toast('登录成功', 'success', 1000);
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/student/home/home' });
      }, 600);
    } catch (err) {
      if (err && err.code === 402) {
        await confirm(
          '学号与姓名不匹配，请核对后重试。\n\n如果确认信息无误，请联系管理员确认你的信息已导入学生名单。',
          '登录失败'
        );
      } else if (err && err.code === 404) {
        await confirm('管理员尚未导入学生名单，请联系任课教师。', '暂时无法登录');
      } else {
        showError(err);
      }
    } finally {
      this.setData({ loading: false });
    }
  }
});
