/**
 * 云函数 course · 课程管理（仅管理员可调用）
 *
 * action:
 *   list    课程列表（管理员端含停用；学生端传 onlyEnabled=true）
 *   detail  课程详情
 *   create  新增课程
 *   update  编辑课程
 *   remove  删除课程
 *   stats   工作台统计（课程数 / 学生数 / 记录数）
 *
 * 业务约束：一门课程只支持 1 个签到点位，因此在数据结构上 latitude / longitude
 * 就是标量字段，本函数不接受任何数组形式的点位参数。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { withHandler, ok, CODE, BizError, assert } = require('./common/response');
const { requireAdmin } = require('./common/auth');
const { isValidLatLng } = require('./common/distance');
const { str, toNum, toInt, normalizePage } = require('./common/utils');

const db = cloud.database();
const _ = db.command;
const COURSES = 'courses';
const DEFAULT_RADIUS = 50;

/** 校验并归一化课程入参 */
function normalizeCourseInput(event, isCreate) {
  const name = str(event.name);
  const teacher = str(event.teacher);
  const locationName = str(event.locationName);
  const latitude = toNum(event.latitude);
  const longitude = toNum(event.longitude);
  const radius = event.radius === undefined || event.radius === '' ? DEFAULT_RADIUS : toInt(event.radius, NaN);
  const status = event.status === undefined ? 1 : toInt(event.status, 1);

  if (isCreate || event.name !== undefined) {
    assert(name, CODE.PARAM_ERROR, '请填写课程名称');
    assert(name.length <= 50, CODE.PARAM_ERROR, '课程名称不能超过 50 个字符');
  }
  if (isCreate || event.latitude !== undefined || event.longitude !== undefined) {
    assert(
      isValidLatLng(latitude, longitude),
      CODE.PARAM_ERROR,
      '签到点位经纬度不合法，请通过地图选点重新设置'
    );
  }
  assert(!isNaN(radius) && radius >= 1 && radius <= 10000, CODE.PARAM_ERROR, '距离阈值需在 1 ~ 10000 米之间');
  assert(status === 0 || status === 1, CODE.PARAM_ERROR, '状态值不合法');

  return { name, teacher, locationName, latitude, longitude, radius, status };
}

/** 课程列表 */
async function listCourses(event) {
  const onlyEnabled = event.onlyEnabled === true;
  const keyword = str(event.keyword);

  const where = {};
  if (onlyEnabled) {
    where.status = 1;
  } else if (event.status !== undefined && event.status !== '' && event.status !== null) {
    where.status = toInt(event.status, 1);
  }
  if (keyword) {
    where.name = db.RegExp({ regexp: keyword, options: 'i' });
  }

  // 课程数量级很小，直接全量返回，避免分页带来的前端复杂度
  const res = await db
    .collection(COURSES)
    .where(where)
    .orderBy('createTime', 'desc')
    .limit(100)
    .get();

  return ok({ list: res.data, total: res.data.length });
}

/** 课程详情 */
async function courseDetail(event) {
  const id = str(event.courseId || event._id);
  assert(id, CODE.PARAM_ERROR, '缺少课程 ID');
  const res = await db.collection(COURSES).doc(id).get();
  assert(res.data, CODE.NO_DATA, '课程不存在');
  return ok(res.data);
}

/** 新增课程 */
async function createCourse(event, openid) {
  const input = normalizeCourseInput(event, true);

  // 同名课程提示（不阻断，仅返回提示信息）
  const same = await db.collection(COURSES).where({ name: input.name }).limit(1).get();

  const doc = Object.assign({}, input, {
    creatorOpenid: openid,
    createTime: new Date(),
    updateTime: new Date()
  });
  const added = await db.collection(COURSES).add({ data: doc });
  doc._id = added._id;

  return ok(
    { course: doc, nameDuplicated: !!(same.data && same.data.length) },
    same.data && same.data.length ? '已创建，注意已存在同名课程' : '课程创建成功'
  );
}

/** 编辑课程 */
async function updateCourse(event) {
  const id = str(event.courseId || event._id);
  assert(id, CODE.PARAM_ERROR, '缺少课程 ID');

  const existed = await db.collection(COURSES).doc(id).get();
  assert(existed.data, CODE.NO_DATA, '课程不存在');

  const input = normalizeCourseInput(event, false);
  const patch = { updateTime: new Date() };
  // 只更新本次显式传入的字段
  ['name', 'teacher', 'locationName', 'latitude', 'longitude', 'radius', 'status'].forEach((k) => {
    if (event[k] !== undefined) patch[k] = input[k];
  });

  await db.collection(COURSES).doc(id).update({ data: patch });
  return ok(Object.assign({}, existed.data, patch), '课程已更新');
}

/** 删除课程 */
async function removeCourse(event) {
  const id = str(event.courseId || event._id);
  assert(id, CODE.PARAM_ERROR, '缺少课程 ID');

  const existed = await db.collection(COURSES).doc(id).get();
  assert(existed.data, CODE.NO_DATA, '课程不存在');

  // 统计关联的签到记录条数，返回给前端作为二次确认的提示信息
  const related = await db.collection('records').where({ courseId: id }).count();

  await db.collection(COURSES).doc(id).remove();
  return ok({ removedCourseId: id, relatedRecords: related.total }, '课程已删除');
}

/** 工作台统计 */
async function stats() {
  const [courseCount, enabledCourseCount, userCount, recordCount] = await Promise.all([
    db.collection(COURSES).count(),
    db.collection(COURSES).where({ status: 1 }).count(),
    db.collection('users').count(),
    db.collection('records').count()
  ]);
  return ok({
    courseCount: courseCount.total,
    enabledCourseCount: enabledCourseCount.total,
    userCount: userCount.total,
    recordCount: recordCount.total
  });
}

exports.main = withHandler(async (event) => {
  const action = event.action;

  // 学生端需要读取启用课程列表，这个动作不需要管理员身份
  if (action === 'list' && event.onlyEnabled === true) {
    return listCourses(event);
  }

  const { openid } = await requireAdmin();

  switch (action) {
    case 'list':
      return listCourses(event);
    case 'detail':
      return courseDetail(event);
    case 'create':
      return createCourse(event, openid);
    case 'update':
      return updateCourse(event);
    case 'remove':
      return removeCourse(event);
    case 'stats':
      return stats();
    default:
      throw new BizError(CODE.PARAM_ERROR, '不支持的操作：' + (action || '(空)'));
  }
});
