const out = {};
try {
  const ids = await eda.pcb_SelectControl.getAllSelectedPrimitives_PrimitiveId();
  out.ids = ids;
  out.idCount = Array.isArray(ids) ? ids.length : typeof ids;
}
catch (e) { out.idsErr = String(e); }
// 用 id 重新选中读真实对象
try {
  if (Array.isArray(out.ids) && out.ids.length > 0) {
    await eda.pcb_SelectControl.clearSelected();
    await eda.pcb_SelectControl.doSelectPrimitives(out.ids);
    const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
    const arr = Array.isArray(sel) ? sel : sel ? [sel] : [];
    out.items = arr.map((p) => {
      const r = {};
      try { r.id = p.getState_PrimitiveId(); } catch (e) { r.idErr = String(e); }
      try { r.type = p.getState_PrimitiveType(); } catch (e) { r.typeErr = String(e); }
      try { r.layer = p.getState_Layer?.(); } catch (e) { r.layerErr = String(e); }
      try { r.net = p.getState_Net?.(); } catch {}
      try { r.name = p.getState_RegionName?.(); } catch {}
      try { const cp = p.getState_ComplexPolygon?.(); r.cpSrc = cp?.getSource?.(); } catch {}
      try { r.poly = p.getState_Polygon?.()?.polygon ?? p.getState_Polygon?.(); } catch {}
      return r;
    });
    await eda.pcb_SelectControl.clearSelected();
  }
}
catch (e) { out.readErr = String(e); }
return out;
