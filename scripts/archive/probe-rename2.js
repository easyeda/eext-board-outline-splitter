const out = {};
const src = await eda.dmt_Pcb.getCurrentPcbInfo();
out.srcName = src.name;
out.allFreeBefore = ((await eda.dmt_Pcb.getAllPcbsInfo()) || []).filter((p) => !p.parentBoardName).map((p) => p.name);

// copyPcb 副本自动名
const clone = await eda.dmt_Pcb.copyPcb(src.uuid);
const all1 = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
const c = all1.find((p) => p.uuid === clone);
out.cloneAutoName = c?.name;

// modifyPcbName 改成副本自己的名（自我重名测试）
try { out.selfRenameReturn = await eda.dmt_Pcb.modifyPcbName(clone, c.name); }
catch (e) { out.selfRenameErr = String(e); }
const all2 = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
out.cloneNameAfterSelfRename = all2.find((p) => p.uuid === clone)?.name;

// 清理
try { await eda.dmt_Pcb.deletePcb(clone); } catch {}
return out;
