const out = {};
const src = await eda.dmt_Pcb.getCurrentPcbInfo();
out.srcUuid = src.uuid;
out.beforePcbs = ((await eda.dmt_Pcb.getAllPcbsInfo()) || []).map((p) => ({ name: p.name, uuid: p.uuid, parent: p.parentBoardName ?? '(free)' }));

const cloneUuid = await eda.dmt_Pcb.copyPcb(src.uuid);
out.cloneUuid = cloneUuid;
out.cloneUuidType = typeof cloneUuid;

out.afterPcbs = ((await eda.dmt_Pcb.getAllPcbsInfo()) || []).map((p) => ({ name: p.name, uuid: p.uuid, parent: p.parentBoardName ?? '(free)' }));

try { out.cloneInfo = await eda.dmt_Pcb.getPcbInfo(cloneUuid); }
catch (e) { out.cloneInfoErr = String(e); }

try { out.boards = await eda.dmt_Board.getAllBoardsInfo(); }
catch (e) { out.boardsErr = String(e); }

// 也看 createPcb 是否不同
return out;
