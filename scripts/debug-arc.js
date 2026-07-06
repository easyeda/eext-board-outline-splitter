/* 调试：解析板框层 8 条线条（含 ARC 角），对比原始首尾 vs 离散后首尾，
   并尝试 ARC 圆心侧 sign 原值/翻转，看哪种能让 8 段闭合成环。 */
const TOL = 5;
const ids = ['f52767f0d8d76e3f','44918ff5535f0942','bea696e92dd90184','39f860fef2a9e320','d64571a6cc7451e4','60d0b6d02c1b4d8a','14b451509adf156e','a658e3f024f0306d'];
const rnd = (p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
function rawEnds(src) { const n = []; for (const t of src) { if (typeof t === 'number') n.push(t); } return { first: { x: n[0], y: n[1] }, last: { x: n[n.length - 2], y: n[n.length - 1] } }; }
function discretizeArc(start, end, sweepDeg, flip) {
  const sweep = (sweepDeg * Math.PI) / 180;
  if (Math.abs(sweep) < 1e-9) return [end];
  const dx = end.x - start.x, dy = end.y - start.y, chord = Math.hypot(dx, dy);
  if (chord < 1e-9) return [end];
  const half = sweep / 2, sinHalf = Math.sin(half);
  if (Math.abs(sinHalf) < 1e-6) return [end];
  const r = Math.abs(chord / (2 * sinHalf));
  const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
  const nx = -dy / chord, ny = dx / chord, off = r * Math.cos(half);
  const sgn0 = sweep >= 0 ? 1 : -1;
  const sgn = flip ? -sgn0 : sgn0;
  const cx = mx - nx * off * sgn, cy = my - ny * off * sgn;
  const a0 = Math.atan2(start.y - cy, start.x - cx);
  const N = Math.max(4, Math.ceil(Math.abs(sweepDeg) / 10));
  const pts = [];
  for (let k = 1; k <= N; k++) { const a = a0 + sweep * (k / N); pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return pts;
}
function parsePts(src, flip) {
  const pts = []; let i = 0; const x0 = src[0], y0 = src[1]; const isNum = (v) => typeof v === 'number';
  if (isNum(x0) && isNum(y0)) { pts.push({ x: x0, y: y0 }); i = 2; }
  while (i < src.length) {
    const cmd = src[i]; i++;
    if (cmd === 'L') { while (i + 1 < src.length && isNum(src[i]) && isNum(src[i + 1])) { pts.push({ x: src[i], y: src[i + 1] }); i += 2; } }
    else if (cmd === 'ARC' || cmd === 'CARC') { const ang = src[i], ex = src[i + 1], ey = src[i + 2]; i += 3; pts.push(...discretizeArc(pts[pts.length - 1], { x: ex, y: ey }, ang, flip)); }
    else break;
  }
  return pts;
}
await eda.pcb_SelectControl.clearSelected();
await eda.pcb_SelectControl.doSelectPrimitives(ids);
const arr = (await eda.pcb_SelectControl.getAllSelectedPrimitives()) ?? [];
const segs = [];
for (const p of arr) {
  const id = p.getState_PrimitiveId();
  const poly = p.getState_Polygon();
  const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly.polygon;
  segs.push({ id, raw: rawEnds(src), src });
}
await eda.pcb_SelectControl.clearSelected();

function buildGraph(flip) {
  const vPts = [];
  const getV = (pt) => { for (let i = 0; i < vPts.length; i++) { if (Math.hypot(vPts[i].x - pt.x, vPts[i].y - pt.y) < TOL) return i; } vPts.push({ x: pt.x, y: pt.y }); return vPts.length - 1; };
  const adj = new Map();
  const addAdj = (v, e) => { const a = adj.get(v); if (a) a.push(e); else adj.set(v, [e]); };
  for (const s of segs) {
    const pts = parsePts(s.src, flip);
    if (pts.length < 2) continue;
    const f = getV(pts[0]); const t = getV(pts[pts.length - 1]);
    const e = { from: f, to: t };
    addAdj(f, e); addAdj(t, e);
  }
  const degs = [];
  for (const v of adj.keys()) degs.push(adj.get(v).length);
  const dist = {};
  for (const d of degs) dist[d] = (dist[d] || 0) + 1;
  return { vertexCount: vPts.length, degDist: dist, allDeg2: degs.every((d) => d === 2) };
}

const perSeg = segs.map((s) => {
  const pts = parsePts(s.src, false);
  return { id: s.id, rawFirst: rnd(s.raw.first), rawLast: rnd(s.raw.last), parsedFirst: rnd(pts[0]), parsedLast: rnd(pts[pts.length - 1]) };
});
return { perSeg, graph_original_sign: buildGraph(false), graph_flipped_sign: buildGraph(true) };
