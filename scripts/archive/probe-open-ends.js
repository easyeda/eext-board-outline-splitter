const polys = ((await eda.pcb_PrimitivePolyline.getAll()) || []).filter((p) => { try { return p.getState_Layer() === 1; } catch { return false; } });
const segs = [];
for (const p of polys) {
  try {
    const net = p.getState_Net?.();
    if (net) continue;
    const poly = p.getState_Polygon();
    const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon;
    if (!Array.isArray(src) || src[0] === 'R' || src[0] === 'CIRCLE') continue;
    const nums = src.filter((v) => typeof v === 'number');
    segs.push({ id: p.getState_PrimitiveId(), src, first: [nums[0], nums[1]], last: [nums[nums.length - 2], nums[nums.length - 1]] });
  }
  catch {}
}
const near = [];
for (let i = 0; i < segs.length; i++) {
  for (let j = 0; j < segs.length; j++) {
    if (i === j) continue;
    for (const [ea, eb] of [[segs[i].first, segs[j].last], [segs[i].last, segs[j].first]]) {
      const d = Math.hypot(ea[0] - eb[0], ea[1] - eb[1]);
      if (d < 50) near.push({ a: segs[i].id, b: segs[j].id, d: Math.round(d * 1000) / 1000, p1: ea, p2: eb });
    }
  }
}
return { segCount: segs.length, segs, nearPairs: near };
