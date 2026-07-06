const readSrc = (p) => {
  try { const poly = p.getState_Polygon(); return poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon; }
  catch (e) { return 'err:' + String(e); }
};
const a1 = (await eda.pcb_PrimitivePolyline.getAll(undefined, 1)) || [];
const aAll = (await eda.pcb_PrimitivePolyline.getAll()) || [];
return {
  count: { byLayer1: a1.length, byAll: aAll.length },
  byLayer1: a1.map((p) => ({ id: p.getState_PrimitiveId(), layer: p.getState_Layer?.(), src: readSrc(p) })),
  byAll_filtered_layer1: aAll.filter((p) => { try { return p.getState_Layer() === 1; } catch { return false; } }).map((p) => ({ id: p.getState_PrimitiveId(), layer: p.getState_Layer?.(), net: p.getState_Net?.(), src: readSrc(p) })),
};
