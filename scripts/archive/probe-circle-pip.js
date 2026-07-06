const asNum = (v) => typeof v === 'number' ? v : NaN;
const parseSource = (s) => { if (s[0] === 'CIRCLE') { const cx = asNum(s[1]), cy = asNum(s[2]), r = asNum(s[3]); const p = []; for (let i = 0; i < 72; i++) { const a = (i / 72) * 2 * Math.PI; p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } return p; } return []; };
const pointInPolygon = (pt, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y; const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-18) + xi); if (intersect) inside = !inside; } return inside; };
const polys = (await eda.pcb_PrimitivePolyline.getAll()) || [];
const c = polys.find((p) => p.getState_PrimitiveId() === '98a680e33716a96c');
const src = c.getState_Polygon()?.getSource?.() ?? c.getState_Polygon()?.polygon;
const pts = parseSource(src);
const center = { x: 7830, y: -1870 };
const nearEdge = { x: 7830 + 400, y: -1870 };
const outside = { x: 7830 + 500, y: -1870 };
return {
  ptsCount: pts.length,
  samplePts: [pts[0], pts[18], pts[36], pts[54]],
  center_in: pointInPolygon(center, pts),
  nearEdge_in: pointInPolygon(nearEdge, pts),
  outside_in: pointInPolygon(outside, pts),
};
