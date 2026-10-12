#!/usr/bin/env node
/**
 * WXML 静态校验脚本
 *
 * 微信开发者工具之外无法编译 WXML，因此这里做两层静态检查：
 *   1. 标签配对 —— 检查 view/block/picker/button 等标签是否成对闭合
 *   2. 数据绑定 —— 提取 {{ }} 中的根标识符，核对是否在页面 data 或方法中定义
 *
 * 用法：node scripts/check-wxml.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGES = path.join(ROOT, 'miniprogram', 'pages');

let problems = 0;

/** 递归收集所有 wxml */
function walk(dir) {
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...walk(p));
    else if (d.name.endsWith('.wxml')) out.push(p);
  });
  return out;
}

// 需要检查配对的标签（自闭合标签不在其中）
const PAIRED = ['view', 'block', 'picker', 'button', 'scroll-view', 'form', 'switch', 'text', 'input'];

/** 检查 1：标签配对 */
function checkTags(src, file) {
  // 去掉注释，避免注释里的标签干扰
  const clean = src.replace(/<!--[\s\S]*?-->/g, '');
  PAIRED.forEach((tag) => {
    const open = (clean.match(new RegExp('<' + tag + '(\\s|>|/)', 'g')) || []).length;
    // 排除自闭合 <tag ... />
    const selfClose = (clean.match(new RegExp('<' + tag + '\\b[^>]*/>', 'g')) || []).length;
    const close = (clean.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    const expectClose = open - selfClose;
    if (expectClose !== close) {
      console.log(`  ✗ [标签配对] ${path.relative(ROOT, file)}`);
      console.log(`      <${tag}> 开标签 ${expectClose} 个（不含自闭合），闭标签 ${close} 个`);
      problems += 1;
    }
  });
}

/** 检查 2：数据绑定 */
function checkBindings(src, file) {
  const jsFile = file.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(jsFile)) {
    console.log(`  ✗ [缺少同名 js] ${path.relative(ROOT, file)}`);
    problems += 1;
    return;
  }
  const js = fs.readFileSync(jsFile, 'utf8');

  // data 块的键名
  const dataKeys = new Set();
  const dataMatch = js.match(/data\s*:\s*\{/);
  if (dataMatch) {
    // 从 data: { 开始做花括号配对，取出 data 对象体
    let i = js.indexOf('{', dataMatch.index);
    let depth = 0;
    let end = i;
    for (; end < js.length; end += 1) {
      if (js[end] === '{') depth += 1;
      else if (js[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = js.slice(i + 1, end);
    // 匹配顶层键（缩进两空格的 key: 形式）
    body.replace(/^\s{2,4}([A-Za-z_$][\w$]*)\s*:/gm, (m, k) => {
      dataKeys.add(k);
      return m;
    });
  }

  // 页面方法名
  const methods = new Set();
  js.replace(/^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm, (m, k) => {
    methods.add(k);
    return m;
  });

  // WXML 中 {{ }} 内的表达式
  const exprs = src.match(/\{\{[\s\S]*?\}\}/g) || [];
  // WXML 内置/上下文变量，无需在 data 中定义
  const BUILTIN = new Set(['true', 'false', 'null', 'undefined', 'item', 'index', 'true', 'false']);

  const unknown = new Map();
  exprs.forEach((raw) => {
    const body = raw.slice(2, -2);
    // 取出所有根标识符（不在 . 之后、不是对象字面量键、不是字符串内容）
    const stripped = body
      .replace(/'[^']*'/g, "''")
      .replace(/"[^"]*"/g, '""')
      .replace(/\.[A-Za-z_$][\w$]*/g, ''); // 去掉属性访问的尾部
    const ids = stripped.match(/[A-Za-z_$][\w$]*/g) || [];
    ids.forEach((id) => {
      if (BUILTIN.has(id)) return;
      if (dataKeys.has(id)) return;
      if (methods.has(id)) return;
      // wx:for 的 item/index 别名
      if (/^(wx|item|index)$/.test(id)) return;
      if (!unknown.has(id)) unknown.set(id, body.trim());
    });
  });

  if (unknown.size) {
    console.log(`  ✗ [数据绑定] ${path.relative(ROOT, file)}`);
    unknown.forEach((expr, id) => {
      console.log(`      未定义标识符 "${id}"  （出现在表达式: ${expr.slice(0, 60)}）`);
    });
    problems += 1;
  }
}

console.log('=== WXML 静态校验 ===\n');
const files = walk(PAGES).sort();
console.log(`共检查 ${files.length} 个 WXML 文件\n`);

files.forEach((f) => {
  const src = fs.readFileSync(f, 'utf8');
  checkTags(src, f);
  checkBindings(src, f);
});

console.log('');
if (problems === 0) {
  console.log('✓ 全部通过：标签配对正确，所有数据绑定标识符均有定义');
  process.exit(0);
} else {
  console.log(`✗ 发现 ${problems} 处问题`);
  process.exit(1);
}
