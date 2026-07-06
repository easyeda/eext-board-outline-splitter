// 端到端拆分 v3：Region 板框 + 顶层线条板框，焦点轮询 + 源保护 + 删非本板（Region/Polyline）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SNAP = 1e-6;
const asNum = (v) => typeof v === 'number' ? v : NaN;
const discretizeArc = (start, end, angleDeg) => { const dx = end.x - start.x, dy = end.y - start.y, chord = Math.hypot(dx, dy); if (chord < 1e-9) return [start]; const absAng = Math.abs(angleDeg) * Math.PI / 180; if (absAng < 1e-9) return [start, end]; const r = chord / (2 * Math.sin(absAng / 2)); const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2; const perpX = -dy / chord, perpY = dx / chord; const off = r * Math.cos(absAng / 2); const sign = angleDeg > 0 ? 1 : -1; const cx = mx + sign * perpX * off, cy = my + sign * perpY * off; const sa = Math.atan2(start.y - cy, start.x - cx); const n = Math.max(2, Math.ceil(absAng / (2 * Math.PI) * 36)); const pts = []; for (let i = 0; i <= n; i++) { const a = sa + sign * absAng * (i / n); pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } return pts; };
const parseSource = (s) => { if (!Array.isArray(s) || s.length === 0) return []; if (s[0] === 'R') { const x = asNum(s[1]), y = asNum(s[2]), w = asNum(s[3]), h = asNum(s[4]); if ([x, y, w, h].some(Number.isNaN)) return []; return [{ x, y }, { x: x + w, y }, { x: x + w, y: y - h }, { x, y: y - h }]; } if (s[0] === 'CIRCLE') { const cx = asNum(s[1]), cy = asNum(s[2]), r = asNum(s[3]); if ([cx, cy, r].some(Number.isNaN) || r <= 0) return []; const p = []; for (let i = 0; i < 72; i++) { const a = (i / 72) * 2 * Math.PI; p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } return p; } const pts = []; let i = 0; const x0 = asNum(s[0]), y0 = asNum(s[1]); if (!Number.isNaN(x0) && !Number.isNaN(y0)) { pts.push({ x: x0, y: y0 }); i = 2; } while (i < s.length) { const cmd = s[i]; i++; if (cmd === 'L') { while (i + 1 < s.length && typeof s[i] === 'number' && typeof s[i + 1] === 'number') { pts.push({ x: s[i], y: s[i + 1] }); i += 2; } } else if (cmd === 'ARC' || cmd === 'CARC') { const last = pts[pts.length - 1]; const seg = discretizeArc(last, { x: s[i + 1], y: s[i + 2] }, s[i]); pts.push(...seg.slice(1)); i += 3; } else if (cmd === 'C') { i += 6; } else break; } return pts; };
const bboxOf = (pts) => { let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9; for (const p of pts) { if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x; if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y; } return { minX: mnx, minY: mny, maxX: mxx, maxY: mxy }; };
const bboxCenter = (b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
const pointInPolygon = (pt, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y; const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-18) + xi); if (intersect) inside = !inside; } return inside; };
const keyOf = (p) => `${Math.round(p.x / SNAP)}_${Math.round(p.y / SNAP)}`;
const recognizeLoops = (segments) => { const vPts = []; const adj = new Map(); const getV = (p) => { for (let i = 0; i < vPts.length; i++) { if (Math.hypot(vPts[i].x - p.x, vPts[i].y - p.y) < 5) return i; } vPts.push(p); return vPts.length - 1; }; for (const seg of segments) { if (seg.points.length < 2) continue; const from = getV(seg.points[0]); const to = getV(seg.points[seg.points.length - 1]); const e = { segId: seg.id, from, to, mid: seg.points.slice(1, -1) }; if (!adj.has(from)) adj.set(from, []); if (!adj.has(to)) adj.set(to, []); adj.get(from).push(e); adj.get(to).push(e); } const visited = new Set(); const loops = []; for (const start of vPts.keys()) { if (visited.has(start)) continue; const comp = []; const q = [start]; visited.add(start); while (q.length) { const v = q.shift(); comp.push(v); for (const e of (adj.get(v) || [])) { const nb = e.from === v ? e.to : e.from; if (!visited.has(nb)) { visited.add(nb); q.push(nb); } } } if (!comp.every((v) => (adj.get(v)?.length ?? 0) === 2)) continue; if (comp.length < 2) continue; const usedSet = new Set(); const usedEdges = []; const tp = [vPts[start]]; let cur = start; for (let g = 0; g < 100000; g++) { const es = adj.get(cur) || []; const e = es.find((x) => !usedSet.has(x)); if (!e) break; usedSet.add(e); usedEdges.push(e); const fwd = e.from === cur; const next = fwd ? e.to : e.from; const mid = fwd ? e.mid : [...e.mid].reverse(); tp.push(...mid, vPts[next]); cur = next; if (cur === start) break; } if (tp.length > 1 && Math.hypot(tp[0].x - tp[tp.length - 1].x, tp[0].y - tp[tp.length - 1].y) < 5) tp.pop(); if (tp.length >= 3) loops.push({ points: tp, bbox: bboxOf(tp), sourceIds: usedEdges.map((e) => e.segId) }); } return loops; };
const TYPES = { lines: 'pcb_PrimitiveLine', arcs: 'pcb_PrimitiveArc', components: 'pcb_PrimitiveComponent', pads: 'pcb_PrimitivePad', vias: 'pcb_PrimitiveVia', regions: 'pcb_PrimitiveRegion', fills: 'pcb_PrimitiveFill', pours: 'pcb_PrimitivePour', dimensions: 'pcb_PrimitiveDimension', images: 'pcb_PrimitiveImage' };
const activateAndConfirm = async (uuid, maxTries = 20) => { const tabId = await eda.dmt_EditorControl.openDocument(uuid); if (!tabId) return false; for (let i = 0; i < maxTries; i++) { await eda.dmt_EditorControl.activateDocument(tabId); const info = await eda.dmt_Pcb.getCurrentPcbInfo(); if (info && info.uuid === uuid) return true; await sleep(200); } return false; };

