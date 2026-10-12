/**
 * 学生名单（P06）
 *
 * Excel 批量导入流程（见 docs/design-decisions.md D5）：
 *   wx.chooseMessageFile 选文件 → wx.cloud.uploadFile 上传 → student(import) 云端解析入库
 * 云函数返回逐行失败明细，这里弹窗展示，方便管理员核对名单。
 */
const { api } = require('../../../../utils/api');
const { showError, confirm, toast, debounce } = require('../../../../utils/helper');

const PAGE_SIZE = 20;

Page({
  data: {
    list: [],
    total: 0,
    page: 1,
    hasMore: false,
    loading: true,
    importing: false,
    keyword: ''
  },

  onLoad() {
    this.loadList(true);
    // 关键字变化后自动搜索（防抖）
    this.debouncedSearch = debounce(() => this.loadList(true), 450);
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false);
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
    this.debouncedSearch();
  },

  onSearch() {
    this.loadList(true);
  },

  onClearKeyword() {
    this.setData({ keyword: '' });
    this.loadList(true);
  },

  /**
   * 加载列表
   * @param {boolean} reset 是否重置到第一页
   */
  async loadList(reset) {
    if (this.data.loading && !reset) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const res = await api.studentList({
        page,
        pageSize: PAGE_SIZE,
        keyword: this.data.keyword
      });
      this.setData({
        list: reset ? res.list : this.data.list.concat(res.list),
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

  /** Excel 批量导入 */
  async onImport() {
    if (this.data.importing) return;

    let file = null;
    try {
      const res = await new Promise((resolve, reject) => {
        wx.chooseMessageFile({
          count: 1,
          type: 'file',
          extension: ['xlsx', 'xls'],
          success: resolve,
          fail: reject
        });
      });
      file = (res.tempFiles || [])[0];
    } catch (err) {
      // 用户取消选择，静默返回
      return;
    }

    if (!file) return;

    const name = file.name || '';
    if (!/\.(xlsx|xls)$/i.test(name)) {
      toast('请选择 .xlsx 或 .xls 格式的 Excel 文件');
      return;
    }

    this.setData({ importing: true });
    wx.showLoading({ title: '上传中', mask: true });
    try {
      // 上传到云存储，云函数再下载解析
      const cloudPath = 'imports/' + Date.now() + '_' + name;
      const up = await new Promise((resolve, reject) => {
        wx.cloud.uploadFile({
          cloudPath,
          filePath: file.path,
          success: resolve,
          fail: reject
        });
      });
      wx.hideLoading();

      const result = await api.studentImport(up.fileID);
      await this.showImportResult(result, name);
      this.loadList(true);
    } catch (err) {
      wx.hideLoading();
      showError(err);
    } finally {
      this.setData({ importing: false });
    }
  },

  /** 展示导入结果 */
  showImportResult(result, fileName) {
    const errors = result.errors || [];
    let content =
      `文件：${fileName}\n` +
      `共读取 ${result.total} 行\n` +
      `成功导入 ${result.success} 条\n` +
      `失败 ${result.failed} 条`;

    if (errors.length) {
      content += '\n\n失败明细（最多显示 10 条）：';
      errors.slice(0, 10).forEach((e) => {
        content += `\n· 第 ${e.row} 行 ${e.sno || ''} ${e.reason}`;
      });
      if (result.failed > 10) {
        content += `\n… 其余 ${result.failed - 10} 条见返回数据`;
      }
    }

    return new Promise((resolve) => {
      wx.showModal({
        title: result.failed > 0 ? '导入完成（部分失败）' : '导入完成',
        content,
        showCancel: false,
        success: () => resolve(),
        fail: () => resolve()
      });
    });
  },

  /** 删除学生 */
  async onDelete(e) {
    const { id, name } = e.currentTarget.dataset;
    const yes = await confirm(
      `确定要从名单中删除「${name}」吗？\n删除后该学生将无法用此学号登录。`,
      '删除确认'
    );
    if (!yes) return;

    try {
      await api.studentRemove(id);
      toast('已删除', 'success', 1200);
      this.loadList(true);
    } catch (err) {
      showError(err);
    }
  }
});
