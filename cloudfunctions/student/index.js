/**
 * 云函数 student · 学生名单管理（仅管理员可调用）
 *
 * action:
 *   list    学生列表（分页 + 关键字）
 *   import  Excel 批量导入（解析 → 逐行校验 → 分批写入 → 返回失败明细）
 *   remove  删除单个学生
 *   classes 班级列表（用于签到记录页的筛选项）
 *
 * Excel 解析使用 xlsx(SheetJS)。导入流程见 docs/design-decisions.md D5：
 * 小程序端 chooseMessageFile → uploadFile → 本函数 downloadFile → 解析 → 写库
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const XLSX = require('xlsx');

const { withHandler, ok, CODE, BizError, assert } = require('./common/response');
const { requireAdmin } = require('./common/auth');
const { str, batchNo, normalizePage, isDuplicateKeyError } = require('./common/utils');

const db = cloud.database();
const _ = db.command;
const USERS = 'users';
const BATCH_SIZE = 100; // 每批写入条数，防止单次写入过大导致超时

/** 表头别名映射：兼容常见的中英文写法 */
const HEADER_ALIAS = {
  className: ['班级', '班级名称', '行政班', 'class', 'classname', 'class_name'],
  name: ['姓名', '学生姓名', '名字', 'name', 'studentname', 'student_name'],
  sno: ['学号', '学生学号', '编号', 'sno', 'studentid', 'student_id', 'id', 'no']
};

/** 归一化表头文本：去空格、去全角空格、转小写 */
function normHeader(h) {
  return String(h == null ? '' : h)
    .replace(/[\s\u3000]/g, '')
    .toLowerCase();
}

/**
 * 从工作表首行识别列位置
 * @returns {{className:number, name:number, sno:number}|null}
 */
function detectHeader(row) {
  const map = { className: -1, name: -1, sno: -1 };
  (row || []).forEach((cell, idx) => {
    const h = normHeader(cell);
    if (!h) return;
    Object.keys(HEADER_ALIAS).forEach((key) => {
      if (map[key] !== -1) return;
      if (HEADER_ALIAS[key].indexOf(h) !== -1) map[key] = idx;
    });
  });
  return map;
}

/** 读取单元格为去空格字符串 */
function cellStr(row, idx) {
  if (idx < 0 || !row) return '';
  const v = row[idx];
  if (v === null || v === undefined) return '';
  // 学号可能被 Excel 存成数字，转字符串时避免科学计数法
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return String(v).trim();
}

