/**
 * 云函数 signIn · 学生定位签到 ★ 核心业务
 *
 * 这是**唯一允许学生角色调用**的云函数，职责刻意保持单一，便于安全审计。
 *
 * 执行顺序（每一步都是必要的）：
 *   1. 参数校验（学号、姓名、经纬度、设备 ID）
 *   2. 校验学生身份与后台名单一致（防止伪造请求）
 *   3. 查课程是否存在且启用
 *   4. 快路径去重：该课程 + 该设备是否已有签到记录
 *   5. 云端计算距离，与课程阈值比对（距离绝不由客户端判定）
 *   6. 写入记录；若被数据库唯一索引拒绝，同样返回"已签到"
 *
 * 第 6 步是"无例外"的真正保障：并发请求下"先查后写"会失效，只有数据库唯一索引
 * 是并发安全的。索引 uk_course_device 见 cloudfunctions/init/index.js。
 *
 * 边界约束：本函数不包含任何时间比较逻辑（无签到时间段），不写入任何状态字段
 * （无迟到 / 缺勤），不发送任何订阅消息（无消息推送）。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { withHandler, ok, CODE, BizError, assert } = require('./common/response');
const { requireStudent } = require('./common/auth');
const { haversine, isValidLatLng } = require('./common/distance');
const { str, isDuplicateKeyError } = require('./common/utils');

const db = cloud.database();
const RECORDS = 'records';
const COURSES = 'courses';

/** 查询已存在的签到记录（快路径） */
async function findExistedRecord(courseId, deviceId) {
  const res = await db
    .collection(RECORDS)
    .where({ courseId, deviceId })
    .limit(1)
    .get();
  return (res.data && res.data[0]) || null;
}

/** 组装"已签到"的返回体，把原签到信息回给前端展示 */
function alreadySignedResult(record, course) {
  return {
    code: CODE.ALREADY_SIGNED,
    msg: '您已完成该课程的签到，不可重复签到',
    data: {
      status: 'ALREADY_SIGNED',
      signedAt: record.signTime,
      distance: record.distance,
      courseName: (course && course.name) || '',
      name: record.name,
      sno: record.sno
    }
  };
}

exports.main = withHandler(async (event) => {
  const courseId = str(event.courseId);
  const sno = str(event.sno);
  const name = str(event.name);
  const deviceId = str(event.deviceId);
  const fingerprint = str(event.fingerprint);
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);

  // ---- 1. 参数校验 ----
  assert(courseId, CODE.PARAM_ERROR, '缺少课程信息');
  assert(deviceId, CODE.PARAM_ERROR, '缺少设备标识，请重新进入小程序');
  assert(deviceId.length <= 64, CODE.PARAM_ERROR, '设备标识不合法');
  assert(
    isValidLatLng(latitude, longitude),
    CODE.PARAM_ERROR,
    '定位数据不合法，请重新定位后再试'
  );

  // ---- 2. 校验学生身份 ----
  const student = await requireStudent(sno, name);

  // ---- 3. 校验课程 ----
  let course = null;
  try {
    const res = await db.collection(COURSES).doc(courseId).get();
    course = res.data;
  } catch (e) {
    course = null;
  }
  if (!course) {
    throw new BizError(CODE.NO_COURSE, '课程不存在或已被删除');
  }
  if (course.status !== 1) {
    throw new BizError(CODE.NO_COURSE, '该课程已停用，无法签到');
  }
  assert(
    isValidLatLng(course.latitude, course.longitude),
    CODE.NO_COURSE,
    '课程尚未设置有效的签到点位，请联系管理员'
  );

  // ---- 4. 快路径去重 ----
  const existed = await findExistedRecord(courseId, deviceId);
  if (existed) {
    return alreadySignedResult(existed, course);
  }

  // ---- 5. 云端计算距离并裁决 ----
  const distance = haversine(latitude, longitude, course.latitude, course.longitude);
  const radius = Number(course.radius) > 0 ? Number(course.radius) : 50;

  if (distance > radius) {
    // 超范围：不写入任何记录，前端可重新定位后重试
    return {
      code: CODE.OUT_OF_RANGE,
      msg: '当前位置距离签到点位 ' + distance + ' 米，超出允许范围 ' + radius + ' 米',
      data: {
        status: 'OUT_OF_RANGE',
        distance,
        radius,
        locationName: course.locationName || '',
        courseName: course.name
      }
    };
  }

  // ---- 6. 写入记录（唯一索引兜底） ----
  const record = {
    courseId,
    sno: student.sno,
    name: student.name,
    className: student.className || '',
    deviceId,
    deviceFingerprint: fingerprint || '',
    latitude,
    longitude,
    distance,
    signTime: new Date(),
    operator: '',
    updateTime: null
  };

  try {
    const added = await db.collection(RECORDS).add({ data: record });
    record._id = added._id;
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      // 并发场景：两个请求几乎同时通过了第 4 步，第二个在这里被唯一索引拒绝
      console.warn('唯一索引拦截了并发重复签到:', courseId, deviceId);
      const again = await findExistedRecord(courseId, deviceId);
      return alreadySignedResult(again || record, course);
    }
    throw err;
  }

  return ok(
    {
      status: 'SUCCESS',
      recordId: record._id,
      courseName: course.name,
      locationName: course.locationName || '',
      name: student.name,
      sno: student.sno,
      className: student.className || '',
      distance,
      radius,
      signTime: record.signTime
    },
    '签到成功'
  );
});
