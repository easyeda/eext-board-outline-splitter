// 统一联调入口：内置诊断子命令 + 通用桥接执行器（替代旧 run-bridge.mjs）。
//
// 用法：
//   node scripts/diag.mjs <command> [port]        port 默认 49620
//
// command:
//   why        枚举全部板框候选 + 复刻检测，定位"有图形却未识别为板框"
//   selected   读取当前手动选中的图元（注意：扩展检测会 clearSelected 清空选中，需选中后立即跑）
//   verify     复刻检测流水线，验证板框识别结果（Region + 线条 + 拟合）
//   final      复刻完整 detectBoards（Region + 线条 + classifyBoards 嵌套/相交）
//   <file.js>  任意 .js 文件路径（文件内容作 `async function(eda){...}` 体，经本地桥接 /execute 执行）
//   (无参)     列出可用命令
//
// 历史一次性脚本见 scripts/archive/，可用 `<file.js>` 方式重新运行，例如：
//   node scripts/diag.mjs archive/probe-copypcb-focus.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cmd = process.argv[2];
const port = process.argv[3] || '49620';

/** 内置诊断：子命令 → diag/ 下的代码体文件 */
const BUILTINS = {
  why: 'diag/why.js',
  selected: 'diag/selected.js',
  verify: 'diag/verify.js',
  final: 'diag/final.js',
};

async function runCode(code) {
  const res = await fetch(`http://localhost:${port}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const json = await res.json();
  if (json && json.error) {
    console.error('BRIDGE ERROR:', json.error);
    process.exit(2);
  }
  console.log(JSON.stringify(json.result ?? json, null, 2));
}

if (!cmd) {
  console.log('usage: node scripts/diag.mjs <command> [port]');
  console.log('built-in: ' + Object.keys(BUILTINS).join(', '));
  console.log('or pass a .js file path (e.g. archive/probe-x.js) to run its body via the bridge');
  process.exit(0);
}

const file = BUILTINS[cmd] ?? cmd;
const fullPath = path.isAbsolute(file) ? file : path.resolve(__dirname, file);
const code = fs.readFileSync(fullPath, 'utf8');
await runCode(code);
