/**
 * 云函数 export · 导出签到记录为 Excel（仅管理员可调用）
 *
 * 流程：查询记录 → xlsx 生成 buffer → 上传云存储 → 返回 fileID
 * 小程序端拿到 fileID 后 downloadFile + openDocument 即可预览 / 转发 / 保存。
 *
 * 说明：导出的表头使用中文，字段与 docs/database-design.md 的 records 表一致。
 * 不导出任何"迟到/缺勤"等状态列（任务书边界约束）。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const XLSX = require('xlsx');

const { withHandler, ok, CODE, BizError, assert } = require('./common/response');
const { requireAdmin } = require('./common/auth');
const { str, formatTimeCN, batchNo } = require('./common/utils');

const db = cloud.database();
const RECORDS = 'records';
const MAX_EXPORT = 5000; // 单次导出上限，防止云函数超时与内存溢出
const PAGE = 100; // 云开发单次 get 上限

/** 分页拉取全部符合条件的记录 */
async function fetchAll(where) {
  const coll = db.collection(RECORDS);
  const countRes = await coll.where(where).count();
  const total = countRes.total;
  if (total === 0) return { list: [], total: 0, truncated: false };

  const limit = Math.min(total, MAX_EXPORT);
  const list = [];
  for (let skip = 0; skip < limit; skip += PAGE) {
    const res = await coll
      .where(where)
      .orderBy('signTime', 'desc')
      .skip(skip)
      .limit(Math.min(PAGE, limit - skip))
      .get();
    list.push(...res.data);
    if (!res.data.length) break;
  }
  return { list, total, truncated: total > MAX_EXPORT };
}

/** 组装二维数组（首行为表头） */
function buildRows(list, courseNameMap) {
  const header = [
    '序号',
    '课程名称',
    '学号',
    '姓名',
    '班级',
    '签到时间',
    '距点位距离(米)',
    '签到纬度',
    '签到经度',
    '设备ID'
  ];
  const rows = [header];
  list.forEach((r, i) => {
    rows.push([
      i + 1,
      courseNameMap[r.courseId] || '(课程已删除)',
      r.sno || '',
      r.name || '',
      r.className || '',
      formatTimeCN(r.signTime),
      typeof r.distance === 'number' ? r.distance : '',
      typeof r.latitude === 'number' ? r.latitude : '',
      typeof r.longitude === 'number' ? r.longitude : '',
      r.deviceId || ''
    ]);
  });
  return rows;
}

exports.main = withHandler(async (event) => {
  await requireAdmin();

  const courseId = str(event.courseId);
  const className = str(event.className);

  const where = {};
  if (courseId) where.courseId = courseId;
  if (className) where.className = className;

  const { list, total, truncated } = await fetchAll(where);
  if (total === 0) {
    throw new BizError(CODE.NO_DATA, '当前筛选条件下没有签到记录可导出');
  }

  // 课程名映射（记录里只存 courseId，导出时需要显示名称）
  const courseNameMap = Object.create(null);
  const courseIds = Array.from(new Set(list.map((r) => r.courseId).filter(Boolean)));
  for (let i = 0; i < courseIds.length; i += PAGE) {
    const chunk = courseIds.slice(i, i + PAGE);
    const res = await db.collection('courses').where({ _id: db.command.in(chunk) }).field({ name: true }).get();
    (res.data || []).forEach((c) => {
      courseNameMap[c._id] = c.name;
    });
  }

  // 生成工作表
  const rows = buildRows(list, courseNameMap);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // 列宽
  ws['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 20 },
    { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 38 }
  ];
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '签到记录');
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  // 上传云存储
  const stamp = batchNo(new Date());
  const cloudPath = `exports/签到记录_${stamp}.xlsx`;
  const upload = await cloud.uploadFile({ cloudPath, fileContent: buffer });

  const fileName = `签到记录_${stamp}.xlsx`;
  return ok(
    {
      fileID: upload.fileID,
      fileName,
      count: list.length,
      total,
      truncated,
      tip: truncated ? `记录总数 ${total} 条，已导出最近 ${MAX_EXPORT} 条` : ''
    },
    `已导出 ${list.length} 条记录`
  );
});
