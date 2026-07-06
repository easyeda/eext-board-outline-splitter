// 诊断2：完整解析顶层线条点序列，复现 recognizeLoops（连通分量+度数+traceRing），
// 输出每个分量能否成环、ringPts 数（<3 即被跳过=识别失败根因）。
const TOL = 5;
const sameSnap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < TOL;
const rnd = (p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });

function discretizeArc(start, end, sweepDeg) {
  if ([start.x, start.y, end?.x, end?.y, sweepDeg].some((v) => typeof v !== 'number' || Number.isNaN(v))) return [];
  const sweep = sweepDeg * Math.PI / 180;
  if (Math.abs(sweep) < 1e-9) return [end];
  const dx = end.x - start.x, dy = end.y - start.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9) return [end];
  const half = sweep / 2, sinHalf = Math.sin(half);
  if (Math.abs(sinHalf) < 1e-6) return [end];
  const r = Math.abs(chord / (2 * sinHalf));
  const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
  const nx = -dy / chord, ny = dx / chord;
  const off = r * Math.cos(half), sgn = sweep >= 0 ? 1 : -1;
  const cx = mx - nx * off * sgn, cy = my - ny * off * sgn;
  const a0 = Math.atan2(start.y - cy, start.x - cx);
  const N = Math.max(4, Math.ceil(Math.abs(sweepDeg) / 10));
  const pts = [];
  for (let k = 1; k <= N; k++) { const a = a0 + sweep * (k / N); pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return pts;
}

function parsePts(src) {
  if (!Array.isArray(src) || src.length === 0) return [];
  const h = src[0];
  if (h === 'R') { const x = src[1], y = src[2], w = src[3], hh = src[4]; return [{ x, y }, { x: x + w, y }, { x: x + w, y: y - hh }, { x, y: y - hh }]; }
  if (h === 'CIRCLE') { const cx = src[1], cy = src[2], r = src[3]; const N = 72, pts = []; for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } return pts; }
  const pts = []; let i = 0;
  const x0 = src[0], y0 = src[1];
  const isNum = (v) => typeof v === 'number';
  if (isNum(x0) && isNum(y0)) { pts.push({ x: x0, y: y0 }); i = 2; }
  while (i < src.length) {
    const cmd = src[i]; i++;
    if (cmd === 'L') { while (i + 1 < src.length && isNum(src[i]) && isNum(src[i + 1])) { pts.push({ x: src[i], y: src[i + 1] }); i += 2; } }
    else if (cmd === 'ARC' || cmd === 'CARC') { const ang = src[i], ex = src[i + 1], ey = src[i + 2]; i += 3; pts.push(...discretizeArc(pts[pts.length - 1], { x: ex, y: ey }, ang)); }
    else break;
  }
  if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) pts.pop(); }
  return pts;
}

const segs = [];
const polys = (await eda.pcb_PrimitivePolyline.getAll()) ?? [];
for (const p of polys) {
  try {
    if (p.getState_Layer() !== 1) continue;
    const net = typeof p.getState_Net === 'function' ? p.getState_Net() : undefined;
    if (net) continue;
    const id = p.getState_PrimitiveId();
    const poly = p.getState_Polygon();
    const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon;
    const cmd = Array.isArray(src) ? src[0] : null;
    const pts = parsePts(src);
    if (pts.length < 2) continue;
    const first = pts[0], last = pts[pts.length - 1];
    const endsMeet = Math.hypot(first.x - last.x, first.y - last.y) < TOL;
    const isWhole = cmd === 'CIRCLE' || cmd === 'R';
    segs.push({ id, points: pts, whole: isWhole || endsMeet, cmd });
  } catch (e) {}
}
const arcs = (await eda.pcb_PrimitiveArc.getAll()) ?? [];
for (const a of arcs) {
  try {
    if (a.getState_Layer() !== 1) continue;
    const net = typeof a.getState_Net === 'function' ? a.getState_Net() : undefined;
    if (net) continue;
    const id = a.getState_PrimitiveId();
    const start = { x: a.getState_StartX(), y: a.getState_StartY() };
    const end = { x: a.getState_EndX(), y: a.getState_EndY() };
    const pts = [start, ...discretizeArc(start, end, a.getState_ArcAngle())];
    if (pts.length >= 2) segs.push({ id, points: pts, whole: false, cmd: 'ARC' });
  } catch (e) {}
}

const wholeLoops = segs.filter((s) => s.whole);
const fitSegs = segs.filter((s) => !s.whole);

const vPts = [];
const getV = (pt) => { for (let i = 0; i < vPts.length; i++) { if (Math.hypot(vPts[i].x - pt.x, vPts[i].y - pt.y) < TOL) return i; } vPts.push({ x: pt.x, y: pt.y }); return vPts.length - 1; };
const adj = new Map();
const addAdj = (v, e) => { const a = adj.get(v); if (a) a.push(e); else adj.set(v, [e]); };
const edges = fitSegs.map((seg) => { const from = getV(seg.points[0]); const to = getV(seg.points[seg.points.length - 1]); return { segId: seg.id, from, to, mid: seg.points.slice(1, -1) }; });
for (const e of edges) { addAdj(e.from, e); addAdj(e.to, e); }

const visited = new Set();
const comps = [];
for (const start of vPts.keys()) {
  if (visited.has(start)) continue;
  const comp = []; const queue = [start]; visited.add(start);
  while (queue.length) { const v = queue.shift(); comp.push(v); for (const e of adj.get(v) ?? []) { const nb = e.from === v ? e.to : e.from; if (!visited.has(nb)) { visited.add(nb); queue.push(nb); } } }
  const allDeg2 = comp.every((v) => (adj.get(v)?.length ?? 0) === 2);
  let ringPts = 0;
  if (allDeg2 && comp.length >= 2) {
    const usedSet = new Set(); const pts = [vPts[start]]; let cur = start;
    for (let g = 0; g < 100000; g++) { const es = adj.get(cur) ?? []; const e = es.find((x) => !usedSet.has(x)); if (!e) break; usedSet.add(e); const fw = e.from === cur; const next = fw ? e.to : e.from; const mid = fw ? e.mid : [...e.mid].reverse(); pts.push(...mid, vPts[next]); cur = next; if (cur === start) break; }
    if (pts.length > 1 && sameSnap(pts[0], pts[pts.length - 1])) pts.pop();
    ringPts = pts.length;
  }
  comps.push({ vCount: comp.length, allDeg2, ringPts, ok: allDeg2 && comp.length >= 2 && ringPts >= 3, verts: comp.map((v) => rnd(vPts[v])) });
}

return {
  wholeLoops: wholeLoops.length,
  fitSegCount: fitSegs.length,
  segDetails: segs.map((s) => ({ id: s.id, cmd: s.cmd, whole: s.whole, ptsLen: s.points.length, first: rnd(s.points[0]), last: rnd(s.points[s.points.length - 1]) })),
  comps,
};