// 采集 region loops（layer 11）
const getRegionLoops = async () => {
  const out = { outlines: [], cutouts: [] };
  const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
  await eda.pcb_SelectControl.clearSelected();
  await eda.pcb_SelectControl.doSelectPrimitives(list.map((p) => p.getState_PrimitiveId()));
  const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
  for (const p of sel) { try { if (p.getState_PrimitiveType() !== 'Region') continue; const name = p.getState_RegionName(); const kind = name === 'Board Outline' ? 'outline' : name === 'Board Cutout' ? 'cutout' : null; if (!kind) continue; const id = p.getState_PrimitiveId(); const points = parseSource(p.getState_ComplexPolygon().getSource()); if (points.length < 3) continue; const loop = { points, bbox: bboxOf(points), sourceIds: [id] }; (kind === 'outline' ? out.outlines : out.cutouts).push(loop); } catch {} }
  await eda.pcb_SelectControl.clearSelected();
  return out;
};
// 采集 line loops（layer 1 无 net）
const getLineLoops = async () => {
  const loops = []; const segs = [];
  const polys = ((await eda.pcb_PrimitivePolyline.getAll()) || []).filter((p) => { try { return p.getState_Layer() === 1; } catch { return false; } });
  for (const p of polys) { try { if (p.getState_Net?.()) continue; const id = p.getState_PrimitiveId(); const poly = p.getState_Polygon(); const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon; const pts = parseSource(src); if (pts.length < 2) continue; const f = pts[0], l = pts[pts.length - 1]; const endsMeet = Math.hypot(f.x - l.x, f.y - l.y) < 5; const isWholeShape = Array.isArray(src) && (src[0] === 'CIRCLE' || src[0] === 'R'); if (endsMeet || isWholeShape) { const c = endsMeet ? pts.slice(0, -1) : pts; if (c.length >= 3) loops.push({ points: c, bbox: bboxOf(c), sourceIds: [id] }); } else segs.push({ id, points: pts }); } catch {} }
  const arcs = ((await eda.pcb_PrimitiveArc.getAll()) || []).filter((a) => { try { return a.getState_Layer() === 1; } catch { return false; } });
  for (const a of arcs) { try { if (a.getState_Net?.()) continue; const pts = discretizeArc({ x: a.getState_StartX(), y: a.getState_StartY() }, { x: a.getState_EndX(), y: a.getState_EndY() }, a.getState_ArcAngle()); if (pts.length >= 2) segs.push({ id: a.getState_PrimitiveId(), points: pts }); } catch {} }
  loops.push(...recognizeLoops(segs));
  return loops;
};
const deleteOtherBoardOutlines = async (keepIds) => { const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || []; await eda.pcb_SelectControl.clearSelected(); await eda.pcb_SelectControl.doSelectPrimitives(list.map((p) => p.getState_PrimitiveId())); const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives(); const toDel = []; for (const p of sel) { try { const n = p.getState_RegionName(); if ((n === 'Board Outline' || n === 'Board Cutout') && !keepIds.has(p.getState_PrimitiveId())) toDel.push(p.getState_PrimitiveId()); } catch {} } await eda.pcb_SelectControl.clearSelected(); if (toDel.length) try { await eda.pcb_PrimitiveRegion.delete(toDel); } catch {} return toDel.length; };
const deleteOtherLineOutlines = async (keepIds) => { const polys = (await eda.pcb_PrimitivePolyline.getAll(undefined, 1)) || []; const toDel = []; for (const p of polys) { try { if (p.getState_Net?.()) continue; const id = p.getState_PrimitiveId(); if (!keepIds.has(id)) toDel.push(id); } catch {} } if (toDel.length) try { await eda.pcb_PrimitivePolyline.delete(toDel); } catch {} return toDel.length; };