/** Excel 批量导入 */
async function importStudents(event, openid) {
  const fileID = str(event.fileID);
  assert(fileID, CODE.PARAM_ERROR, '缺少文件标识 fileID');

  // 1) 下载云存储中的文件
  let buffer;
  try {
    const dl = await cloud.downloadFile({ fileID });
    buffer = dl.fileContent;
  } catch (e) {
    console.error('下载文件失败:', e);
    throw new BizError(CODE.PARAM_ERROR, '文件下载失败，请重新上传后再试');
  }
  assert(buffer && buffer.length, CODE.PARAM_ERROR, '文件内容为空');

  // 2) 解析
  let sheetRows;
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = wb.SheetNames && wb.SheetNames[0];
    assert(firstSheetName, CODE.PARAM_ERROR, 'Excel 中没有工作表');
    sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheetName], { header: 1, blankrows: false, defval: '' });
  } catch (e) {
    console.error('解析 Excel 失败:', e);
    throw new BizError(CODE.PARAM_ERROR, 'Excel 解析失败，请确认文件格式为 .xlsx 或 .xls');
  }

  // 3) 定位表头行（允许前几行是标题说明）
  let headerIndex = -1;
  let headerMap = null;
  const scanLimit = Math.min(sheetRows.length, 10);
  for (let i = 0; i < scanLimit; i += 1) {
    const m = detectHeader(sheetRows[i]);
    if (m.className !== -1 && m.name !== -1 && m.sno !== -1) {
      headerIndex = i;
      headerMap = m;
      break;
    }
  }
  assert(
    headerMap,
    CODE.PARAM_ERROR,
    '未找到表头，请确认 Excel 第一行包含「班级」「姓名」「学号」三列'
  );

  // 4) 逐行校验
  const errors = [];
  const valid = [];
  const seenInFile = Object.create(null);
  let total = 0;

  for (let i = headerIndex + 1; i < sheetRows.length; i += 1) {
    const row = sheetRows[i];
    const className = cellStr(row, headerMap.className);
    const name = cellStr(row, headerMap.name);
    const snoRaw = cellStr(row, headerMap.sno);

    // 跳过整行空白
    if (!className && !name && !snoRaw) continue;
    total += 1;
    const rowNo = i + 1; // Excel 中的行号（1 基）

    if (!snoRaw) {
      errors.push({ row: rowNo, sno: snoRaw, name, reason: '学号为空' });
      continue;
    }
    if (!name) {
      errors.push({ row: rowNo, sno: snoRaw, reason: '姓名为空' });
      continue;
    }
    if (!className) {
      errors.push({ row: rowNo, sno: snoRaw, name, reason: '班级为空' });
      continue;
    }
    if (snoRaw.length > 30) {
      errors.push({ row: rowNo, sno: snoRaw, name, reason: '学号过长（超过 30 字符）' });
      continue;
    }
    if (seenInFile[snoRaw]) {
      errors.push({ row: rowNo, sno: snoRaw, name, reason: '文件内学号重复（首次出现在第 ' + seenInFile[snoRaw] + ' 行）' });
      continue;
    }
    seenInFile[snoRaw] = rowNo;

    valid.push({ row: rowNo, sno: snoRaw, name, className });
  }

  // 5) 过滤掉数据库中已存在的学号
  const toInsert = [];
  const snoList = valid.map((v) => v.sno);
  const existedSet = Object.create(null);
  // 分批查询已存在的学号（云开发 in 查询有长度限制）
  for (let i = 0; i < snoList.length; i += BATCH_SIZE) {
    const chunk = snoList.slice(i, i + BATCH_SIZE);
    if (!chunk.length) continue;
    const res = await db.collection(USERS).where({ sno: _.in(chunk) }).field({ sno: true }).get();
    (res.data || []).forEach((d) => {
      existedSet[d.sno] = true;
    });
  }
  valid.forEach((v) => {
    if (existedSet[v.sno]) {
      errors.push({ row: v.row, sno: v.sno, name: v.name, reason: '该学号已存在于名单中' });
    } else {
      toInsert.push(v);
    }
  });

  // 6) 分批写入
  const batch = batchNo(new Date());
  let success = 0;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const chunk = toInsert.slice(i, i + BATCH_SIZE);
    for (const item of chunk) {
      try {
        await db.collection(USERS).add({
          data: {
            sno: item.sno,
            name: item.name,
            className: item.className,
            importBatch: batch,
            createTime: new Date()
          }
        });
        success += 1;
      } catch (e) {
        // 并发导入或唯一索引冲突时，该行记为失败
        errors.push({
          row: item.row,
          sno: item.sno,
          name: item.name,
          reason: isDuplicateKeyError(e) ? '该学号已存在于名单中' : '写入失败：' + (e && e.message)
        });
      }
    }
  }

  // 7) 组装结果（失败明细最多返回 200 条，避免返回体过大）
  const failed = errors.length;
  return ok(
    {
      batch,
      total,
      success,
      failed,
      errors: errors.slice(0, 200),
      errorsTruncated: failed > 200,
      operator: openid
    },
    `导入完成：成功 ${success} 条，失败 ${failed} 条`
  );
}

/** 学生列表 */
async function listStudents(event) {
  const { page, size, skip } = normalizePage(event, 20);
  const keyword = str(event.keyword);
  const className = str(event.className);

  const where = {};
  if (className) where.className = className;
  if (keyword) {
    // 学号 / 姓名 / 班级 任一命中
    const reg = db.RegExp({ regexp: keyword, options: 'i' });
    const orCond = _.or([{ sno: reg }, { name: reg }, { className: reg }]);
    Object.assign(where, orCond);
  }

  const coll = db.collection(USERS);
  const [countRes, listRes] = await Promise.all([
    coll.where(where).count(),
    coll.where(where).orderBy('createTime', 'desc').skip(skip).limit(size).get()
  ]);

  return ok({
    list: listRes.data,
    total: countRes.total,
    page,
    pageSize: size,
    hasMore: skip + listRes.data.length < countRes.total
  });
}

/** 删除学生 */
async function removeStudent(event) {
  const id = str(event.id || event._id);
  assert(id, CODE.PARAM_ERROR, '缺少学生 ID');
  await db.collection(USERS).doc(id).remove();
  return ok({ removedId: id }, '已删除');
}

/** 班级列表（去重，用于筛选项） */
async function classList() {
  // 云开发不支持 distinct，这里取前 1000 条在前端去重（名单量级可控）
  const res = await db.collection(USERS).field({ className: true }).limit(1000).get();
  const set = Object.create(null);
  (res.data || []).forEach((d) => {
    if (d.className) set[d.className] = true;
  });
  return ok({ list: Object.keys(set).sort() });
}

exports.main = withHandler(async (event) => {
  const action = event.action;
  const { openid } = await requireAdmin();

  switch (action) {
    case 'list':
      return listStudents(event);
    case 'import':
      return importStudents(event, openid);
    case 'remove':
      return removeStudent(event);
    case 'classes':
      return classList();
    default:
      throw new BizError(CODE.PARAM_ERROR, '不支持的操作：' + (action || '(空)'));
  }
});
