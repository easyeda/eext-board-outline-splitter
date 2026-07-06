const out = {};
const types = {
  Line: 'pcb_PrimitiveLine', Arc: 'pcb_PrimitiveArc', Polyline: 'pcb_PrimitivePolyline',
  Region: 'pcb_PrimitiveRegion', Fill: 'pcb_PrimitiveFill', Pour: 'pcb_PrimitivePour',
  Dimension: 'pcb_PrimitiveDimension', String: 'pcb_PrimitiveString', Image: 'pcb_PrimitiveImage',
  Attribute: 'pcb_PrimitiveAttribute', Pad: 'pcb_PrimitivePad', Via: 'pcb_PrimitiveVia'
};
out.layer11Counts = {};
for (const [t, mod] of Object.entries(types)) {
  try { const arr = (await eda[mod].getAll(undefined, 11)) || []; out.layer11Counts[t] = arr.length; }
  catch(e) { out.layer11Counts[t] = 'err:'+String(e); }
}

// 对照：component 的 bbox（验证 getPrimitivesBBox 语义）
const comps = (await eda.pcb_PrimitiveComponent.getAll()) || [];
if (comps[0]) {
  try { out.comp0BBox = await eda.pcb_Primitive.getPrimitivesBBox([comps[0].getState_PrimitiveId()]); } catch(e){ out.comp0BBoxErr = String(e); }
  out.comp0Center = { x: comps[0].getState_X(), y: comps[0].getState_Y() };
}

// 第一条 polyline 深探：完整 stringify + 所有 own key
const pol11 = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
if (pol11[0]) {
  const p0 = pol11[0];
  try { out.p0polyStringified = JSON.stringify(p0.getState_Polygon()); } catch(e){ out.p0strErr = String(e); }
  // 看是否有更完整的几何 API
  let pr = p0; const ns = new Set();
  while (pr && pr !== Object.prototype) { for (const n of Object.getOwnPropertyNames(pr)) ns.add(n); pr = Object.getPrototypeOf(pr); }
  out.p0allMethods = [...ns].filter(n => { try { return typeof p0[n]==='function'; } catch { return false; } }).sort();
}
return out;