const log = [];
const src = await eda.dmt_Pcb.getCurrentPcbInfo();
const srcBefore = ((await eda.pcb_PrimitiveComponent.getAll()) || []).length;

// detect
const reg = await getRegionLoops();
const lineLoops = await getLineLoops();
const outlines = [...reg.outlines, ...lineLoops];
outlines.sort((a, b) => bboxCenter(a.bbox).x - bboxCenter(b.bbox).x || bboxCenter(a.bbox).y - bboxCenter(b.bbox).y);
log.push(`detect: ${reg.outlines.length} region + ${lineLoops.length} line = ${outlines.length} 板框`);

const results = [];
for (let i = 0; i < outlines.length; i++) {
  const board = outlines[i];
  const targetName = `${src.name}_${i + 1}`;
  const all = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
  const existing = all.find((p) => p.name === targetName && !p.parentBoardName);
  if (existing) { await eda.dmt_Pcb.deletePcb(existing.uuid); log.push(`${targetName}: 删旧`); }
  const cloneUuid = await eda.dmt_Pcb.copyPcb(src.uuid);
  if (typeof cloneUuid !== 'string') { results.push({ name: targetName, error: 'copyPcb 失败' }); continue; }
  await eda.dmt_Pcb.modifyPcbName(cloneUuid, targetName);
  if (!await activateAndConfirm(cloneUuid)) { results.push({ name: targetName, error: '焦点未切换' }); continue; }

  // forceKeep：克隆上重识别 region+line，质心匹配本板
  const cReg = await getRegionLoops();
  const cLine = await getLineLoops();
  const cLoops = [...cReg.outlines, ...cReg.cutouts, ...cLine];
  const bc = bboxCenter(board.bbox);
  let bestD = Infinity, best = null;
  for (const l of cLoops) { const c = bboxCenter(l.bbox); const d = Math.hypot(c.x - bc.x, c.y - bc.y); if (d < bestD) { bestD = d; best = l; } }
  const forceKeep = new Set(best ? best.sourceIds : []);

  const byType = {};
  for (const [k, m] of Object.entries(TYPES)) byType[k] = (await eda[m].getAll()) || [];
  const rep = new Map();
  const mid = (a, b) => (a + b) / 2;
  for (const c of byType.components) { try { rep.set(c.getState_PrimitiveId(), { x: c.getState_X(), y: c.getState_Y() }); } catch {} }
  for (const p of byType.pads) { try { rep.set(p.getState_PrimitiveId(), { x: p.getState_X(), y: p.getState_Y() }); } catch {} }
  for (const v of byType.vias) { try { rep.set(v.getState_PrimitiveId(), { x: v.getState_X(), y: v.getState_Y() }); } catch {} }
  for (const l of byType.lines) { try { rep.set(l.getState_PrimitiveId(), { x: mid(l.getState_StartX(), l.getState_EndX()), y: mid(l.getState_StartY(), l.getState_EndY()) }); } catch {} }
  for (const a of byType.arcs) { try { rep.set(a.getState_PrimitiveId(), { x: mid(a.getState_StartX(), a.getState_EndX()), y: mid(a.getState_StartY(), a.getState_EndY()) }); } catch {} }
  for (const prim of [...byType.regions, ...byType.fills, ...byType.pours, ...byType.dimensions, ...byType.images]) { try { const id = prim.getState_PrimitiveId(); const bb = await eda.pcb_Primitive.getPrimitivesBBox([id]); if (bb && bb.minX !== undefined) rep.set(id, bboxCenter(bb)); } catch {} }

  const keep = new Set(forceKeep);
  const allIds = [];
  for (const k of Object.keys(byType)) for (const p of byType[k]) { const id = p.getState_PrimitiveId?.(); if (typeof id === 'string') allIds.push(id); }
  for (const id of allIds) { if (keep.has(id)) continue; const r = rep.get(id); if (!r) { keep.add(id); continue; } if (pointInPolygon(r, board.points)) keep.add(id); }
  let deleted = 0;
  for (const [k, m] of Object.entries(TYPES)) { const tids = byType[k].map((p) => p.getState_PrimitiveId?.()).filter((id) => typeof id === 'string'); const toDel = tids.filter((id) => !keep.has(id)); if (toDel.length) { try { await eda[m].delete(toDel); deleted += toDel.length; } catch {} } }
  const od1 = await deleteOtherBoardOutlines(forceKeep);
  const od2 = await deleteOtherLineOutlines(forceKeep);
  await eda.pcb_Document.save();
  log.push(`${targetName}: 留${allIds.length - deleted} 删${deleted} | 删${od1}Region板框 删${od2}线条板框`);
  results.push({ name: targetName, kept: allIds.length - deleted, deleted, od1, od2, forceKeep: forceKeep.size });
}
await activateAndConfirm(src.uuid);
const srcAfter = ((await eda.pcb_PrimitiveComponent.getAll()) || []).length;
log.push(`源 Component: ${srcBefore} → ${srcAfter}`);
return { srcIntact: srcBefore === srcAfter, outlines: outlines.length, results, log };
