// 验证修复后：用 rawEnds（原始 src 首尾）+ 15mil 判定单条闭合，确认选中图形能直成环。
const CLOSE = 15;
const rawEnds = (src) => {
  if (!Array.isArray(src)) return null;
  const n = []; for (const t of src) if (typeof t === 'number') n.push(t);
  if (n.length < 4) return null;
  return { first: { x: n[0], y: n[1] }, last: { x: n[n.length - 2], y: n[n.length - 1] } };
};
const out = { items: [] };
const polys = (await eda.pcb_PrimitivePolyline.getAll()) ?? [];
for (const p of polys) {
  try {
    if (p.getState_Layer() !== 1) continue;
    const net = typeof p.getState_Net === 'function' ? p.getState_Net() : undefined;
    if (net) continue;
    const id = p.getState_PrimitiveId();
    const poly = p.getState_Polygon();
    const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon;
    const ends = rawEnds(src);
    const cmd = Array.isArray(src) ? src[0] : null;
    const gap = ends ? Math.round(Math.hypot(ends.first.x - ends.last.x, ends.first.y - ends.last.y) * 100) / 100 : null;
    const endsMeet = ends ? gap < CLOSE : false;
    const isWhole = cmd === 'CIRCLE' || cmd === 'R';
    out.items.push({ id, cmd: typeof cmd === 'string' ? cmd : 'L', rawEndGap: gap, endsMeet, isWhole, verdict: (endsMeet || isWhole) ? '直成环' : '进多段拼接' });
  } catch (e) {}
}
out.selected = out.items.find((i) => i.id === '38162063e3815766');
return out;
