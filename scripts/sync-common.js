#!/usr/bin/env node
/**
 * 把 cloudfunctions/_common 下的公共模块同步到每个云函数目录的 common/ 子目录。
 *
 * 用法（在项目根目录执行）：
 *   node scripts/sync-common.js
 *
 * 背景：微信云开发每个云函数独立打包部署，无法 require 上级目录，因此采用
 * "公共代码复制进各函数" 的方案，详见 cloudfunctions/_common/README.md。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CF_DIR = path.join(ROOT, 'cloudfunctions');
const SRC_DIR = path.join(CF_DIR, '_common');

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error('找不到公共模块目录：' + SRC_DIR);
    process.exit(1);
  }

  const commonFiles = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.js'));

  if (commonFiles.length === 0) {
    console.error('_common 目录下没有 .js 文件');
    process.exit(1);
  }

  const targets = fs
    .readdirSync(CF_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name);

  if (targets.length === 0) {
    console.error('没有找到任何云函数目录');
    process.exit(1);
  }

  let copied = 0;
  targets.forEach((fn) => {
    const destDir = path.join(CF_DIR, fn, 'common');
    fs.mkdirSync(destDir, { recursive: true });
    commonFiles.forEach((f) => {
      fs.copyFileSync(path.join(SRC_DIR, f), path.join(destDir, f));
      copied += 1;
    });
    console.log(`  ✓ ${fn}/common/  (${commonFiles.length} 个文件)`);
  });

  console.log(`\n同步完成：${targets.length} 个云函数，共复制 ${copied} 个文件。`);
  console.log('提醒：公共代码修改后需要在微信开发者工具中重新上传受影响的云函数。');
}

main();
