const out = {};
const safe = async (label, fn) => { try { out[label] = await fn(); } catch (e) { out[label] = 'THREW: ' + (e && e.message ? e.message : String(e)); } };

const cur = await eda.dmt_Pcb.getCurrentPcbInfo();
out.src_before = cur ? { uuid: cur.uuid, name: cur.name, parentBoardName: cur.parentBoardName } : null;
if (!cur) return out;
const srcUuid = cur.uuid;

let sch, boardName;
await safe('createSchematic', async () => { sch = await eda.dmt_Schematic.createSchematic(); return sch; });
await safe('createBoard', async () => { boardName = await eda.dmt_Board.createBoard(sch, srcUuid); return boardName; });
out.boardName = boardName;

await safe('copyPcb', async () => eda.dmt_Pcb.copyPcb(srcUuid));
const clone = out.copyPcb;
out.clone_type = typeof clone;
if (typeof clone === 'string' && clone) {
  await safe('clone_info', async () => eda.dmt_Pcb.getPcbInfo(clone));
  await safe('cleanup_clone', async () => eda.dmt_Pcb.deletePcb(clone));
}
if (boardName) await safe('deleteBoard', async () => eda.dmt_Board.deleteBoard(boardName));
if (sch) await safe('deleteSchematic', async () => eda.dmt_Schematic.deleteSchematic(sch));

await safe('src_after', async () => { const i = await eda.dmt_Pcb.getPcbInfo(srcUuid); return i ? { name: i.name, parentBoardName: i.parentBoardName } : 'GONE'; });
return out;
