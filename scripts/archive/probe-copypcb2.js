const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const src = await eda.dmt_Pcb.getCurrentPcbInfo();
out.src = { name: src.name, uuid: src.uuid };
out.srcComponentCount = ((await eda.pcb_PrimitiveComponent.getAll()) || []).length;

const snap = async () => ((await eda.dmt_Pcb.getAllPcbsInfo()) || []).map((p) => ({ name: p.name, uuid: p.uuid, parent: p.parentBoardName ?? '(free)' }));
const cur = async () => { const c = await eda.dmt_Pcb.getCurrentPcbInfo(); return c ? { name: c.name, uuid: c.uuid } : null; };

// 1. createPcb：创建空 PCB
try {
  const r = await eda.dmt_Pcb.createPcb();
  out.createPcbReturn = r; out.createPcbType = typeof r;
  await sleep(800);
  out.afterCreate_all = await snap();
  out.afterCreate_cur = await cur();
}
catch (e) { out.createPcbErr = String(e); }

// 2. copyPcb + 长 sleep（异步创建？）
try {
  const r = await eda.dmt_Pcb.copyPcb(src.uuid);
  out.copyPcbReturn = r; out.copyPcbType = typeof r;
  await sleep(1500);
  out.afterCopy_all = await snap();
  out.afterCopy_cur = await cur();
}
catch (e) { out.copyPcbErr = String(e); }

return out;
