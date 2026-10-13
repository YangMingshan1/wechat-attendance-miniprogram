#!/usr/bin/env node
/**
 * 校验测试用学生名单：用真实的导入解析逻辑跑一遍，输出预期结果
 *
 * 用法（项目根目录）：
 *   node scripts/verify-test-roster.js
 *
 * 原理：从 cloudfunctions/student/index.js 中抽出表头识别与单元格读取两个纯函数，
 *       按 importStudents 的同一套顺序逐行判定，因此输出的失败明细与云端真实导入一致。
 *
 * 产出：test-data/学生名单-测试用-预期结果.md
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const XLSX = require(path.join(ROOT, '.tools', 'node_modules', 'xlsx'));

// ---------------------------------------------------------------- 抽取纯函数
const studentSrc = fs.readFileSync(
  path.join(ROOT, 'cloudfunctions', 'student', 'index.js'),
  'utf8'
);

// 抽取范围：从 HEADER_ALIAS 开始，到 cellStr 函数结束（下一个 /** Excel 批量导入 */ 之前）
const block = studentSrc.match(
  /(\/\*\* 表头别名映射[\s\S]*?)\n\/\*\* Excel 批量导入 \*\//
);
if (!block) {
  console.error('无法从 cloudfunctions/student/index.js 中提取表头识别与单元格读取函数');
  process.exit(1);
}

/* eslint-disable no-new-func */
const factory = new Function(
  block[1] + '\n return { detectHeader: detectHeader, cellStr: cellStr };'
);
const { detectHeader, cellStr } = factory();

// ---------------------------------------------------------------- 读取表格
const file = path.join(ROOT, 'test-data', '学生名单-测试用.xlsx');
if (!fs.existsSync(file)) {
  console.error('找不到测试文件，请先执行：node scripts/make-test-roster.js');
  process.exit(1);
}

const wb = XLSX.readFile(file);
const firstSheet = wb.SheetNames[0];
const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], {
  header: 1,
  blankrows: false, // 与 cloudfunctions/student/index.js 保持一致
  defval: ''
});

// ---------------------------------------------------------------- 复刻导入逻辑
let headerIndex = -1;
let headerMap = null;
for (let i = 0; i < Math.min(sheetRows.length, 10); i += 1) {
  const m = detectHeader(sheetRows[i]);
  if (m.className !== -1 && m.name !== -1 && m.sno !== -1) {
    headerIndex = i;
    headerMap = m;
    break;
  }
}

if (!headerMap) {
  console.error('未识别到表头，测试文件可能有问题');
  process.exit(1);
}

const errors = [];
const valid = [];
const seenInFile = Object.create(null);
let total = 0;

for (let i = headerIndex + 1; i < sheetRows.length; i += 1) {
  const row = sheetRows[i];
  const className = cellStr(row, headerMap.className);
  const name = cellStr(row, headerMap.name);
  const snoRaw = cellStr(row, headerMap.sno);

  if (!className && !name && !snoRaw) continue;
  total += 1;
  const rowNo = i + 1; // Excel 中从 1 开始的行号

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
    errors.push({
      row: rowNo,
      sno: snoRaw,
      name,
      reason: '文件内学号重复（首次出现在第 ' + seenInFile[snoRaw] + ' 行）'
    });
    continue;
  }
  seenInFile[snoRaw] = rowNo;
  valid.push({ row: rowNo, sno: snoRaw, name, className });
}

