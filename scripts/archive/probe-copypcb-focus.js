const out = {};
const src = await eda.dmt_Pcb.getCurrentPcbInfo();
out.before = { uuid: src.uuid, name: src.name };

const r = await eda.dmt_Pcb.copyPcb(src.uuid);
out.copyReturn = r;
out.copyReturnType = typeof r;

const after = await eda.dmt_Pcb.getCurrentPcbInfo();
out.after = after ? { uuid: after.uuid, name: after.name } : null;
out.focusChanged = after && after.uuid !== src.uuid;

out.allPcbsAfter = ((await eda.dmt_Pcb.getAllPcbsInfo()) || []).map((p) => ({ name: p.name, uuid: p.uuid, parent: p.parentBoardName ?? '(free)' }));

// 试 modifyPcbName + 再查
if (after && after.uuid !== src.uuid) {
  try { await eda.dmt_Pcb.modifyPcbName(after.uuid, 'TEST_CLONE_NAME'); const a2 = await eda.dmt_Pcb.getCurrentPcbInfo(); out.afterRename = a2?.name; } catch (e) { out.renameErr = String(e); }
}
return out;
