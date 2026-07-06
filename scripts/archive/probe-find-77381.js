const id = '77381e7e10b15e43';
const out = { id };
for (const [t, m] of Object.entries({ Object: 'pcb_PrimitiveObject', Poured: 'pcb_PrimitivePoured', Region: 'pcb_PrimitiveRegion', Polyline: 'pcb_PrimitivePolyline', Fill: 'pcb_PrimitiveFill' })) {
  try {
    const a = (await eda[m]?.getAll?.()) || [];
    const found = a.find((p) => { try { return p.getState_PrimitiveId?.() === id; } catch { return false; } });
    out[t] = found
      ? { found: true, type: found.getState_PrimitiveType?.(), layer: found.getState_Layer?.(), name: found.getState_RegionName?.(), src: found.getState_ComplexPolygon?.()?.getSource?.() ?? found.getState_Polygon?.()?.polygon }
      : { found: false, count: a.length };
  }
  catch (e) { out[t] = 'err:' + String(e).slice(0, 60); }
}
// 重新选中读
try {
  await eda.pcb_SelectControl.clearSelected();
  await eda.pcb_SelectControl.doSelectPrimitives([id]);
  const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
  const arr = Array.isArray(sel) ? sel : sel ? [sel] : [];
  out.reselCount = arr.length;
  if (arr[0]) {
    out.reselType = arr[0].getState_PrimitiveType?.();
    out.reselLayer = arr[0].getState_Layer?.();
    out.reselName = arr[0].getState_RegionName?.();
    out.reselSrc = arr[0].getState_ComplexPolygon?.()?.getSource?.();
    let pr = arr[0]; const ns = new Set();
    while (pr && pr !== Object.prototype) { for (const n of Object.getOwnPropertyNames(pr)) ns.add(n); pr = Object.getPrototypeOf(pr); }
    out.reselMethods = [...ns].filter((n) => { try { return typeof arr[0][n] === 'function' && n.startsWith('getState'); } catch { return false; } }).sort();
  }
}
catch (e) { out.reselErr = String(e); }
return out;
