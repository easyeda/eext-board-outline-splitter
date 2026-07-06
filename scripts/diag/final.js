// 诊断最终：复现完整 detectBoards（Region 板框 + 线条板框 + classifyBoards），输出所有 outline bbox/面积 + 两两冲突 + 最终结果。
const TOL = 5;
const sameSnap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < TOL;
const rnd = (p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
function discretizeArc(start, end, sweepDeg) {
  if ([start.x, start.y, end?.x, end?.y, sweepDeg].some((v) => typeof v !== 'number' || Number.isNaN(v))) return [];
  const sweep = sweepDeg * Math.PI / 180; if (Math.abs(sweep) < 1e-9) return [end];
  const dx = end.x - start.x, dy = end.y - start.y, chord = Math.hypot(dx, dy); if (chord < 1e-9) return [end];
  const half = sweep / 2, sinHalf = Math.sin(half); if (Math.abs(sinHalf) < 1e-6) return [end];
  const r = Math.abs(chord / (2 * sinHalf)), mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
  const nx = -dy / chord, ny = dx / chord, off = r * Math.cos(half), sgn = sweep >= 0 ? 1 : -1;
  const cx = mx - nx * off * sgn, cy = my - ny * off * sgn, a0 = Math.atan2(start.y - cy, start.x - cx);
  const N = Math.max(4, Math.ceil(Math.abs(sweepDeg) / 10)), pts = [];
  for (let k = 1; k <= N; k++) { const a = a0 + sweep * (k / N); pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return pts;
}
function rectPts(x, y, w, h) { return [{ x, y }, { x: x + w, y }, { x: x + w, y: y - h }, { x, y: y - h }]; }
function parsePts(src) {
  if (!Array.isArray(src) || src.length === 0) return [];
  const h = src[0];
  if (h === 'R') return rectPts(src[1], src[2], src[3], src[4]);
  if (h === 'CIRCLE') { const cx = src[1], cy = src[2], r = src[3], N = 72, pts = []; for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } return pts; }
  const pts = []; let i = 0; const x0 = src[0], y0 = src[1]; const isNum = (v) => typeof v === 'number';
  if (isNum(x0) && isNum(y0)) { pts.push({ x: x0, y: y0 }); i = 2; }
  while (i < src.length) { const cmd = src[i]; i++; if (cmd === 'L') { while (i + 1 < src.length && isNum(src[i]) && isNum(src[i + 1])) { pts.push({ x: src[i], y: src[i + 1] }); i += 2; } } else if (cmd === 'ARC' || cmd === 'CARC') { const ang = src[i], ex = src[i + 1], ey = src[i + 2]; i += 3; pts.push(...discretizeArc(pts[pts.length - 1], { x: ex, y: ey }, ang)); } else break; }
  if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) pts.pop(); }
  return pts;
}
function bboxOf(pts) { let mnx = pts[0].x, mny = pts[0].y, mxx = pts[0].x, mxy = pts[0].y; for (const p of pts) { if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x; if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y; } return { minX: mnx, minY: mny, maxX: mxx, maxY: mxy }; }
function rawEnds(src) { if (!Array.isArray(src)) return null; const n = []; for (const t of src) if (typeof t === 'number') n.push(t); if (n.length < 4) return null; return { first: { x: n[0], y: n[1] }, last: { x: n[n.length - 2], y: n[n.length - 1] } }; }
function polyArea(pts) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y); } return Math.abs(a / 2); }
function pip(p, ring) { const n = ring.length; if (n < 3) return false; let inside = false; for (let i = 0, j = n - 1; i < n; j = i++) { const pi = ring[i], pj = ring[j]; if ((pi.y > p.y) !== (pj.y > p.y)) { const xc = (pj.x - pi.x) * (p.y - pi.y) / (pj.y - pi.y) + pi.x; if (p.x < xc) inside = !inside; } } return inside; }
function boxContains(o, i) { return i.minX > o.minX && i.maxX < o.maxX && i.minY > o.minY && i.maxY < o.maxY; }
function polyInPoly(o, i) { for (const p of i) if (!pip(p, o)) return false; return true; }
function segIntersect(p1, p2, p3, p4) { const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x); if (Math.abs(d) < 1e-9) return false; const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d; const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d; return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9; }
function ringsIntersect(a, b) { const ea = []; for (let i = 0, j = a.length - 1; i < a.length; j = i++) ea.push([a[j], a[i]]); const eb = []; for (let i = 0, j = b.length - 1; i < b.length; j = i++) eb.push([b[j], b[i]]); for (const [p1, p2] of ea) for (const [p3, p4] of eb) if (segIntersect(p1, p2, p3, p4)) return true; return false; }

