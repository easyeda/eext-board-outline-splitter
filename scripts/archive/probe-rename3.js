const out = {};
const src = await eda.dmt_Pcb.getCurrentPcbInfo();
const all0 = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
const t2 = all0.find((p) => p.name === 'PCB10086_2' && !p.parentBoardName);
if (t2) { await eda.dmt_Pcb.deletePcb(t2.uuid); out.deleted2 = true; }
out.allFreeAfterDelete = ((await eda.dmt_Pcb.getAllPcbsInfo()) || []).filter((p) => !p.parentBoardName).map((p) => p.name);

// copyPcb 副本自动名（_2 已删空）
const clone = await eda.dmt_Pcb.copyPcb(src.uuid);
const all1 = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
const c = all1.find((p) => p.uuid === clone);
out.cloneAutoName_afterDelete2 = c?.name;

// modifyPcbName 改成 _2（刚删空，不冲突）
try { out.renameReturn = await eda.dmt_Pcb.modifyPcbName(clone, 'PCB10086_2'); }
catch (e) { out.renameErr = String(e); }
const all2 = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
out.cloneNameAfterRename = all2.find((p) => p.uuid === clone)?.name;

try { await eda.dmt_Pcb.deletePcb(clone); } catch {}
return out;
