/**
 * 新增 / 编辑课程（P05）
 *
 * 关键设计：签到点位通过 wx.chooseLocation 选取，经纬度由地图返回后自动填充、
 * 不允许手工输入。这样保证"管理员选点"与"学生定位"处于同一坐标系（gcj02），
 * 避免手工填错坐标导致距离计算错误。
 */
const { api } = require('../../../../utils/api');
const { chooseLocation } = require('../../../../utils/location');
const { showError, toastOk, confirm, toast } = require('../../../../utils/helper');

const DEFAULT_RADIUS = 50;

Page({
  data: {
    isEdit: false,
    courseId: '',
    saving: false,
    radiusPresets: [30, 50, 80, 100, 200],
    form: {
      name: '',
      teacher: '',
      locationName: '',
      latitude: null,
      longitude: null,
      radius: DEFAULT_RADIUS,
      status: 1
    }
  },

  onLoad(options) {
    if (options && options.courseId) {
      this.setData({ isEdit: true, courseId: options.courseId });
      wx.setNavigationBarTitle({ title: '编辑课程' });
      this.loadDetail(options.courseId);
    } else {
      wx.setNavigationBarTitle({ title: '新增课程' });
    }
  },

  async loadDetail(courseId) {
    try {
      const c = await api.courseDetail(courseId);
      this.setData({
        form: {
          name: c.name || '',
          teacher: c.teacher || '',
          locationName: c.locationName || '',
          latitude: typeof c.latitude === 'number' ? c.latitude : null,
          longitude: typeof c.longitude === 'number' ? c.longitude : null,
          radius: c.radius || DEFAULT_RADIUS,
          status: c.status === 0 ? 0 : 1
        }
      });
    } catch (err) {
      showError(err);
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onPickRadius(e) {
    this.setData({ 'form.radius': Number(e.currentTarget.dataset.value) });
  },

  onStatusChange(e) {
    this.setData({ 'form.status': e.detail.value ? 1 : 0 });
  },

  /** 地图选点 */
  async onChooseLocation() {
    try {
      const loc = await chooseLocation();
      this.setData({
        'form.latitude': loc.latitude,
        'form.longitude': loc.longitude,
        // 地点名称优先用地图返回的 POI 名称，用户可再修改
        'form.locationName': this.data.form.locationName || loc.name || loc.address || ''
      });
      toast('已选择点位', 'success', 1000);
    } catch (err) {
      if (err && err.canceled) return;
      showError(err);
    }
  },

  /** 表单校验 */
  validate() {
    const f = this.data.form;
    if (!String(f.name || '').trim()) {
      toast('请填写课程名称');
      return null;
    }
    if (f.latitude === null || f.longitude === null) {
      toast('请点击地图选择签到点位');
      return null;
    }
    const radius = parseInt(f.radius, 10);
    if (isNaN(radius) || radius < 1 || radius > 10000) {
      toast('距离阈值需在 1 ~ 10000 米之间');
      return null;
    }
    return {
      name: String(f.name).trim(),
      teacher: String(f.teacher || '').trim(),
      locationName: String(f.locationName || '').trim(),
      latitude: f.latitude,
      longitude: f.longitude,
      radius,
      status: f.status
    };
  },

  async onSave() {
    if (this.data.saving) return;
    const payload = this.validate();
    if (!payload) return;

    this.setData({ saving: true });
    try {
      if (this.data.isEdit) {
        await api.courseUpdate(Object.assign({ courseId: this.data.courseId }, payload));
        toastOk('已保存');
      } else {
        const res = await api.courseCreate(payload);
        if (res && res.nameDuplicated) {
          toast('已创建，注意已存在同名课程', 'none', 2200);
        } else {
          toastOk('创建成功');
        }
      }
      setTimeout(() => wx.navigateBack(), 700);
    } catch (err) {
      showError(err);
    } finally {
      this.setData({ saving: false });
    }
  },

  async onDelete() {
    const yes = await confirm('确定要删除该课程吗？删除后不可恢复。', '删除确认');
    if (!yes) return;
    try {
      const res = await api.courseRemove(this.data.courseId);
      if (res && res.relatedRecords > 0) {
        toast(`已删除。原有 ${res.relatedRecords} 条签到记录仍保留`, 'none', 3000);
      } else {
        toastOk('已删除');
      }
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      showError(err);
    }
  }
});
