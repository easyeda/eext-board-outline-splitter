// 验证：getAll()（不带 layer）能否对 layer-11 Polyline 读到正确 src（对比 doSelect 已知值）。
const out = [];
let polys = [];
try { polys = (await eda.pcb_PrimitivePolyline.getAll()) ?? []; } catch (e) { return { err: String(e) }; }
for (const p of polys) {
  try {
    const layer = p.getState_Layer();
    if (layer !== 11) continue;
    const type = p.getState_PrimitiveType();
    const id = p.getState_PrimitiveId();
    const poly = typeof p.getState_Polygon === 'function' ? p.getState_Polygon() : undefined;
    const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon;
    out.push({ id, type, srcHead: Array.isArray(src) ? src.slice(0, 10) : null, srcLen: Array.isArray(src) ? src.length : 0 });
  } catch (e) { out.push({ err: String(e) }); }
}
return { count: out.length, items: out };