const outlines = [];
// Region 板框
const L = 11;
const rlist = (await eda.pcb_PrimitivePolyline.getAll(undefined, L)) ?? [];
const rids = rlist.map((p) => { try { return p.getState_PrimitiveId(); } catch { return null; } }).filter(Boolean);
await eda.pcb_SelectControl.clearSelected();
await eda.pcb_SelectControl.doSelectPrimitives(rids);
const rarr = (await eda.pcb_SelectControl.getAllSelectedPrimitives()) ?? [];
for (const p of rarr) {
  try {
    if (p.getState_PrimitiveType() !== 'Region') continue;
    const name = p.getState_RegionName();
    if (name !== 'Board Outline') continue;
    const cp = typeof p.getState_ComplexPolygon === 'function' ? p.getState_ComplexPolygon() : undefined;
    const src = cp && typeof cp.getSource === 'function' ? cp.getSource() : [];
    const pts = parsePts(src);
    if (pts.length >= 3) outlines.push({ tag: 'REGION', points: pts, bbox: bboxOf(pts) });
  } catch (e) {}
}
await eda.pcb_SelectControl.clearSelected();

// 线条板框
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
    const ends = rawEnds(src);
    const endsMeet = ends ? Math.hypot(ends.first.x - ends.last.x, ends.first.y - ends.last.y) < 15 : false;
    const isWhole = cmd === 'CIRCLE' || cmd === 'R';
    segs.push({ id, points: pts, whole: (isWhole || endsMeet) });
  } catch (e) {}
}
const arcs = (await eda.pcb_PrimitiveArc.getAll()) ?? [];
for (const a of arcs) {
  try {
    if (a.getState_Layer() !== 1) continue;
    const net = typeof a.getState_Net === 'function' ? a.getState_Net() : undefined;
    if (net) continue;
    const start = { x: a.getState_StartX(), y: a.getState_StartY() };
    const end = { x: a.getState_EndX(), y: a.getState_EndY() };
    const pts = [start, ...discretizeArc(start, end, a.getState_ArcAngle())];
    if (pts.length >= 2) segs.push({ id: a.getState_PrimitiveId(), points: pts, whole: false });
  } catch (e) {}
}
for (const s of segs) if (s.whole && s.points.length >= 3) outlines.push({ tag: 'LINE-WHOLE', points: s.points, bbox: bboxOf(s.points) });
const fitSegs = segs.filter((s) => !s.whole);
const vPts = [];
const getV = (pt) => { for (let i = 0; i < vPts.length; i++) { if (Math.hypot(vPts[i].x - pt.x, vPts[i].y - pt.y) < TOL) return i; } vPts.push({ x: pt.x, y: pt.y }); return vPts.length - 1; };
const adj = new Map();
const addAdj = (v, e) => { const a = adj.get(v); if (a) a.push(e); else adj.set(v, [e]); };
const edges = fitSegs.map((seg) => { const from = getV(seg.points[0]); const to = getV(seg.points[seg.points.length - 1]); return { from, to, mid: seg.points.slice(1, -1) }; });
for (const e of edges) { addAdj(e.from, e); addAdj(e.to, e); }
const visited = new Set();
for (const start of vPts.keys()) {
  if (visited.has(start)) continue;
  const comp = []; const queue = [start]; visited.add(start);
  while (queue.length) { const v = queue.shift(); comp.push(v); for (const e of adj.get(v) ?? []) { const nb = e.from === v ? e.to : e.from; if (!visited.has(nb)) { visited.add(nb); queue.push(nb); } } }
  const allDeg2 = comp.every((v) => (adj.get(v)?.length ?? 0) === 2);
  if (!allDeg2 || comp.length < 2) continue;
  const usedSet = new Set(); const pts = [vPts[start]]; let cur = start;
  for (let g = 0; g < 100000; g++) { const es = adj.get(cur) ?? []; const e = es.find((x) => !usedSet.has(x)); if (!e) break; usedSet.add(e); const fw = e.from === cur; const next = fw ? e.to : e.from; const mid = fw ? e.mid : [...e.mid].reverse(); pts.push(...mid, vPts[next]); cur = next; if (cur === start) break; }
  if (pts.length > 1 && sameSnap(pts[0], pts[pts.length - 1])) pts.pop();
  if (pts.length >= 3) outlines.push({ tag: 'LINE-FIT', points: pts, bbox: bboxOf(pts) });
}

// classifyBoards
const out = { outlineCount: outlines.length, outlines: outlines.map((o) => ({ tag: o.tag, bbox: rnd({ x: o.bbox.minX, y: o.bbox.minY }), size: rnd({ x: o.bbox.maxX - o.bbox.minX, y: o.bbox.maxY - o.bbox.minY }), area: Math.round(polyArea(o.points)) })) };
let abort = null;
for (let a = 0; a < outlines.length && !abort; a++) {
  for (let b = a + 1; b < outlines.length && !abort; b++) {
    const A = outlines[a], B = outlines[b];
    if (boxContains(B.bbox, A.bbox) && polyInPoly(B.points, A.points)) abort = { kind: 'A在B内', A: A.tag, B: B.tag };
    else if (boxContains(A.bbox, B.bbox) && polyInPoly(A.points, B.points)) abort = { kind: 'B在A内', A: A.tag, B: B.tag };
    else if (ringsIntersect(A.points, B.points)) abort = { kind: '相交', A: A.tag, B: B.tag };
  }
}
out.abort = abort;
out.finalBoards = abort ? 0 : outlines.length;
return out;
