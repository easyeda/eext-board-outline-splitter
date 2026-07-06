// 验证顶层线条板框识别（collectLineBoards 等价逻辑）
const SNAP = 1e-6;
const asNum = (v) => typeof v === 'number' ? v : NaN;
const discretizeArc = (start, end, angleDeg) => {
  const dx = end.x - start.x, dy = end.y - start.y, chord = Math.hypot(dx, dy);
  if (chord < 1e-9) return [start];
  const absAng = Math.abs(angleDeg) * Math.PI / 180;
  if (absAng < 1e-9) return [start, end];
  const r = chord / (2 * Math.sin(absAng / 2));
  const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
  const perpX = -dy / chord, perpY = dx / chord;
  const off = r * Math.cos(absAng / 2);
  const sign = angleDeg > 0 ? 1 : -1;
  const cx = mx + sign * perpX * off, cy = my + sign * perpY * off;
  const sa = Math.atan2(start.y - cy, start.x - cx);
  const n = Math.max(2, Math.ceil(absAng / (2 * Math.PI) * 36));
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = sa + sign * absAng * (i / n); pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return pts;
};
const parseSource = (s) => {
  if (!Array.isArray(s) || s.length === 0) return [];
  if (s[0] === 'R') { const x = asNum(s[1]), y = asNum(s[2]), w = asNum(s[3]), h = asNum(s[4]); if ([x, y, w, h].some(Number.isNaN)) return []; return [{ x, y }, { x: x + w, y }, { x: x + w, y: y - h }, { x, y: y - h }]; }
  if (s[0] === 'CIRCLE') { const cx = asNum(s[1]), cy = asNum(s[2]), r = asNum(s[3]); if ([cx, cy, r].some(Number.isNaN) || r <= 0) return []; const p = []; for (let i = 0; i < 72; i++) { const a = (i / 72) * 2 * Math.PI; p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } return p; }
  const pts = []; let i = 0;
  const x0 = asNum(s[0]), y0 = asNum(s[1]);
  if (!Number.isNaN(x0) && !Number.isNaN(y0)) { pts.push({ x: x0, y: y0 }); i = 2; }
  while (i < s.length) {
    const cmd = s[i]; i++;
    if (cmd === 'L') { while (i + 1 < s.length && typeof s[i] === 'number' && typeof s[i + 1] === 'number') { pts.push({ x: s[i], y: s[i + 1] }); i += 2; } }
    else if (cmd === 'ARC' || cmd === 'CARC') { const last = pts[pts.length - 1]; const seg = discretizeArc(last, { x: s[i + 1], y: s[i + 2] }, s[i]); pts.push(...seg.slice(1)); i += 3; }
    else if (cmd === 'C') { i += 6; }
    else break;
  }
  return pts;
};
const bboxOf = (pts) => { let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9; for (const p of pts) { if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x; if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y; } return { minX: mnx, minY: mny, maxX: mxx, maxY: mxy }; };
const bboxCenter = (b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
const keyOf = (p) => `${Math.round(p.x / SNAP)}_${Math.round(p.y / SNAP)}`;
const recognizeLoops = (segments) => {
  const keyToV = new Map(); const vPts = []; const adj = new Map();
  const getV = (p) => { for (let i = 0; i < vPts.length; i++) { if (Math.hypot(vPts[i].x - p.x, vPts[i].y - p.y) < 5) return i; } vPts.push(p); return vPts.length - 1; };
  const edges = [];
  for (const seg of segments) {
    if (seg.points.length < 2) continue;
    const from = getV(seg.points[0]); const to = getV(seg.points[seg.points.length - 1]);
    const e = { segId: seg.id, from, to, mid: seg.points.slice(1, -1) };
    edges.push(e); (adj.get(from) ?? adj.set(from, []).get(from)).push(e); (adj.get(to) ?? adj.set(to, []).get(to)).push(e);
  }
  const visited = new Set(); const loops = [];
  for (const start of vPts.keys()) {
    if (visited.has(start)) continue;
    const comp = []; const q = [start]; visited.add(start);
    while (q.length) { const v = q.shift(); comp.push(v); for (const e of (adj.get(v) || [])) { const nb = e.from === v ? e.to : e.from; if (!visited.has(nb)) { visited.add(nb); q.push(nb); } } }
    if (!comp.every((v) => (adj.get(v)?.length ?? 0) === 2)) continue;
    if (comp.length < 2) continue;
    // trace
    const usedSet = new Set(); const usedEdges = []; const tracePts = [vPts[start]]; let cur = start;
    for (let g = 0; g < 100000; g++) { const es = adj.get(cur) || []; const e = es.find((x) => !usedSet.has(x)); if (!e) break; usedSet.add(e); usedEdges.push(e); const fwd = e.from === cur; const next = fwd ? e.to : e.from; const mid = fwd ? e.mid : [...e.mid].reverse(); tracePts.push(...mid, vPts[next]); cur = next; if (cur === start) break; }
    if (tracePts.length > 1 && Math.hypot(tracePts[0].x - tracePts[tracePts.length - 1].x, tracePts[0].y - tracePts[tracePts.length - 1].y) < 5) tracePts.pop();
    if (tracePts.length >= 3) loops.push({ points: tracePts, bbox: bboxOf(tracePts), sourceIds: usedEdges.map((e) => e.segId) });
  }
  return loops;
};

const loops = []; const segs = [];
const polys = ((await eda.pcb_PrimitivePolyline.getAll()) || []).filter((p) => { try { return p.getState_Layer() === 1; } catch { return false; } });
for (const p of polys) {
  try { const net = p.getState_Net?.(); if (net) continue; const id = p.getState_PrimitiveId(); const poly = p.getState_Polygon(); const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon; const pts = parseSource(src); if (pts.length < 2) continue; const first = pts[0], last = pts[pts.length - 1]; const endsMeet = Math.hypot(first.x - last.x, first.y - last.y) < 5; const isWholeShape = Array.isArray(src) && (src[0] === 'CIRCLE' || src[0] === 'R'); if (endsMeet || isWholeShape) { const closed = endsMeet ? pts.slice(0, -1) : pts; if (closed.length >= 3) loops.push({ kind: isWholeShape ? String(src[0]) : 'closed-polyline', sourceIds: [id], pts: closed.length, center: bboxCenter(bboxOf(closed)), bbox: bboxOf(closed) }); } else segs.push({ id, points: pts }); } catch {}
}
const arcs = ((await eda.pcb_PrimitiveArc.getAll()) || []).filter((a) => { try { return a.getState_Layer() === 1; } catch { return false; } });
for (const a of arcs) { try { const net = a.getState_Net?.(); if (net) continue; const id = a.getState_PrimitiveId(); const start = { x: a.getState_StartX(), y: a.getState_StartY() }; const end = { x: a.getState_EndX(), y: a.getState_EndY() }; const pts = discretizeArc(start, end, a.getState_ArcAngle()); if (pts.length >= 2) segs.push({ id, points: pts }); } catch {} }
const fitLoops = recognizeLoops(segs);
return {
  topPolyline: polys.length,
  topArc: arcs.length,
  closedPolylineLoops: loops,
  openSegments: segs.length,
  fitLoops: fitLoops.map((l) => ({ pts: l.points.length, sourceIds: l.sourceIds, center: bboxCenter(l.bbox), bbox: l.bbox })),
  totalLineBoards: loops.length + fitLoops.length,
};
