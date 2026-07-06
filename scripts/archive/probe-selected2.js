const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
const arr = Array.isArray(sel) ? sel : (sel ? [sel] : []);
return arr.map((p) => {
  const r = {};
  try { r.id = p.getState_PrimitiveId(); } catch (e) { r.idErr = String(e); }
  try { r.type = p.getState_PrimitiveType(); } catch (e) { r.typeErr = String(e); }
  try { r.layer = p.getState_Layer?.(); } catch (e) { r.layerErr = String(e); }
  try { r.net = p.getState_Net?.(); } catch (e) { r.netErr = String(e); }
  try { if (typeof p.getState_Polygon === 'function') r.polygon = p.getState_Polygon()?.polygon; } catch (e) {}
  try { if (typeof p.getState_ComplexPolygon === 'function') r.cp_source = p.getState_ComplexPolygon()?.getSource?.(); } catch (e) {}
  try { if (typeof p.getState_StartX === 'function') { r.start = { x: p.getState_StartX(), y: p.getState_StartY() }; r.end = { x: p.getState_EndX(), y: p.getState_EndY() }; if (typeof p.getState_ArcAngle === 'function') r.arcAngle = p.getState_ArcAngle(); } } catch (e) {}
  let pr = p; const ns = new Set();
  while (pr && pr !== Object.prototype) { for (const n of Object.getOwnPropertyNames(pr)) ns.add(n); pr = Object.getPrototypeOf(pr); }
  r.stateMethods = [...ns].filter((n) => { try { return typeof p[n] === 'function' && n.startsWith('getState'); } catch { return false; } }).sort();
  return r;
});
