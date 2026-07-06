const out = {};
const src = await eda.dmt_Pcb.getCurrentPcbInfo();
out.srcName = src.name;

// 第一次 copyPcb → clone1（EDA 自动命名）
const clone1 = await eda.dmt_Pcb.copyPcb(src.uuid);
const all1 = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
const c1 = all1.find((p) => p.uuid === clone1);
out.clone1AutoName = c1?.name;

// 第二次 copyPcb → clone2，再改名成 clone1 的名字（已存在）—— 模拟"目标名已存在"
const clone2 = await eda.dmt_Pcb.copyPcb(src.uuid);
out.clone2 = clone2;
try { out.renameToExisting = await eda.dmt_Pcb.modifyPcbName(clone2, c1.name); }
catch (e) { out.renameToExistingErr = String(e); }
const all2 = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
out.clone2NameAfter = all2.find((p) => p.uuid === clone2)?.name;

// 清理
try { await eda.dmt_Pcb.deletePcb(clone1); await eda.dmt_Pcb.deletePcb(clone2); } catch {}
return out;
