/**
 * 修改签到记录（P08）
 *
 * 权限边界：课程 / 学号 / 姓名 / 班级可改，签到采集数据（时间、距离、经纬度、设备）
 * 只读。若改课程，云端会重新校验"同课程同设备仅签到 1 次"的唯一约束。
 */
const { api } = require('../../../../utils/api');
const { showError, confirm, toastOk, toast, formatTime, formatDistance } = require('../../../../utils/helper');

Page({
  data: {
    recordId: '',
    saving: false,
    courseIds: [],
    courseNames: [],
    courseIndex: 0,
    record: {},
    form: {
      courseId: '',
      sno: '',
      name: '',
      className: ''
    }
  },

  async onLoad(options) {
    const id = (options && options.id) || '';
    if (!id) {
      toast('缺少记录参数');
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ recordId: id });
    await Promise.all([this.loadOptions(), this.loadDetail(id)]);
  },

  /** 加载课程下拉 + 记录详情 */
  async loadOptions() {
    try {
      const res = await api.recordOptions();
      const courses = res.courses || [];
      this.setData({
        courseIds: courses.map((c) => c._id),
        courseNames: courses.map((c) => (c.status === 1 ? c.name : c.name + '（已停用）'))
      });
    } catch (err) {
      console.warn('加载课程列表失败:', err);
    }
  },

  async loadDetail(id) {
    try {
      const r = await api.recordDetail(id);
      const idx = this.data.courseIds.indexOf(r.courseId);
      this.setData({
        courseIndex: idx >= 0 ? idx : 0,
        record: {
          signTimeText: formatTime(r.signTime),
          distanceText: formatDistance(r.distance),
          coordText:
            typeof r.latitude === 'number' && typeof r.longitude === 'number'
              ? r.latitude + ', ' + r.longitude
              : '-',
          deviceId: r.deviceId || '',
          deviceIdShort: r.deviceId ? r.deviceId.slice(0, 12) + '…' : '-',
          deviceFingerprint: r.deviceFingerprint || '',
          operator: r.operator || '',
          operatorShort: r.operator ? r.operator.slice(-6) : '',
          updateTimeText: r.updateTime ? formatTime(r.updateTime) : ''
        },
        form: {
          courseId: r.courseId || '',
          sno: r.sno || '',
          name: r.name || '',
          className: r.className || ''
        }
      });
    } catch (err) {
      showError(err);
    }
  },

  onCourseChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      courseIndex: idx,
      'form.courseId': this.data.courseIds[idx] || ''
    });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  async onSave() {
    if (this.data.saving) return;
    const f = this.data.form;

    if (!f.courseId) {
      toast('请选择所属课程');
      return;
    }
    if (!String(f.sno || '').trim()) {
      toast('请填写学号');
      return;
    }

    this.setData({ saving: true });
    try {
      await api.recordUpdate({
        id: this.data.recordId,
        courseId: f.courseId,
        sno: String(f.sno).trim(),
        name: String(f.name || '').trim(),
        className: String(f.className || '').trim()
      });
      toastOk('已保存');
      setTimeout(() => wx.navigateBack(), 700);
    } catch (err) {
      showError(err);
    } finally {
      this.setData({ saving: false });
    }
  },

  async onDelete() {
    const yes = await confirm(
      '确定要删除这条签到记录吗？\n删除后该设备可以重新签到该课程。',
      '删除确认'
    );
    if (!yes) return;
    try {
      await api.recordRemove(this.data.recordId);
      toastOk('已删除');
      setTimeout(() => wx.navigateBack(), 700);
    } catch (err) {
      showError(err);
    }
  }
});
