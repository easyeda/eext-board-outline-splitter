const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const ROOT = 'D:/Users/libin3/project/Component_Identification';
const OUT = 'C:/Users/libin3/Desktop/board-outline-splitter-src-v1.3.19.zip';
const TOP = 'board-outline-splitter-src-v1.3.19/';

const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', 'coverage']);
const EXCLUDE_FILES = new Set(['.eslintcache', 'debug.log']);

function walk(dir, base) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = ent.name;
    const rel = base ? base + '/' + name : name;
    if (EXCLUDE_DIRS.has(name)) continue;
    if (rel === 'build/dist' || rel.startsWith('build/dist/')) continue;
    if (EXCLUDE_FILES.has(name)) continue;
    if (name === 'app.js' && base === 'iframe') continue; // built bundle
    const full = path.join(dir, name);
    if (ent.isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, full });
  }
  return out;
}

const files = walk(ROOT, '');
const zip = new JSZip();
for (const f of files) zip.file(TOP + f.rel, fs.readFileSync(f.full));

zip.generateAsync({ type: 'nodebuffer' }).then(buf => {
  fs.writeFileSync(OUT, buf);
  const tops = [...new Set(files.map(f => f.rel.split('/')[0]))].sort();
  console.log('zipped', files.length, 'files ->', OUT);
  console.log('top entries:', tops.join(', '));
});
