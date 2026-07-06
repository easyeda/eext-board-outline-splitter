// 完整 splitAll 等价逻辑（端到端真实拆分验证）
const parseSource = (s) => {
  if (!Array.isArray(s) || s.length === 0) return [];
  const asNum = (v) => typeof v === 'number' ? v : NaN;
  if (s[0] === 'R') { const x = asNum(s[1]), y = asNum(s[2]), w = asNum(s[3]), h = asNum(s[4]); if ([x, y, w, h].some(Number.isNaN)) return []; return [{ x, y }, { x: x + w, y }, { x: x + w, y: y - h }, { x, y: y - h }]; }
  if (s[0] === 'CIRCLE') { const cx = asNum(s[1]), cy = asNum(s[2]), r = asNum(s[3]); if ([cx, cy, r].some(Number.isNaN) || r <= 0) return []; const p = []; for (let i = 0; i < 72; i++) { const a = (i / 72) * 2 * Math.PI; p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } return p; }
  return [];
};
const bboxOf = (pts) => { let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9; for (const p of pts) { if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x; if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y; } return { minX: mnx, minY: mny, maxX: mxx, maxY: mxy }; };
const bboxCenter = (b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
const pointInPolygon = (pt, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y; const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-18) + xi); if (intersect) inside = !inside; } return inside; };

const TYPES = { lines: 'pcb_PrimitiveLine', arcs: 'pcb_PrimitiveArc', components: 'pcb_PrimitiveComponent', pads: 'pcb_PrimitivePad', vias: 'pcb_PrimitiveVia', regions: 'pcb_PrimitiveRegion', fills: 'pcb_PrimitiveFill', pours: 'pcb_PrimitivePour', dimensions: 'pcb_PrimitiveDimension', images: 'pcb_PrimitiveImage' };

const log = [];
const src = await eda.dmt_Pcb.getCurrentPcbInfo();

// ---- detect ----
const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
const ids = list.map((p) => p.getState_PrimitiveId());
await eda.pcb_SelectControl.clearSelected();
await eda.pcb_SelectControl.doSelectPrimitives(ids);
const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
const outlines = [], cutouts = [];
for (const p of sel) {
  if (p.getState_PrimitiveType() !== 'Region') continue;
  const name = p.getState_RegionName();
  const kind = name === 'Board Outline' ? 'outline' : name === 'Board Cutout' ? 'cutout' : null;
  if (!kind) continue;
  const points = parseSource(p.getState_ComplexPolygon().getSource());
  if (points.length < 3) continue;
  (kind === 'outline' ? outlines : cutouts).push({ regionId: p.getState_PrimitiveId(), points, bbox: bboxOf(points) });
}
await eda.pcb_SelectControl.clearSelected();
outlines.sort((a, b) => bboxCenter(a.bbox).x - bboxCenter(b.bbox).x || bboxCenter(a.bbox).y - bboxCenter(b.bbox).y);
log.push(`detect: ${outlines.length} outlines, ${cutouts.length} cutouts`);

// ---- split 每板 ----
const results = [];
for (let i = 0; i < outlines.length; i++) {
  const board = outlines[i];
  const targetName = `${src.name}_${i + 1}`;
  try {
    const all = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
    const existing = all.find((p) => p.name === targetName && !p.parentBoardName);
    if (existing) { await eda.dmt_Pcb.deletePcb(existing.uuid); log.push(`${targetName}: 删除旧同名`); }

    const cloneUuid = await eda.dmt_Pcb.copyPcb(src.uuid);
    await eda.dmt_Pcb.modifyPcbName(cloneUuid, targetName);
    await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(cloneUuid));
    await new Promise((r) => setTimeout(r, 500));

    // forceKeep：克隆上重识别，按质心匹配本板 outline
    const list2 = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
    await eda.pcb_SelectControl.clearSelected();
    await eda.pcb_SelectControl.doSelectPrimitives(list2.map((p) => p.getState_PrimitiveId()));
    const sel2 = await eda.pcb_SelectControl.getAllSelectedPrimitives();
    const forceKeep = new Set();
    const bc = bboxCenter(board.bbox);
    let bestD = Infinity, bestId = null;
    for (const p of sel2) { try { const bb = await eda.pcb_Primitive.getPrimitivesBBox([p.getState_PrimitiveId()]); if (bb && bb.minX !== undefined) { const c = bboxCenter(bb); const d = Math.hypot(c.x - bc.x, c.y - bc.y); if (d < bestD) { bestD = d; bestId = p.getState_PrimitiveId(); } } } catch {} }
    if (bestId) forceKeep.add(bestId);
    await eda.pcb_SelectControl.clearSelected();

    // 采集 + 代表点
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

    // decideKeep
    const keep = new Set(forceKeep);
    const allIds = [];
    for (const k of Object.keys(byType)) for (const p of byType[k]) { const id = p.getState_PrimitiveId?.(); if (typeof id === 'string') allIds.push(id); }
    for (const id of allIds) { if (keep.has(id)) continue; const r = rep.get(id); if (!r) { keep.add(id); continue; } if (pointInPolygon(r, board.points)) keep.add(id); }

    // deleteNonKeep
    let deleted = 0;
    for (const [k, m] of Object.entries(TYPES)) {
      const tids = byType[k].map((p) => p.getState_PrimitiveId?.()).filter((id) => typeof id === 'string');
      const toDel = tids.filter((id) => !keep.has(id));
      if (toDel.length) { try { await eda[m].delete(toDel); deleted += toDel.length; } catch (e) { log.push(`${targetName}: 删 ${k} 失败 ${String(e).slice(0, 40)}`); } }
    }
    await eda.pcb_Document.save();
    results.push({ name: targetName, total: allIds.length, kept: allIds.length - deleted, deleted });
    log.push(`${targetName}: 总${allIds.length} 留${allIds.length - deleted} 删${deleted}`);
  }
  catch (e) {
    results.push({ name: targetName, error: String(e) });
    log.push(`${targetName}: 失败 ${String(e)}`);
  }
}
await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(src.uuid));
return { outlines: outlines.map((o) => ({ c: bboxCenter(o.bbox), pts: o.points.length })), cutouts: cutouts.length, results, log };
