const out = {};
const safe = async (label, fn) => {
  try { out[label] = await fn(); }
  catch (e) { out[label] = 'THREW: ' + (e && e.message ? e.message : String(e)); }
};

let fresh;
await safe('createPcb', async () => { fresh = await eda.dmt_Pcb.createPcb(); return fresh; });
out.fresh_type = typeof fresh;
if (typeof fresh !== 'string' || !fresh) { out.abort = 'createPcb failed'; return out; }

await safe('fresh_info', async () => eda.dmt_Pcb.getPcbInfo(fresh));

await safe('copyPcb_fresh_standalone', async () => eda.dmt_Pcb.copyPcb(fresh));
if (typeof out.copyPcb_fresh_standalone === 'string') {
  await safe('cleanup_clone1', async () => eda.dmt_Pcb.deletePcb(out.copyPcb_fresh_standalone));
}

await safe('createBoard', async () => eda.dmt_Board.createBoard(undefined, fresh));
const boardName = typeof out.createBoard === 'string' ? out.createBoard : null;
out.boardName = boardName;
if (boardName) {
  await safe('boardsAfter', async () => eda.dmt_Board.getAllBoardsInfo());
  await safe('copyPcb_afterBoard', async () => eda.dmt_Pcb.copyPcb(fresh));
  if (typeof out.copyPcb_afterBoard === 'string') {
    await safe('cleanup_clone2', async () => eda.dmt_Pcb.deletePcb(out.copyPcb_afterBoard));
  }
  await safe('deleteBoard', async () => eda.dmt_Board.deleteBoard(boardName));
}

await safe('cleanup_fresh_stillExists', async () => eda.dmt_Pcb.deletePcb(fresh));

return out;
