// 验证：getAll() 视图下 getState_RegionName() 能否区分 Region 板框与真 Polyline。
const out = [];
const polys = (await eda.pcb_PrimitivePolyline.getAll()) ?? [];
for (const p of polys) {
  try {
    if (p.getState_Layer() !== 11) continue;
    out.push({
      id: p.getState_PrimitiveId(),
      type: p.getState_PrimitiveType(),
      regionName: typeof p.getState_RegionName === 'function' ? p.getState_RegionName() : 'NO_FN',
      hasComplex: typeof p.getState_ComplexPolygon === 'function',
    });
  } catch (e) { out.push({ err: String(e) }); }
}
return out;
