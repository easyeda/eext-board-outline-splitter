// 枚举 layer-11 板框/挖孔 Region，确认是否存在 Region 板框与线条板框冲突。
const L = 11;
const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, L)) ?? [];
const ids = list.map((p) => { try { return p.getState_PrimitiveId(); } catch { return null; } }).filter(Boolean);
const out = { layer11IdCount: ids.length, regions: [] };
await eda.pcb_SelectControl.clearSelected();
await eda.pcb_SelectControl.doSelectPrimitives(ids);
const arr = (await eda.pcb_SelectControl.getAllSelectedPrimitives()) ?? [];
for (const p of arr) {
  try {
    const t = p.getState_PrimitiveType();
    if (t !== 'Region') { out.regions.push({ nonRegion: t, id: p.getState_PrimitiveId() }); continue; }
    const name = p.getState_RegionName();
    const cp = typeof p.getState_ComplexPolygon === 'function' ? p.getState_ComplexPolygon() : undefined;
    const src = cp && typeof cp.getSource === 'function' ? cp.getSource() : null;
    out.regions.push({ name, id: p.getState_PrimitiveId(), src: Array.isArray(src) ? src.slice(0, 12) : null });
  } catch (e) { out.regions.push({ err: String(e) }); }
}
await eda.pcb_SelectControl.clearSelected();
return out;
