#!/usr/bin/env node
/**
 * 核心业务逻辑自测脚本
 *
 * 微信小程序本身无法在 Node 环境运行，但系统的核心算法与纯函数逻辑是独立的，
 * 可以脱离微信环境直接验证。本脚本验证：
 *   1. Haversine 距离计算的正确性（对照已知距离）
 *   2. 经纬度合法性校验
 *   3. Excel 导入的表头识别逻辑（中英文别名、表头不在首行）
 *   4. 唯一键冲突错误的识别
 *   5. 分页参数归一化（防止越界）
 *   6. 北京时间格式化
 *
 * 用法（项目根目录）：node scripts/test-core.js
 */

const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function check(name, actual, expected, tolerance) {
  let ok;
  if (typeof expected === 'number' && typeof tolerance === 'number') {
    ok = Math.abs(actual - expected) <= tolerance;
  } else {
    ok = JSON.stringify(actual) === JSON.stringify(expected);
  }
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`      期望: ${JSON.stringify(expected)}`);
    console.log(`      实际: ${JSON.stringify(actual)}`);
  }
}

function checkTrue(name, cond) {
  check(name, !!cond, true);
}

// ---------------------------------------------------------------- 距离计算
console.log('\n[1] Haversine 距离计算（cloudfunctions/_common/distance.js）');
const { haversine, isValidLatLng } = require(path.join(
  __dirname, '..', 'cloudfunctions', '_common', 'distance.js'
));

// 同一点距离为 0
check('同一点距离为 0', haversine(30.5, 114.3, 30.5, 114.3), 0, 0.001);

// 纬度相差 1 度 ≈ 111.19 km（子午线弧长）
check('纬度差 1 度 ≈ 111195 米', haversine(30, 114, 31, 114), 111195, 100);

// 经度方向受 cos(纬度) 影响：北纬 60 度处经度差 1 度 ≈ 55.6 km
check('北纬 60 度经度差 1 度 ≈ 55600 米', haversine(60, 0, 60, 1), 55600, 200);

// 赤道经度差 1 度。
// 注意：本项目使用 Haversine 球面模型（R = 6371008.8 m），
// 赤道 1 度弧长 = 6371008.8 × π/180 = 111195.08 m。
// 若用 WGS84 椭球的赤道曲率半径 6378137 m，结果会是 111319.49 m。
// 两者相差约 124 m（0.11%），在 50 米的签到阈值下没有影响，
// 但对长距离会累积误差，因此这里按球面模型断言，保证测试与实现一致。
check('赤道经度差 1 度 = 111195 米（球面模型）', haversine(0, 0, 0, 1), 111195, 1);

// 近距离精度：对比球面模型与椭球模型的真实差异，验证该差异远小于阈值判定所需精度
function haversineEllipsoid(lat1, lng1, lat2, lng2) {
  // Vincenty 的简化近似：在纬度 phi 处使用卯酉圈曲率半径 N 与子午圈曲率半径 M
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const toRad = (d) => (d * Math.PI) / 180;
  const phi = toRad((lat1 + lat2) / 2);
  const sinPhi = Math.sin(phi);
  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi); // 卯酉圈曲率半径
  const M = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5); // 子午圈曲率半径
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const dx = dLng * N * Math.cos(phi);
  const dy = dLat * M;
  return Math.sqrt(dx * dx + dy * dy);
}

const nearSphere = haversine(30.512345, 114.365432, 30.512465, 114.365432);
const nearEllipsoid = haversineEllipsoid(30.512345, 114.365432, 30.512465, 114.365432);
const modelDiff = Math.abs(nearSphere - nearEllipsoid);
checkTrue(
  `近距离（${nearSphere} 米）球面与椭球模型差异 ${modelDiff.toFixed(3)} 米，远小于 50 米阈值判定精度`,
  modelDiff < 0.1
);

// 典型签到场景：约 13 米的偏移（纬度差 0.00012 度 ≈ 13.3 米）
const near = haversine(30.512345, 114.365432, 30.512465, 114.365432);
check('约 13 米的近距离计算', near, 13.34, 0.5);

// 阈值边界：距离应当与阈值可比（用于 OUT_OF_RANGE 判定）
checkTrue('近距离 < 50 米阈值', near < 50);
const far = haversine(30.512345, 114.365432, 30.515145, 114.365432);
checkTrue('约 311 米 > 50 米阈值', far > 50);
check('约 311 米的远距离计算', far, 311.3, 2);

// 对称性
check(
  '距离计算对称',
  haversine(30.1, 114.1, 30.2, 114.2).toFixed(2),
  haversine(30.2, 114.2, 30.1, 114.1).toFixed(2)
);

// ---------------------------------------------------------------- 坐标校验
console.log('\n[2] 经纬度合法性校验');
checkTrue('合法坐标通过', isValidLatLng(30.5, 114.3));
checkTrue('纬度越界被拒', !isValidLatLng(91, 114));
checkTrue('经度越界被拒', !isValidLatLng(30, 181));
checkTrue('(0,0) 被拒（几内亚湾异常值）', !isValidLatLng(0, 0));
checkTrue('字符串被拒', !isValidLatLng('30.5', '114.3'));
checkTrue('NaN 被拒', !isValidLatLng(NaN, 114));
checkTrue('undefined 被拒', !isValidLatLng(undefined, undefined));
checkTrue('边界值 90/180 通过', isValidLatLng(90, 180));

