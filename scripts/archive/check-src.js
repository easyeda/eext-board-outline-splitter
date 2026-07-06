const out = {};
const src = await eda.dmt_Pcb.getCurrentPcbInfo();
out.src = { name: src.name, uuid: src.uuid };
out.allPcbs = ((await eda.dmt_Pcb.getAllPcbsInfo()) || []).map((p) => ({ name: p.name, parent: p.parentBoardName ?? '(free)' }));
for (const [k, m] of Object.entries({ Line: 'pcb_PrimitiveLine', Component: 'pcb_PrimitiveComponent', Pad: 'pcb_PrimitivePad', Fill: 'pcb_PrimitiveFill', Pour: 'pcb_PrimitivePour', String: 'pcb_PrimitiveString', Image: 'pcb_PrimitiveImage' })) {
  try { out[k] = ((await eda[m].getAll()) || []).length; } catch (e) { out[k] = 'err'; }
}
return out;
