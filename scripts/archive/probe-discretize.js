const pol11 = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
const out = [];
for (const p of pol11) {
  const id = p.getState_PrimitiveId();
  const poly = p.getState_Polygon();
  const r = { id };
  try { const d = await eda.pcb_MathPolygon.discretize(poly); r.discretizeIsArray = Array.isArray(d); r.discretizeLen = Array.isArray(d) ? d.length : null; r.discretizeSample = Array.isArray(d) ? d.slice(0, 40) : String(d).slice(0,400); if (Array.isArray(d) && d[0] != null) { r.elem0kind = Array.isArray(d[0])?'array':typeof d[0]; if (Array.isArray(d[0])) r.elem0 = d[0].slice(0,4); } } catch(e) { r.discErr = String(e); }
  try { r.boardLine = await eda.pcb_Primitive.getPrimitiveBoardLine(id); r.boardLineType = typeof r.boardLine; if (r.boardLine && typeof r.boardLine==='object') r.boardLineStr = JSON.stringify(r.boardLine).slice(0,500); } catch(e) { r.boardLineErr = String(e); }
  try { const by = await eda.pcb_Primitive.getPrimitiveByPrimitiveId(id); r.byIdType = typeof by; if (by && typeof by==='object') { const keys = Object.keys(by); r.byIdKeys = keys.slice(0,40); r.byIdStr = JSON.stringify(by).slice(0,800); } else r.byIdVal = by; } catch(e) { r.byIdErr = String(e); }
  out.push(r);
}
return out;
