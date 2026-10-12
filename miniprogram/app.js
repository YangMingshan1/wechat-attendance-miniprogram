/**
 * 定位签到系统 · 小程序入口
 *
 * 管理员与学生共用一套小程序，首页选择身份（任务书第一节系统概述）。
 * 使用微信云开发，所有数据操作通过云函数完成。
 */

const { getDevicePayload, getDeviceId } = require('./utils/device');

const SESSION_KEY = 'signin_session';

App({
  globalData: {
    /** 云环境是否初始化成功 */
    cloudReady: false,
    /** 当前登录身份：{ role: 'admin'|'student', ... } */
    session: null,
    /** 设备信息（设备 ID + 指纹），首次访问即生成 */
    device: null
  },

  onLaunch() {
    this.initCloud();
    this.globalData.device = getDevicePayload();
    this.restoreSession();
  },

  /** 初始化云开发环境 */
  initCloud() {
    if (!wx.cloud) {
      console.error('当前基础库版本过低，请使用 2.2.3 及以上版本的微信开发者工具');
      wx.showModal({
        title: '版本过低',
        content: '当前微信版本不支持云开发，请升级微信后重试',
        showCancel: false
      });
      return;
    }
    try {
      wx.cloud.init({
        // env 留空表示使用当前小程序的默认云环境；
        // 若你有多个环境，请把 'DYNAMIC_CURRENT_ENV' 换成具体环境 ID 字符串
        env: wx.cloud.DYNAMIC_CURRENT_ENV,
        traceUser: true
      });
      this.globalData.cloudReady = true;
      console.log('云开发初始化完成');
    } catch (e) {
      console.error('云开发初始化失败:', e);
      wx.showModal({
        title: '云环境初始化失败',
        content: '请确认已在微信开发者工具中开通云开发，并填写正确的环境 ID',
        showCancel: false
      });
    }
  },

  /** 从本地缓存恢复登录态 */
  restoreSession() {
    try {
      const s = wx.getStorageSync(SESSION_KEY);
      if (s && s.role) {
        this.globalData.session = s;
      }
    } catch (e) {
      console.warn('恢复登录态失败:', e);
    }
  },

  /** 保存登录态 */
  setSession(session) {
    this.globalData.session = session;
    try {
      wx.setStorageSync(SESSION_KEY, session);
    } catch (e) {
      console.warn('保存登录态失败:', e);
    }
  },

  /**
   * 清除登录态
   * 注意：**不清除设备 ID**。设备 ID 必须跨登录态保持，否则学生可以通过
   * "退出再登录"重置设备标识，从而绕过"同课程同设备仅签到 1 次"的约束。
   * 参见 docs/design-decisions.md D1 与 prototypes/flow.md 第五节。
   */
  clearSession() {
    this.globalData.session = null;
    try {
      wx.removeStorageSync(SESSION_KEY);
    } catch (e) {
      console.warn('清除登录态失败:', e);
    }
  },

  /** 获取当前身份，未登录返回 null */
  getSession() {
    return this.globalData.session;
  },

  /** 获取设备信息，保证一定存在 */
  getDevice() {
    if (!this.globalData.device) {
      this.globalData.device = getDevicePayload();
    }
    return this.globalData.device;
  },

  /** 供页面展示用的短设备 ID */
  getShortDeviceId() {
    const id = getDeviceId();
    return id.length > 16 ? id.slice(0, 8) + '…' + id.slice(-4) : id;
  }
});
