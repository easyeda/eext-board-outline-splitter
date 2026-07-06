const out = {};
const ids = await eda.pcb_SelectControl.getAllSelectedPrimitives_PrimitiveId();
out.selectedIds = ids;
out.count = Array.isArray(ids) ? ids.length : 0;

// 逐个读取选中图元的类型 / layer / 几何
out.items = [];
const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
const arr = Array.isArray(sel) ? sel : (sel ? [sel] : []);
for (const p of arr) {
  const item = {};
  try { item.id = p.getState_PrimitiveId(); } catch(e) { item.idErr = String(e); }
  try { item.type = p.getState_PrimitiveType(); } catch(e) { item.typeErr = String(e); }
  try { item.layer = p.getState_Layer?.(); } catch(e) { item.layerErr = String(e); }
  // 几何：尝试多种
  try {
    if (typeof p.getState_Polygon === 'function') item.polygon = p.getState_Polygon()?.polygon;
  } catch(e) { item.polyErr = String(e); }
  try {
    if (typeof p.getState_StartX === 'function') {
      item.start = { x: p.getState_StartX(), y: p.getState_StartY() };
      item.end = { x: p.getState_EndX(), y: p.getState_EndY() };
      if (typeof p.getState_ArcAngle === 'function') item.arcAngle = p.getState_ArcAngle();
    }
  } catch(e) { item.geoErr = String(e); }
  // 列出该图元所有 getState 方法，便于兜底
  let pr = p; const ns = new Set();
  while (pr && pr !== Object.prototype) { for (const n of Object.getOwnPropertyNames(pr)) ns.add(n); pr = Object.getPrototypeOf(pr); }
  item.stateMethods = [...ns].filter(n => { try { return typeof p[n]==='function' && n.startsWith('getState'); } catch { return false; } }).sort();
  out.items.push(item);
}
return out;
