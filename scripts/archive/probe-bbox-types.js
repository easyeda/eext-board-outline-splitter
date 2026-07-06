const out = {};
out.cur = (await eda.dmt_Pcb.getCurrentPcbInfo())?.name;
const testBBox = async (mod) => {
  const a = (await eda[mod].getAll()) || [];
  if (!a.length) return { count: 0 };
  const id = a[0].getState_PrimitiveId();
  let bb;
  try { bb = await eda.pcb_Primitive.getPrimitivesBBox([id]); }
  catch (e) { return { id, err: String(e).slice(0, 60) }; }
  return { id, bbox: bb, isEmpty: bb && Object.keys(bb).length === 0 };
};
for (const m of ['pcb_PrimitiveLine', 'pcb_PrimitiveFill', 'pcb_PrimitivePour', 'pcb_PrimitiveImage', 'pcb_PrimitiveComponent', 'pcb_PrimitivePad', 'pcb_PrimitiveString']) {
  out[m] = await testBBox(m);
}
return out;
