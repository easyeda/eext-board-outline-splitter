const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};

// 清理之前的测试残留（游离的非源 PCB）
const all0 = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
out.cleaned = [];
for (const p of all0) {
  if (!p.parentBoardName && p.name !== 'PCB') {
    try { await eda.dmt_Pcb.deletePcb(p.uuid); out.cleaned.push(p.name); } catch (e) { out['cleanErr_' + p.name] = String(e); }
  }
}
await sleep(300);

// 干净 copyPcb，验证克隆是完整副本
const src = await eda.dmt_Pcb.getCurrentPcbInfo();
const cloneUuid = await eda.dmt_Pcb.copyPcb(src.uuid);
out.cloneUuid = cloneUuid;
out.cloneType = typeof cloneUuid;

if (typeof cloneUuid === 'string') {
  await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(cloneUuid));
  await sleep(600);
  out.cloneCurName = (await eda.dmt_Pcb.getCurrentPcbInfo())?.name;
  out.cloneCounts = {
    Component: ((await eda.pcb_PrimitiveComponent.getAll()) || []).length,
    Line: ((await eda.pcb_PrimitiveLine.getAll()) || []).length,
    Pad: ((await eda.pcb_PrimitivePad.getAll()) || []).length,
  };
  try { await eda.dmt_Pcb.deletePcb(cloneUuid); out.cloneDeleted = true; }
  catch (e) { out.cloneDelErr = String(e); }
}
await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(src.uuid));
return out;
