// 验证修复逻辑（复刻新 collectBoardOutlineRegions+collectLineBoards）：
// doSelect layer-11 → Region 板框 + 非Region 线条（Polyline/Arc）→ recognizeLoops 拟合。
const TOL = 5;
const CLOSE = 15;
const rnd = (p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
function discretizeArc(start, end, sweepDeg) {
  if ([start.x, start.y, end?.x, end?.y, sweepDeg].some((v) => typeof v !== 'number' || Number.isNaN(v))) return [];
  const sweep = sweepDeg * Math.PI / 180; if (Math.abs(sweep) < 1e-9) return [end];
  const dx = end.x - start.x, dy = end.y - start.y, chord = Math.hypot(dx, dy); if (chord < 1e-9) return [end];
  const half = sweep / 2, sinHalf = Math.sin(half); if (Math.abs(sinHalf) < 1e-6) return [end];
  const r = Math.abs(chord / (2 * sinHalf)), mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
  const nx = -dy / chord, ny = dx / chord, off = r * Math.cos(half), sgn = sweep >= 0 ? 1 : -1;
  const cx = mx + nx * off * sgn, cy = my + ny * off * sgn, a0 = Math.atan2(start.y - cy, start.x - cx);
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
function rawEnds(src) { if (!Array.isArray(src)) return null; const n = []; for (const t of src) if (typeof t === 'number') n.push(t); if (n.length < 4) return null; return { first: { x: n[0], y: n[1] }, last: { x: n[n.length - 2], y: n[n.length - 1] } }; }
const sameSnap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < TOL;

const L = 11;
const outlines = [];
const fitSegs = [];
const rlist = (await eda.pcb_PrimitivePolyline.getAll(undefined, L)) ?? [];
const rids = rlist.map((p) => { try { return p.getState_PrimitiveId(); } catch { return null; } }).filter(Boolean);
await eda.pcb_SelectControl.clearSelected();
if (rids.length) await eda.pcb_SelectControl.doSelectPrimitives(rids);
const rarr = (await eda.pcb_SelectControl.getAllSelectedPrimitives()) ?? [];
for (const p of rarr) {
  try {
    const id = p.getState_PrimitiveId();
    const ptype = p.getState_PrimitiveType();
    if (ptype === 'Region') {
      const name = p.getState_RegionName();
      if (name !== 'Board Outline') continue;
      const cp = typeof p.getState_ComplexPolygon === 'function' ? p.getState_ComplexPolygon() : undefined;
      const src = cp && typeof cp.getSource === 'function' ? cp.getSource() : [];
      const pts = parsePts(src);
      if (pts.length >= 3) outlines.push({ tag: 'REGION', id, n: pts.length });
    }
    else if (ptype === 'Polyline' || ptype === 'Arc') {
      const poly = typeof p.getState_Polygon === 'function' ? p.getState_Polygon() : undefined;
      const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : undefined;
      let pts;
      if (Array.isArray(src) && src.length > 0) pts = parsePts(src);
      else if (typeof p.getState_StartX === 'function') { const s = { x: p.getState_StartX(), y: p.getState_StartY() }, e = { x: p.getState_EndX(), y: p.getState_EndY() }; pts = [s, ...discretizeArc(s, e, p.getState_ArcAngle())]; }
      if (pts && pts.length >= 2) {
        const ends = rawEnds(src);
        const endsMeet = ends ? Math.hypot(ends.first.x - ends.last.x, ends.first.y - ends.last.y) < CLOSE : false;
        const isWhole = Array.isArray(src) && (src[0] === 'CIRCLE' || src[0] === 'R');
        if (endsMeet || isWhole) { if (pts.length >= 3) outlines.push({ tag: 'LINE-WHOLE', id, n: pts.length }); }
        else fitSegs.push({ id, points: pts });
      }
    }
  } catch (e) {}
}
await eda.pcb_SelectControl.clearSelected();

// recognizeLoops（复刻 outline-fit）
const vPts = [];
const getV = (pt) => { for (let i = 0; i < vPts.length; i++) { if (Math.hypot(vPts[i].x - pt.x, vPts[i].y - pt.y) < TOL) return i; } vPts.push({ x: pt.x, y: pt.y }); return vPts.length - 1; };
const adj = new Map();
const addAdj = (v, e) => { const a = adj.get(v); if (a) a.push(e); else adj.set(v, [e]); };
const edges = fitSegs.map((seg) => { const from = getV(seg.points[0]); const to = getV(seg.points[seg.points.length - 1]); return { from, to, ids: [seg.id] }; });
for (const e of edges) { addAdj(e.from, e); addAdj(e.to, e); }
const visited = new Set();
const fitLoops = [];
for (const start of vPts.keys()) {
  if (visited.has(start)) continue;
  const comp = []; const queue = [start]; visited.add(start);
  while (queue.length) { const v = queue.shift(); comp.push(v); for (const e of adj.get(v) ?? []) { const nb = e.from === v ? e.to : e.from; if (!visited.has(nb)) { visited.add(nb); queue.push(nb); } } }
  const allDeg2 = comp.every((v) => (adj.get(v)?.length ?? 0) === 2);
  if (allDeg2 && comp.length >= 2) {
    const ids = []; for (const v of comp) for (const e of adj.get(v) ?? []) ids.push(...e.ids);
    fitLoops.push({ tag: 'LINE-FIT', ids: [...new Set(ids)], verts: comp.length });
  }
}

return {
  regionOutlines: outlines.filter((o) => o.tag === 'REGION').map((o) => o.id),
  lineWhole: outlines.filter((o) => o.tag === 'LINE-WHOLE').map((o) => o.id),
  fitSegs: fitSegs.map((s) => s.id),
  fitLoops,
  totalOutlines: outlines.length + fitLoops.length,
};
