// 联调桥执行器：读取一个 .js 文件（内容为 async function(eda){...} 的 body），
// POST 到本地 easyeda-bridge 的 /execute，打印返回结果。
import fs from 'node:fs';

const file = process.argv[2];
const port = process.argv[3] || '49620';
if (!file) {
  console.error('usage: node run-bridge.mjs <code.js> [port]');
  process.exit(1);
}
const code = fs.readFileSync(file, 'utf8');

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
