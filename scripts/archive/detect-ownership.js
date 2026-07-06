const SNAP = 5;
const asNum = (v) => typeof v === 'number' ? v : NaN;
const discretizeArc = (start, end, angleDeg) => { const dx = end.x - start.x, dy = end.y - start.y, chord = Math.hypot(dx, dy); if (chord < 1e-9) return [start]; const absAng = Math.abs(angleDeg) * Math.PI / 180; if (absAng < 1e-9) return [start, end]; const r = chord / (2 * Math.sin(absAng / 2)); const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2; const perpX = -dy / chord, perpY = dx / chord; const off = r * Math.cos(absAng / 2); const sign = angleDeg > 0 ? 1 : -1; const cx = mx + sign * perpX * off, cy = my + sign * perpY * off; const sa = Math.atan2(start.y - cy, start.x - cx); const n = Math.max(2, Math.ceil(absAng / (2 * Math.PI) * 36)); const pts = []; for (let i = 0; i <= n; i++) { const a = sa + sign * absAng * (i / n); pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } return pts; };
const parseSource = (s) => { if (!Array.isArray(s) || s.length === 0) return []; if (s[0] === 'R') { const x = asNum(s[1]), y = asNum(s[2]), w = asNum(s[3]), h = asNum(s[4]); if ([x, y, w, h].some(Number.isNaN)) return []; return [{ x, y }, { x: x + w, y }, { x: x + w, y: y - h }, { x, y: y - h }]; } if (s[0] === 'CIRCLE') { const cx = asNum(s[1]), cy = asNum(s[2]), r = asNum(s[3]); if ([cx, cy, r].some(Number.isNaN) || r <= 0) return []; const p = []; for (let i = 0; i < 72; i++) { const a = (i / 72) * 2 * Math.PI; p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } return p; } const pts = []; let i = 0; const x0 = asNum(s[0]), y0 = asNum(s[1]); if (!Number.isNaN(x0) && !Number.isNaN(y0)) { pts.push({ x: x0, y: y0 }); i = 2; } while (i < s.length) { const cmd = s[i]; i++; if (cmd === 'L') { while (i + 1 < s.length && typeof s[i] === 'number' && typeof s[i + 1] === 'number') { pts.push({ x: s[i], y: s[i + 1] }); i += 2; } } else if (cmd === 'ARC' || cmd === 'CARC') { const last = pts[pts.length - 1]; const seg = discretizeArc(last, { x: s[i + 1], y: s[i + 2] }, s[i]); pts.push(...seg.slice(1)); i += 3; } else if (cmd === 'C') { i += 6; } else break; } return pts; };
const bboxOf = (pts) => { let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9; for (const p of pts) { if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x; if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y; } return { minX: mnx, minY: mny, maxX: mxx, maxY: mxy }; };
const bboxCenter = (b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
const pointInPolygon = (pt, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y; const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-18) + xi); if (intersect) inside = !inside; } return inside; };
const recognizeLoops = (segments) => { const vPts = []; const adj = new Map(); const getV = (p) => { for (let i = 0; i < vPts.length; i++) { if (Math.hypot(vPts[i].x - p.x, vPts[i].y - p.y) < 5) return i; } vPts.push(p); return vPts.length - 1; }; for (const seg of segments) { if (seg.points.length < 2) continue; const from = getV(seg.points[0]); const to = getV(seg.points[seg.points.length - 1]); const e = { segId: seg.id, from, to, mid: seg.points.slice(1, -1) }; if (!adj.has(from)) adj.set(from, []); if (!adj.has(to)) adj.set(to, []); adj.get(from).push(e); adj.get(to).push(e); } const visited = new Set(); const loops = []; for (const start of vPts.keys()) { if (visited.has(start)) continue; const comp = []; const q = [start]; visited.add(start); while (q.length) { const v = q.shift(); comp.push(v); for (const e of (adj.get(v) || [])) { const nb = e.from === v ? e.to : e.from; if (!visited.has(nb)) { visited.add(nb); q.push(nb); } } } if (!comp.every((v) => (adj.get(v)?.length ?? 0) === 2)) continue; if (comp.length < 2) continue; const usedSet = new Set(); const usedEdges = []; const tp = [vPts[start]]; let cur = start; for (let g = 0; g < 100000; g++) { const es = adj.get(cur) || []; const e = es.find((x) => !usedSet.has(x)); if (!e) break; usedSet.add(e); usedEdges.push(e); const fwd = e.from === cur; const next = fwd ? e.to : e.from; const mid = fwd ? e.mid : [...e.mid].reverse(); tp.push(...mid, vPts[next]); cur = next; if (cur === start) break; } if (tp.length > 1 && Math.hypot(tp[0].x - tp[tp.length - 1].x, tp[0].y - tp[tp.length - 1].y) < 5) tp.pop(); if (tp.length >= 3) loops.push({ points: tp, bbox: bboxOf(tp), sourceIds: usedEdges.map((e) => e.segId) }); } return loops; };

