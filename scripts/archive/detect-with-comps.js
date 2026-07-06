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

const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
await eda.pcb_SelectControl.clearSelected();
await eda.pcb_SelectControl.doSelectPrimitives(list.map((p) => p.getState_PrimitiveId()));
const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
const outlines = [];
for (const p of sel) {
  if (p.getState_PrimitiveType() !== 'Region') continue;
  if (p.getState_RegionName() !== 'Board Outline') continue;
  const points = parseSource(p.getState_ComplexPolygon().getSource());
  if (points.length < 3) continue;
  outlines.push({ points, bbox: bboxOf(points) });
}
await eda.pcb_SelectControl.clearSelected();
outlines.sort((a, b) => bboxCenter(a.bbox).x - bboxCenter(b.bbox).x || bboxCenter(a.bbox).y - bboxCenter(b.bbox).y);

const comps = (await eda.pcb_PrimitiveComponent.getAll()) || [];
const compCenters = comps.map((c) => { try { return { x: c.getState_X(), y: c.getState_Y() }; } catch { return null; } }).filter(Boolean);

const preview = outlines.map((o, i) => ({
  board: i + 1,
  center: bboxCenter(o.bbox),
  bbox: o.bbox,
  pts: o.points.length,
  compsInside: compCenters.filter((c) => pointInPolygon(c, o.points)).length,
}));

// 器件是否落点在所有板框外（域外）
const outsideAll = compCenters.filter((c) => !outlines.some((o) => pointInPolygon(c, o.points))).length;

return { boardCount: outlines.length, compTotal: compCenters.length, preview, compsOutsideAllBoards: outsideAll };
