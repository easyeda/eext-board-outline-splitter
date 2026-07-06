// 诊断：枚举全部板框候选 + 复刻检测流水线，定位"有图形但未被识别为板框"的原因。
// 不依赖手动选中（detect 会 clearSelected 清掉选中）。
const TOL = 5;
const CLOSE = 15;
const rnd = (p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
const rndb = (b) => ({ minX: Math.round(b.minX), minY: Math.round(b.minY), w: Math.round(b.maxX - b.minX), h: Math.round(b.maxY - b.minY) });
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
const sameSnap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < TOL;

const out = {};

// ===== 1. 当前聚焦 PCB =====
try { const info = await eda.dmt_Pcb.getCurrentPcbInfo(); out.pcb = { uuid: info?.uuid, name: info?.name }; } catch (e) { out.pcbErr = String(e); }

// ===== 2. Region 候选（layer 11）=====
const L = 11;
const regionCands = [];
const regionOutlineIds = [];
try {
  const rlist = (await eda.pcb_PrimitivePolyline.getAll(undefined, L)) ?? [];
  const rids = rlist.map((p) => { try { return p.getState_PrimitiveId(); } catch { return null; } }).filter(Boolean);
  await eda.pcb_SelectControl.clearSelected();
  if (rids.length) await eda.pcb_SelectControl.doSelectPrimitives(rids);
  const rarr = (await eda.pcb_SelectControl.getAllSelectedPrimitives()) ?? [];
  for (const p of rarr) {
    try {
      const type = p.getState_PrimitiveType();
      const id = p.getState_PrimitiveId();
      if (type !== 'Region') { regionCands.push({ id, type, note: 'layer11 枚举到但非 Region' }); continue; }
      const name = p.getState_RegionName();
      const cp = typeof p.getState_ComplexPolygon === 'function' ? p.getState_ComplexPolygon() : undefined;
      const src = cp && typeof cp.getSource === 'function' ? cp.getSource() : [];
      const pts = parsePts(src);
      regionCands.push({ id, regionName: name, cmd: typeof src[0] === 'string' ? src[0] : null, ptCount: pts.length, bbox: pts.length ? rndb(bboxOf(pts)) : null });
      if (name === 'Board Outline' && pts.length >= 3) regionOutlineIds.push(id);
    } catch (e) {}
  }
  await eda.pcb_SelectControl.clearSelected();
} catch (e) { out.regionErr = String(e); }
out.regionCandidateCount = regionCands.length;
out.regionCandidates = regionCands;
out.regionOutlineIds = regionOutlineIds;

// ===== 3. 线条候选（layer 1，无 net）=====
const lineCands = [];
const fitSegs = [];
try {
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
      const ends = rawEnds(src);
      const endGap = ends ? Math.round(Math.hypot(ends.first.x - ends.last.x, ends.first.y - ends.last.y) * 100) / 100 : null;
      const isWhole = cmd === 'CIRCLE' || cmd === 'R';
      const closed = isWhole || (endGap != null && endGap < CLOSE);
      lineCands.push({ id, kind: 'Polyline', cmd: typeof cmd === 'string' ? cmd : 'L', ptCount: pts.length, endGap, verdict: closed ? '直成环' : '开放→进拼接' });
      if (pts.length >= 2) fitSegs.push({ id, points: pts, whole: closed });
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
      lineCands.push({ id: a.getState_PrimitiveId(), kind: 'Arc', start: rnd(start), end: rnd(end) });
      if (pts.length >= 2) fitSegs.push({ id: a.getState_PrimitiveId(), points: pts, whole: false });
    } catch (e) {}
  }
} catch (e) { out.lineErr = String(e); }
out.lineCandidateCount = lineCands.length;
out.lineCandidates = lineCands;

// ===== 4. 线条拼接图（多段闭环检测）=====
const vPts = [];
const getV = (pt) => { for (let i = 0; i < vPts.length; i++) { if (Math.hypot(vPts[i].x - pt.x, vPts[i].y - pt.y) < TOL) return i; } vPts.push({ x: pt.x, y: pt.y }); return vPts.length - 1; };
const adj = new Map();
const addAdj = (v, e) => { const a = adj.get(v); if (a) a.push(e); else adj.set(v, [e]); };
const segsForGraph = fitSegs.filter((s) => !s.whole);
const edges = segsForGraph.map((seg) => { const from = getV(seg.points[0]); const to = getV(seg.points[seg.points.length - 1]); return { from, to }; });
for (const e of edges) { addAdj(e.from, e); addAdj(e.to, e); }
const degDist = {};
for (let v = 0; v < vPts.length; v++) { const d = (adj.get(v)?.length ?? 0); degDist[d] = (degDist[d] || 0) + 1; }
// 闭环计数（每个顶点度数=2 的连通分量）
const visited = new Set();
let closedLoops = 0;
for (const start of vPts.keys()) {
  if (visited.has(start)) continue;
  const comp = []; const queue = [start]; visited.add(start);
  while (queue.length) { const v = queue.shift(); comp.push(v); for (const e of adj.get(v) ?? []) { const nb = e.from === v ? e.to : e.from; if (!visited.has(nb)) { visited.add(nb); queue.push(nb); } } }
  if (comp.every((v) => (adj.get(v)?.length ?? 0) === 2) && comp.length >= 2) closedLoops++;
}
out.lineGraph = { fitSegCount: segsForGraph.length, wholeSegCount: fitSegs.length - segsForGraph.length, vertexCount: vPts.length, degreeDistribution: degDist, closedLoops };

// ===== 5. 汇总 =====
const outlineTotal = regionOutlineIds.length + (fitSegs.length - segsForGraph.length) + closedLoops;
out.finalOutlineCount = outlineTotal;
out.verdict = outlineTotal > 0 ? `检测到 ${outlineTotal} 个板框（Region ${regionOutlineIds.length} + 线条整体 ${fitSegs.length - segsForGraph.length} + 线条拟合 ${closedLoops}）` : '未检测到任何板框';
return out;
