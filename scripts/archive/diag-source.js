// 输出顶层无网络 Polyline 的完整 source 命令流，判断是否成对反向存储。
const out = [];
const polys = (await eda.pcb_PrimitivePolyline.getAll()) ?? [];
for (const p of polys) {
  try {
    if (p.getState_Layer() !== 1) continue;
    const net = typeof p.getState_Net === 'function' ? p.getState_Net() : undefined;
    if (net) continue;
    const id = p.getState_PrimitiveId();
    const poly = p.getState_Polygon();
    const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon;
    out.push({ id, src: Array.isArray(src) ? src.slice(0, 40) : String(src).slice(0, 200) });
  } catch (e) { out.push({ err: String(e) }); }
}
return { count: out.length, items: out };
