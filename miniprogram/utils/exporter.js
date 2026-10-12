/**
 * Excel 导出辅助
 *
 * 云函数生成 Excel 后上传到云存储并返回 fileID，这里负责下载到本地临时文件并打开。
 * 打开后微信会提供"转发给好友 / 用其他应用打开 / 保存到手机"等操作，
 * 满足任务书"导出签到记录为 Excel 文件"的需求。
 */
const { api } = require('./api');
const { toast } = require('./helper');

/** 从 fileID 中取出可读的文件名 */
function fileNameFromFileID(fileID, fallback) {
  if (!fileID) return fallback || '导出文件.xlsx';
  const parts = String(fileID).split('/');
  const last = parts[parts.length - 1] || '';
  return last || fallback || '导出文件.xlsx';
}

/**
 * 导出并打开签到记录
 * @param {object} params { courseId, className }
 * @returns {Promise<{count:number, fileName:string}>}
 */
async function exportAndOpen(params) {
  const res = await api.exportRecords(params || {});

  wx.showLoading({ title: '正在下载文件', mask: true });
  let tempFilePath = '';
  try {
    const dl = await new Promise((resolve, reject) => {
      wx.cloud.downloadFile({
        fileID: res.fileID,
        success: resolve,
        fail: reject
      });
    });
    tempFilePath = dl.tempFilePath;
  } finally {
    wx.hideLoading();
  }

  const fileName = res.fileName || fileNameFromFileID(res.fileID);

  await new Promise((resolve, reject) => {
    wx.openDocument({
      filePath: tempFilePath,
      fileType: 'xlsx',
      showMenu: true, // 显示右上角菜单，支持转发与保存
      success: resolve,
      fail: reject
    });
  });

  if (res.tip) {
    toast(res.tip, 'none', 2500);
  }
  return { count: res.count, fileName };
}

module.exports = { exportAndOpen };
