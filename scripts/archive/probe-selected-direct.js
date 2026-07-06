const ids = await eda.pcb_SelectControl.getAllSelectedPrimitives_PrimitiveId();
const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
const arr = Array.isArray(sel) ? sel : sel ? [sel] : [];
return {
  ids,
  idCount: Array.isArray(ids) ? ids.length : ids,
  selCount: arr.length,
  items: arr.map((p) => {
    const r = {};
    try { r.id = p.getState_PrimitiveId(); } catch (e) { r.idErr = String(e); }
    try { r.type = p.getState_PrimitiveType(); } catch (e) { r.typeErr = String(e); }
    try { r.layer = p.getState_Layer?.(); } catch (e) { r.layerErr = String(e); }
    try { r.net = p.getState_Net?.(); } catch {}
    try { r.name = p.getState_RegionName?.(); } catch {}
    try { r.cpSrc = p.getState_ComplexPolygon?.()?.getSource?.(); } catch {}
    try { r.poly = p.getState_Polygon?.()?.polygon ?? p.getState_Polygon?.(); } catch {}
    let pr = p; const ns = new Set();
    while (pr && pr !== Object.prototype) { for (const n of Object.getOwnPropertyNames(pr)) ns.add(n); pr = Object.getPrototypeOf(pr); }
    r.stateMethods = [...ns].filter((n) => { try { return typeof p[n] === 'function' && n.startsWith('getState'); } catch { return false; } }).sort();
    return r;
  }),
};