// ---------------------------------------------------------------- 输出
const lines = [];
lines.push('# 学生名单测试文件 · 预期导入结果');
lines.push('');
lines.push('> 本文件由 `node scripts/verify-test-roster.js` 自动生成。');
lines.push('> 判定逻辑直接取自 `cloudfunctions/student/index.js` 的真实导入代码，');
lines.push('> 因此下表就是云端导入时**应当**返回的结果，可用于逐条比对。');
lines.push('');
lines.push('## 文件信息');
lines.push('');
lines.push('| 项目 | 值 |');
lines.push('|---|---|');
lines.push('| 文件 | `test-data/学生名单-测试用.xlsx` |');
lines.push('| 工作表 | 第一个表 `' + firstSheet + '`（另一个表 `' + wb.SheetNames[1] + '` 应被忽略）|');
lines.push('| 表头所在行 | 第 ' + (headerIndex + 1) + ' 行（前 ' + headerIndex + ' 行是说明文字，应被跳过）|');
lines.push('| 识别到的列位置 | 班级=第' + (headerMap.className + 1) + '列、姓名=第' + (headerMap.name + 1) + '列、学号=第' + (headerMap.sno + 1) + '列 |');
lines.push('| 数据行总数（非空） | ' + total + ' |');
lines.push('');
lines.push('**注意列顺序是刻意打乱的**（表头为：序号、姓名、备注、学号、班级、辅导员），');
lines.push('用于验证程序按**列名**识别而不是按固定位置识别。');
lines.push('');
lines.push('## 应成功导入的 ' + valid.length + ' 条');
lines.push('');
lines.push('| Excel 行号 | 学号 | 姓名 | 班级 |');
lines.push('|---|---|---|---|');
valid.forEach((v) => {
  lines.push('| ' + v.row + ' | ' + v.sno + ' | ' + v.name + ' | ' + v.className + ' |');
});
lines.push('');
lines.push('## 应失败的 ' + errors.length + ' 条');
lines.push('');
lines.push('| Excel 行号 | 学号 | 姓名 | 失败原因 |');
lines.push('|---|---|---|---|');
errors.forEach((e) => {
  lines.push('| ' + e.row + ' | ' + (e.sno || '（空）') + ' | ' + (e.name || '（空）') + ' | ' + e.reason + ' |');
});
lines.push('');
lines.push('## 导入后小程序应弹出的提示');
lines.push('');
lines.push('```');
lines.push('文件：学生名单-测试用.xlsx');
lines.push('共读取 ' + total + ' 行');
lines.push('成功导入 ' + valid.length + ' 条');
lines.push('失败 ' + errors.length + ' 条');
lines.push('```');
lines.push('');
lines.push('## 逐条核对要点');
lines.push('');
lines.push('1. **总数应为 ' + total + '** —— 空行被跳过，不计入。');
lines.push('2. **成功 ' + valid.length + ' 条** —— 含 2 条「学号写成数字类型」的记录（第 19、20 行），');
lines.push('   用于验证数字型学号不会被转成科学计数法（如 `2.02302E+10`）。');
lines.push('3. **失败 ' + errors.length + ' 条** —— 班级为空、姓名为空、学号为空、文件内学号重复各 1 条。');
lines.push('4. **另一张工作表 `' + wb.SheetNames[1] + '` 不应被导入** —— 若它里面的「不应被导入」出现在名单里，说明读错了工作表。');
lines.push('');
lines.push('## 重复导入验证');
lines.push('');
lines.push('对同一个文件**再导入一次**，预期结果变为：');
lines.push('');
lines.push('- 成功 **0** 条');
lines.push('- 失败 **' + (valid.length + errors.length) + '** 条，原因全部是「该学号已存在于名单中」');
lines.push('');
lines.push('这验证了 `users` 集合的 `sno` 唯一索引在起作用，重复导入不会产生重复数据。');
lines.push('');

const outFile = path.join(ROOT, 'test-data', '学生名单-测试用-预期结果.md');
fs.writeFileSync(outFile, lines.join('\n'), 'utf8');

console.log('总行数: ' + total);
console.log('应成功: ' + valid.length + ' 条');
console.log('应失败: ' + errors.length + ' 条');
errors.forEach((e) => {
  console.log('  第 ' + e.row + ' 行  ' + (e.sno || '(空学号)') + '  → ' + e.reason);
});
console.log('\n预期结果已写入：' + path.relative(ROOT, outFile));
