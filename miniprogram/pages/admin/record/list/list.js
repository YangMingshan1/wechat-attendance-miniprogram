/**
 * 签到记录列表（P07）
 *
 * 管理员可查看全部签到记录，支持按课程 / 班级筛选、分页、修改、删除、导出 Excel。
 * 列表只展示签到事实，不涉及任何"迟到 / 缺勤"状态（任务书边界约束）。
 */
const { api } = require('../../../../utils/api');
const { showError, confirm, toast, formatTime, formatDistance } = require('../../../../utils/helper');
const { exportAndOpen } = require('../../../../utils/exporter');

const PAGE_SIZE = 20;

Page({
  data: {
    list: [],
    total: 0,
    page: 1,
    hasMore: false,
    loading: true,
    // 筛选
    courseId: '',
    className: '',
    courseNames: ['全部课程'],
    courseIds: [''],
    courseIndex: 0,
    classNames: ['全部班级'],
    classIndex: 0
  },

  onLoad() {
    this.loadOptions();
    this.loadList(true);
  },

  onShow() {
    // 从修改页返回时刷新
    if (this.needRefresh) {
      this.needRefresh = false;
      this.loadList(true);
    }
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false);
    }
  },

  /** 加载筛选项（课程 + 班级） */
  async loadOptions() {
    try {
      const res = await api.recordOptions();
      const courses = res.courses || [];
      const classes = res.classes || [];
      this.setData({
        courseIds: [''].concat(courses.map((c) => c._id)),
        courseNames: ['全部课程'].concat(
          courses.map((c) => (c.status === 1 ? c.name : c.name + '（已停用）'))
        ),
        classNames: ['全部班级'].concat(classes),
        courseNameMap: courses.reduce((acc, c) => {
          acc[c._id] = c.name;
          return acc;
        }, {})
      });
    } catch (err) {
      console.warn('加载筛选项失败:', err);
    }
  },

  async loadList(reset) {
    if (this.data.loading && !reset) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const res = await api.recordList({
        page,
        pageSize: PAGE_SIZE,
        courseId: this.data.courseId,
        className: this.data.className
      });

      const nameMap = this.data.courseNameMap || {};
      const decorated = (res.list || []).map((r) => ({
        _id: r._id,
        courseId: r.courseId,
        courseName: nameMap[r.courseId] || '课程已删除',
        sno: r.sno,
        name: r.name,
        className: r.className,
        distance: r.distance,
        distanceText: formatDistance(r.distance),
        signTime: r.signTime,
        signTimeText: formatTime(r.signTime)
      }));

      this.setData({
        list: reset ? decorated : this.data.list.concat(decorated),
        total: res.total,
        page: res.page,
        hasMore: res.hasMore
      });
    } catch (err) {
      showError(err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onCourseChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ courseIndex: idx, courseId: this.data.courseIds[idx] || '' });
    this.loadList(true);
  },

  onClassChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      classIndex: idx,
      className: idx === 0 ? '' : this.data.classNames[idx]
    });
    this.loadList(true);
  },

  onResetFilter() {
    this.setData({ courseId: '', className: '', courseIndex: 0, classIndex: 0 });
    this.loadList(true);
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    this.needRefresh = true;
    wx.navigateTo({ url: '/pages/admin/record/edit/edit?id=' + id });
  },

  async onDelete(e) {
    const { id, name } = e.currentTarget.dataset;
    const yes = await confirm(`确定要删除「${name}」的这条签到记录吗？\n删除后该设备可以重新签到该课程。`, '删除确认');
    if (!yes) return;

    try {
      await api.recordRemove(id);
      toast('已删除', 'success', 1200);
      this.loadList(true);
    } catch (err) {
      showError(err);
    }
  },

  /** 导出当前筛选条件下的记录 */
  async onExport() {
    try {
      await exportAndOpen({
        courseId: this.data.courseId,
        className: this.data.className
      });
    } catch (err) {
      showError(err);
    }
  }
});