// ---------------------------------------------------------------- Excel 表头识别
console.log('\n[3] Excel 导入表头识别（cloudfunctions/student/index.js）');
const studentSrc = fs.readFileSync(
  path.join(__dirname, '..', 'cloudfunctions', 'student', 'index.js'),
  'utf8'
);

// 从源码中抽出纯函数部分进行验证（该函数不依赖 wx-server-sdk）
const headerBlock = studentSrc.match(
  /const HEADER_ALIAS = \{[\s\S]*?\n\};\n([\s\S]*?)\n\/\*\* 读取单元格/
);
if (!headerBlock) {
  console.log('  ✗ 无法从源码中提取表头识别函数');
  failed += 1;
} else {
  /* eslint-disable no-new-func */
  const factory = new Function(
    headerBlock[0].replace(/\/\*\* 读取单元格[\s\S]*$/, '') +
      '\n return { detectHeader: detectHeader };'
  );
  const { detectHeader } = factory();

  check(
    '标准中文表头',
    detectHeader(['班级', '姓名', '学号']),
    { className: 0, name: 1, sno: 2 }
  );
  check(
    '乱序中文表头按列位置识别',
    detectHeader(['学号', '班级', '姓名']),
    { className: 1, name: 2, sno: 0 }
  );
  check(
    '带多余列（序号、备注）',
    detectHeader(['序号', '班级', '姓名', '学号', '备注']),
    { className: 1, name: 2, sno: 3 }
  );
  check(
    '英文表头',
    detectHeader(['class', 'name', 'studentId']),
    { className: 0, name: 1, sno: 2 }
  );
  check(
    '大小写与空格容错',
    detectHeader([' ClassName ', 'NAME', 'Sno']),
    { className: 0, name: 1, sno: 2 }
  );
  check(
    '表头带全角空格容错',
    detectHeader(['班　级', '姓 名', '学号']),
    { className: 0, name: 1, sno: 2 }
  );
  check(
    '缺少学号列时返回 -1',
    detectHeader(['班级', '姓名']).sno,
    -1
  );
  checkTrue('完全无关的行不误判', detectHeader(['第一学期', '签到表', '2025']).sno === -1);
}

// ---------------------------------------------------------------- 唯一键冲突识别
console.log('\n[4] 唯一键冲突错误识别（决定并发去重能否生效）');
const utils = require(path.join(__dirname, '..', 'cloudfunctions', '_common', 'utils.js'));
checkTrue('识别 duplicate key 错误', utils.isDuplicateKeyError({ errMsg: 'duplicate key error' }));
checkTrue('识别 E11000', utils.isDuplicateKeyError({ message: 'E11000 duplicate key' }));
checkTrue('识别中文"已存在"', utils.isDuplicateKeyError({ errMsg: '记录已存在' }));
checkTrue('识别 errCode -501001', utils.isDuplicateKeyError({ errCode: -501001 }));
checkTrue('普通错误不误判', !utils.isDuplicateKeyError({ errMsg: 'network timeout' }));
checkTrue('null 安全', !utils.isDuplicateKeyError(null));

// ---------------------------------------------------------------- 分页归一化
console.log('\n[5] 分页参数归一化（防止越界请求）');
check('缺省值', utils.normalizePage({}, 20), { page: 1, size: 20, skip: 0 });
check('第 3 页', utils.normalizePage({ page: 3, pageSize: 10 }, 20), { page: 3, size: 10, skip: 20 });
check('负数页码被纠正为 1', utils.normalizePage({ page: -5 }, 20).page, 1);
check('超过上限被截断为 100', utils.normalizePage({ pageSize: 9999 }, 20).size, 100);
check('非法页码回退', utils.normalizePage({ page: 'abc' }, 20).page, 1);

// ---------------------------------------------------------------- 时间格式化
console.log('\n[6] 北京时间格式化（云函数运行环境为 UTC）');
const utcDate = new Date('2025-03-01T02:15:30.000Z');
check('UTC 02:15 → 北京 10:15', utils.formatTimeCN(utcDate), '2025-03-01 10:15:30');
check('不带秒', utils.formatTimeCN(utcDate, false), '2025-03-01 10:15');
check('跨日进位：UTC 20:00 → 次日 04:00', utils.formatTimeCN(new Date('2025-03-01T20:00:00Z')).slice(0, 10), '2025-03-02');
check('批次号格式', utils.batchNo(new Date('2025-03-01T02:15:30.000Z')), '20250301101530');
check('无效时间返回空串', utils.formatTimeCN('not-a-date'), '');

// ---------------------------------------------------------------- 结果
console.log('\n' + '='.repeat(52));
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
console.log('='.repeat(52));
process.exit(failed === 0 ? 0 : 1);