// line 板框
const lineLoops = []; const segs = [];
const polys = ((await eda.pcb_PrimitivePolyline.getAll()) || []).filter((p) => { try { return p.getState_Layer() === 1; } catch { return false; } });
for (const p of polys) { try { if (p.getState_Net?.()) continue; const id = p.getState_PrimitiveId(); const poly = p.getState_Polygon(); const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon; const pts = parseSource(src); if (pts.length < 3) continue; const f = pts[0], l = pts[pts.length - 1]; const endsMeet = Math.hypot(f.x - l.x, f.y - l.y) < 5; const isWholeShape = Array.isArray(src) && (src[0] === 'CIRCLE' || src[0] === 'R'); if (endsMeet || isWholeShape) { const c = endsMeet ? pts.slice(0, -1) : pts; if (c.length >= 3) lineLoops.push({ kind: isWholeShape ? String(src[0]) : 'polyline', points: c, bbox: bboxOf(c), sourceIds: [id] }); } else segs.push({ id, points: pts }); } catch {} }
for (const a of ((await eda.pcb_PrimitiveArc.getAll()) || []).filter((a) => { try { return a.getState_Layer() === 1 && !a.getState_Net(); } catch { return false; } })) { try { const pts = discretizeArc({ x: a.getState_StartX(), y: a.getState_StartY() }, { x: a.getState_EndX(), y: a.getState_EndY() }, a.getState_ArcAngle()); if (pts.length >= 2) segs.push({ id: a.getState_PrimitiveId(), points: pts }); } catch {} }
const __fitLoops = recognizeLoops(segs);
lineLoops.push(...__fitLoops);

// region 板框
const regOutlines = [];
const list11 = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
await eda.pcb_SelectControl.clearSelected();
await eda.pcb_SelectControl.doSelectPrimitives(list11.map((p) => p.getState_PrimitiveId()));
const sel11 = await eda.pcb_SelectControl.getAllSelectedPrimitives();
for (const p of sel11) { try { if (p.getState_PrimitiveType() !== 'Region' || p.getState_RegionName() !== 'Board Outline') continue; const points = parseSource(p.getState_ComplexPolygon().getSource()); if (points.length >= 3) regOutlines.push({ kind: 'region', points, bbox: bboxOf(points), sourceIds: [p.getState_PrimitiveId()] }); } catch {} }
await eda.pcb_SelectControl.clearSelected();

const allBoards = [...regOutlines, ...lineLoops];
const comps = (await eda.pcb_PrimitiveComponent.getAll()) || [];
const compCenters = comps.map((c) => { try { return { x: c.getState_X(), y: c.getState_Y() }; } catch { return null; } }).filter(Boolean);

return {
  totalBoards: allBoards.length,
  boards: allBoards.map((b, i) => ({
    i, kind: b.kind, sourceIds: b.sourceIds, pts: b.points.length,
    center: bboxCenter(b.bbox), bbox: b.bbox,
    compsInside: compCenters.filter((c) => pointInPolygon(c, b.points)).length,
  })),
  compsTotal: compCenters.length,
  compCenters: compCenters.slice(0, 20),
  _debug_segIds: segs.map((s) => s.id),
  _debug_segs: segs.map((s) => ({ id: s.id, pts: s.points.length, first: s.points[0], last: s.points[s.points.length - 1] })),
  _debug_fitLoopIds: __fitLoops.map((l) => l.sourceIds),
};
