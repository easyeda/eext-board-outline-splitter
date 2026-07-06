const out = {};
out.cur = (await eda.dmt_Pcb.getCurrentPcbInfo())?.name;
const all = (await eda.pcb_PrimitivePolyline.getAll()) || [];
out.total = all.length;
out.items = all.map((p) => {
  const r = {};
  try { r.id = p.getState_PrimitiveId(); } catch (e) { r.idErr = String(e); }
  try { r.layer = p.getState_Layer(); } catch (e) { r.layerErr = String(e); }
  try { r.net = p.getState_Net?.(); } catch (e) { r.netErr = String(e); }
  try {
    const poly = p.getState_Polygon();
    const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon;
    r.src = src;
    if (Array.isArray(src)) {
      const nums = src.filter((v) => typeof v === 'number');
      const f = [nums[0], nums[1]];
      const l = [nums[nums.length - 2], nums[nums.length - 1]];
      r.first = f;
      r.last = l;
      r.numCount = nums.length;
      r.closed = Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6;
    }
  }
  catch (e) { r.srcErr = String(e); }
  return r;
});
return out;
