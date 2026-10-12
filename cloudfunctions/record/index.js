/**
 * 云函数 record · 签到记录管理（仅管理员可调用）
 *
 * action:
 *   list    记录列表（按课程 / 班级 / 学号 / 课程名关键字筛选，分页）
 *   update  修改记录（可改课程与身份信息；签到采集数据不可改）
 *   remove  删除记录
 *   options 筛选项（课程下拉、班级下拉）
 *
 * 设计说明：
 *   - 管理员可改课程、学号、姓名、班级，但**不可改**签到时采集的时间、距离、
 *     经纬度、设备 ID。这样既满足"支持修改签到记录"，又保证原始签到事实不可篡改。
 *   - 若把记录的课程改成另一门课，需要重新校验"同课程同设备仅 1 次"，否则修改
 *     操作会绕过该业务约束。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { withHandler, ok, CODE, BizError, assert } = require('./common/response');
const { requireAdmin } = require('./common/auth');
const { str, toInt, normalizePage, isDuplicateKeyError } = require('./common/utils');

const db = cloud.database();
const _ = db.command;
const RECORDS = 'records';

/** 记录列表 */
async function listRecords(event) {
  const { page, size, skip } = normalizePage(event, 20);
  const courseId = str(event.courseId);
  const className = str(event.className);
  const keyword = str(event.keyword);
  const sno = str(event.sno);

  const where = {};
  if (courseId) where.courseId = courseId;
  if (className) where.className = className;
  if (sno) where.sno = sno;
  if (keyword) {
    const reg = db.RegExp({ regexp: keyword, options: 'i' });
    Object.assign(where, _.or([{ name: reg }, { sno: reg }, { className: reg }]));
  }

  const coll = db.collection(RECORDS);
  const [countRes, listRes] = await Promise.all([
    coll.where(where).count(),
    coll.where(where).orderBy('signTime', 'desc').skip(skip).limit(size).get()
  ]);

  return ok({
    list: listRes.data,
    total: countRes.total,
    page,
    pageSize: size,
    hasMore: skip + listRes.data.length < countRes.total
  });
}

/**
 * 修改记录
 * 仅允许修改 courseId / sno / name / className 四项，其余字段忽略。
 */
async function updateRecord(event, operatorOpenid) {
  const id = str(event.id || event._id);
  assert(id, CODE.PARAM_ERROR, '缺少记录 ID');

  const existedRes = await db.collection(RECORDS).doc(id).get();
  const existed = existedRes.data;
  assert(existed, CODE.NO_DATA, '记录不存在');

  const patch = { updateTime: new Date(), operator: operatorOpenid };

  // 修改课程：需要校验目标课程存在，并重新检查唯一约束
  let targetCourseId = existed.courseId;
  if (event.courseId !== undefined && str(event.courseId)) {
    targetCourseId = str(event.courseId);
    if (targetCourseId !== existed.courseId) {
      let course = null;
      try {
        const c = await db.collection('courses').doc(targetCourseId).get();
        course = c.data;
      } catch (e) {
        course = null;
      }
      assert(course, CODE.PARAM_ERROR, '目标课程不存在');

      // 目标课程下该设备是否已有签到记录（排除自身）
      const conflict = await db
        .collection(RECORDS)
        .where({ courseId: targetCourseId, deviceId: existed.deviceId, _id: _.neq(id) })
        .limit(1)
        .get();
      assert(
        !(conflict.data && conflict.data.length),
        CODE.DUPLICATE,
        '目标课程下该设备已有签到记录，修改后会违反"同课程同设备仅签到 1 次"的约束'
      );
      patch.courseId = targetCourseId;
    }
  }

  // 修改学号时同步姓名与班级（保持与名单一致），也允许显式覆盖
  if (event.sno !== undefined && str(event.sno)) {
    const newSno = str(event.sno);
    if (newSno !== existed.sno) {
      const stu = await db.collection('users').where({ sno: newSno }).limit(1).get();
      assert(stu.data && stu.data.length, CODE.PARAM_ERROR, '该学号不在学生名单中');
      patch.sno = stu.data[0].sno;
      patch.name = str(event.name) || stu.data[0].name;
      patch.className = str(event.className) || stu.data[0].className || '';
    }
  }
  // 显式修改姓名 / 班级
  if (event.name !== undefined && str(event.name) && patch.name === undefined) {
    patch.name = str(event.name);
  }
  if (event.className !== undefined && patch.className === undefined) {
    patch.className = str(event.className);
  }

  // 只更新了姓名或班级，没有改课程，也需要落库
  try {
    await db.collection(RECORDS).doc(id).update({ data: patch });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new BizError(CODE.DUPLICATE, '修改后与已有记录冲突：同课程同设备仅能存在 1 条记录');
    }
    throw err;
  }

  return ok(Object.assign({}, existed, patch), '记录已更新');
}

/** 删除记录 */
async function removeRecord(event) {
  const id = str(event.id || event._id);
  assert(id, CODE.PARAM_ERROR, '缺少记录 ID');
  const existed = await db.collection(RECORDS).doc(id).get();
  assert(existed.data, CODE.NO_DATA, '记录不存在');
  await db.collection(RECORDS).doc(id).remove();
  return ok({ removedId: id }, '记录已删除');
}

/** 记录详情 */
async function recordDetail(event) {
  const id = str(event.id || event._id);
  assert(id, CODE.PARAM_ERROR, '缺少记录 ID');
  const res = await db.collection(RECORDS).doc(id).get();
  assert(res.data, CODE.NO_DATA, '记录不存在');
  return ok(res.data);
}

/** 筛选项：课程列表 + 班级列表 */
async function options() {
  const [coursesRes, usersRes] = await Promise.all([
    db.collection('courses').field({ name: true, status: true }).orderBy('createTime', 'desc').limit(100).get(),
    db.collection('users').field({ className: true }).limit(1000).get()
  ]);
  const classSet = Object.create(null);
  (usersRes.data || []).forEach((d) => {
    if (d.className) classSet[d.className] = true;
  });
  return ok({
    courses: (coursesRes.data || []).map((c) => ({ _id: c._id, name: c.name, status: c.status })),
    classes: Object.keys(classSet).sort()
  });
}

exports.main = withHandler(async (event) => {
  const action = event.action;
  const { openid } = await requireAdmin();

  switch (action) {
    case 'list':
      return listRecords(event);
    case 'detail':
      return recordDetail(event);
    case 'update':
      return updateRecord(event, openid);
    case 'remove':
      return removeRecord(event);
    case 'options':
      return options();
    default:
      throw new BizError(CODE.PARAM_ERROR, '不支持的操作：' + (action || '(空)'));
  }
});
