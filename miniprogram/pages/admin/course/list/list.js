/**
 * 课程列表（P04）
 */
const { api } = require('../../../../utils/api');
const { showError, confirm, toastOk, toast } = require('../../../../utils/helper');

Page({
  data: {
    list: [],
    loading: true
  },

  onShow() {
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const res = await api.courseList(false);
      this.setData({ list: res.list || [] });
    } catch (err) {
      showError(err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onCreate() {
    wx.navigateTo({ url: '/pages/admin/course/edit/edit' });
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/admin/course/edit/edit?courseId=' + id });
  },

  /** 启用 / 停用 */
  async onToggle(e) {
    const { id, status } = e.currentTarget.dataset;
    const next = Number(status) === 1 ? 0 : 1;
    const word = next === 1 ? '启用' : '停用';
    const yes = await confirm(`确定要${word}该课程吗？` + (next === 0 ? '\n停用后学生端将不再显示该课程。' : ''));
    if (!yes) return;

    try {
      await api.courseUpdate({ courseId: id, status: next });
      toastOk(word + '成功');
      this.loadList();
    } catch (err) {
      showError(err);
    }
  },

  /** 删除课程 */
  async onDelete(e) {
    const { id, name } = e.currentTarget.dataset;
    const yes = await confirm(`确定要删除课程「${name}」吗？\n删除后不可恢复。`, '删除确认');
    if (!yes) return;

    try {
      const res = await api.courseRemove(id);
      if (res && res.relatedRecords > 0) {
        toast(`已删除。该课程原有 ${res.relatedRecords} 条签到记录仍保留在数据库中`, 'none', 3000);
      } else {
        toastOk('已删除');
      }
      this.loadList();
    } catch (err) {
      showError(err);
    }
  }
});
