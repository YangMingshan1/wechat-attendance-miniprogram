/**
 * 签到页（P11 / P13 / P14）
 *
 * 状态机说明（四个分支共用一个页面，避免返回栈混乱）：
 *   locating       正在定位并请求云端裁决
 *   outOfRange     超出距离阈值 —— 未写入记录，允许无限次重新定位
 *   alreadySigned  该设备已签到过此课程 —— 不提供任何重试入口
 *   locationError  定位权限被拒 / 系统定位未开启
 *   error          其他错误（网络、课程失效等）
 *
 * 重要：是否在允许范围内**完全由云端判定**。本页只负责取经纬度并原样上报，
 * 不做任何本地范围判断，避免客户端被篡改（docs/design-decisions.md D2）。
 */
const { api, CODE } = require('../../../utils/api');
const { getLocation, ensureLocationAuth, LOCATION_ERROR } = require('../../../utils/location');
const { toast, showError, formatTime, formatDistance } = require('../../../utils/helper');

const SIGNED_KEY = 'signin_signed_courses';

Page({
  data: {
    courseId: '',
    courseName: '',
    course: {},
    state: 'locating',
    phaseText: '正在获取定位…',
    result: {},
    errorMsg: '',
    errorTitle: '',
    needSetting: false,
    submitting: false
  },

  onLoad(options) {
    const app = getApp();
    const session = app.getSession();
    if (!session || session.role !== 'student') {
      wx.redirectTo({ url: '/pages/student/login/login' });
      return;
    }
    this.session = session;
    this.setData({
      courseId: (options && options.courseId) || '',
      courseName: decodeURIComponent((options && options.courseName) || '')
    });
    this.startSignIn();
  },

  /** 进入页面后的主流程 */
  async startSignIn() {
    if (this.data.submitting) return;
    this.setData({ state: 'locating', phaseText: '正在获取定位…', submitting: true });

    try {
      // 1. 定位授权检查（被拒时引导去设置）
      const authorized = await ensureLocationAuth();
      if (!authorized) {
        this.setData({
          state: 'locationError',
          errorTitle: '未获得定位权限',
          errorMsg: '请在设置中开启"位置信息"权限后重试',
          needSetting: true,
          submitting: false
        });
        return;
      }

      // 2. 取当前坐标
      const loc = await getLocation();

      // 3. 上报云端裁决
      this.setData({ phaseText: '正在校验签到范围…' });
      await this.submit(loc);
    } catch (err) {
      this.handleError(err);
    } finally {
      this.setData({ submitting: false });
    }
  },

  /** 调用云函数签到 */
  async submit(loc) {
    const app = getApp();
    const device = app.getDevice();
    const session = this.session;

    try {
      const data = await api.signIn({
        courseId: this.data.courseId,
        sno: session.sno,
        name: session.name,
        deviceId: device.deviceId,
        fingerprint: device.fingerprint,
        latitude: loc.latitude,
        longitude: loc.longitude
      });

      // 成功：记住该课程已签到，跳转到结果页
      this.markSigned(this.data.courseId);
      wx.redirectTo({
        url:
          '/pages/student/signin/result/result?data=' +
          encodeURIComponent(
            JSON.stringify({
              courseName: data.courseName,
              locationName: data.locationName,
              name: data.name,
              sno: data.sno,
              className: data.className,
              distance: data.distance,
              radius: data.radius,
              signTime: formatTime(data.signTime)
            })
          )
      });
    } catch (err) {
      // 业务分支：超出范围 / 已签到，都由云端返回码决定
      if (err && err.code === CODE.OUT_OF_RANGE) {
        const d = err.data || {};
        this.setData({
          state: 'outOfRange',
          result: {
            distance: d.distance,
            distanceText: formatDistance(d.distance),
            radius: d.radius,
            locationName: d.locationName || ''
          }
        });
        return;
      }
      if (err && err.code === CODE.ALREADY_SIGNED) {
        const d = err.data || {};
        this.markSigned(this.data.courseId);
        this.setData({
          state: 'alreadySigned',
          result: {
            name: d.name || '',
            sno: d.sno || '',
            signedAtText: formatTime(d.signedAt),
            distanceText: typeof d.distance === 'number' ? formatDistance(d.distance) : ''
          }
        });
        return;
      }
      if (err && err.code === CODE.NO_COURSE) {
        toast(err.message || '课程不存在或已停用', 'none', 2200);
        setTimeout(() => this.goBackHome(), 1200);
        return;
      }
      throw err;
    }
  },

  /** 统一处理定位与其他异常 */
  handleError(err) {
    const kind = err && err.kind;

    if (kind === LOCATION_ERROR.DENIED) {
      this.setData({
        state: 'locationError',
        errorTitle: '未获得定位权限',
        errorMsg: '签到需要获取您的位置，请在设置中开启"位置信息"权限',
        needSetting: true
      });
      return;
    }
    if (kind === LOCATION_ERROR.SYSTEM_OFF) {
      this.setData({
        state: 'locationError',
        errorTitle: '手机定位服务未开启',
        errorMsg: '请在手机系统设置中开启定位服务后重试',
        needSetting: false
      });
      return;
    }
    if (kind === LOCATION_ERROR.TIMEOUT) {
      this.setData({
        state: 'locationError',
        errorTitle: '定位超时',
        errorMsg: '当前环境信号较弱，请移动到开阔处后重试',
        needSetting: false
      });
      return;
    }

    this.setData({
      state: 'error',
      errorMsg: (err && err.message) || '签到失败，请稍后重试'
    });
    console.warn('[签到失败]', err);
  },

  /** 记录本地已签到标记（仅用于首页展示，不作为判定依据） */
  markSigned(courseId) {
    if (!courseId) return;
    try {
      const map = wx.getStorageSync(SIGNED_KEY) || {};
      map[courseId] = Date.now();
      wx.setStorageSync(SIGNED_KEY, map);
    } catch (e) {
      console.warn('记录本地签到标记失败:', e);
    }
  },

  onRetry() {
    this.startSignIn();
  },

  /** 引导用户打开设置页开启定位权限 */
  onOpenSetting() {
    wx.openSetting({
      success: (res) => {
        if ((res.authSetting || {})['scope.userLocation']) {
          this.startSignIn();
        } else {
          toast('仍未开启定位权限');
        }
      },
      fail: () => this.startSignIn()
    });
  },

  goBackHome() {
    wx.redirectTo({ url: '/pages/student/home/home' });
  }
});
