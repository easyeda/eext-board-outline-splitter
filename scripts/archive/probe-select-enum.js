const out = {};
try { await eda.pcb_SelectControl.clearSelected(); } catch(e) { out.clearErr = String(e); }
try { const r = await eda.pcb_SelectControl.doSelectPrimitives(['e102', '5106142228bfb93b']); out.selectResult = r; }
catch(e) { out.selectErr = String(e); }
const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
const arr = Array.isArray(sel) ? sel : (sel ? [sel] : []);
out.selectedCount = arr.length;
out.items = [];
for (const p of arr) {
  const item = {};
  try { item.id = p.getState_PrimitiveId(); } catch(e) { item.idErr = String(e); }
  try { item.type = p.getState_PrimitiveType(); } catch(e) { item.typeErr = String(e); }
  try { item.layer = p.getState_Layer?.(); } catch(e) {}
  try { item.regionName = p.getState_RegionName?.(); } catch(e) {}
  try { const cp = p.getState_ComplexPolygon?.(); if (cp) item.source = cp.getSource?.(); } catch(e) { item.cpErr = String(e); }
  out.items.push(item);
}
return out;
