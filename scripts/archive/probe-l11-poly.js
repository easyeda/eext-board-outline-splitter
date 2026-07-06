// 探查 layer-11 上的两条 Polyline（非 Region）的几何，判断是否为板框轮廓。
const ids = ['a46ee7fea60073d9', 'd653978b6d41ac3f'];
await eda.pcb_SelectControl.clearSelected();
await eda.pcb_SelectControl.doSelectPrimitives(ids);
const arr = (await eda.pcb_SelectControl.getAllSelectedPrimitives()) ?? [];
const out = [];
for (const p of arr) {
  const o = { id: p.getState_PrimitiveId(), type: p.getState_PrimitiveType(), layer: p.getState_Layer() };
  try {
    const poly = typeof p.getState_Polygon === 'function' ? p.getState_Polygon() : undefined;
    const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon;
    o.src = Array.isArray(src) ? src.slice(0, 60) : src;
    if (Array.isArray(src)) {
      const nums = []; for (const t of src) if (typeof t === 'number') nums.push(t);
      if (nums.length >= 4) o.endGap = Math.round(Math.hypot(nums[0] - nums[nums.length - 2], nums[1] - nums[nums.length - 1]) * 100) / 100;
    }
  } catch (e) { o.srcErr = String(e); }
  try { const cp = typeof p.getState_ComplexPolygon === 'function' ? p.getState_ComplexPolygon() : undefined; if (cp) { const s = typeof cp.getSource === 'function' ? cp.getSource() : undefined; o.complexSrc = Array.isArray(s) ? s.slice(0, 60) : s; } } catch (e) {}
  out.push(o);
}
await eda.pcb_SelectControl.clearSelected();
return out;
