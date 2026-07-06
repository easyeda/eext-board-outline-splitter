const out = {};
const safe = async (label, fn) => {
  try { out[label] = await fn(); }
  catch (e) { out[label] = 'THREW: ' + (e && e.message ? e.message : String(e)); }
};

let fresh, sch, boardName;
await safe('createPcb', async () => { fresh = await eda.dmt_Pcb.createPcb(); return fresh; });
if (typeof fresh !== 'string' || !fresh) { out.abort = 'createPcb failed'; return out; }

await safe('createSchematic', async () => { sch = await eda.dmt_Schematic.createSchematic(); return sch; });
out.sch_type = typeof sch;

if (typeof sch === 'string' && sch) {
  await safe('createBoard_sch_pcb', async () => { boardName = await eda.dmt_Board.createBoard(sch, fresh); return boardName; });
  out.boardName = boardName;
  await safe('boardsAfter', async () => eda.dmt_Board.getAllBoardsInfo());

  if (boardName) {
    await safe('copyPcb_afterFullBoard', async () => eda.dmt_Pcb.copyPcb(fresh));
    const clone = out.copyPcb_afterFullBoard;
    out.clone_type = typeof clone;
    if (typeof clone === 'string' && clone) {
      await safe('clone_info', async () => eda.dmt_Pcb.getPcbInfo(clone));
      await safe('cleanup_clone', async () => eda.dmt_Pcb.deletePcb(clone));
    }
    await safe('deleteBoard', async () => eda.dmt_Board.deleteBoard(boardName));
  }
  if (typeof eda.dmt_Schematic.deleteSchematic === 'function') {
    await safe('deleteSchematic', async () => eda.dmt_Schematic.deleteSchematic(sch));
  }
}
await safe('cleanup_fresh', async () => eda.dmt_Pcb.deletePcb(fresh));

return out;
