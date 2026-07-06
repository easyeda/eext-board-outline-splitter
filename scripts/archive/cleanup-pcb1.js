const all = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
const cleaned = [];
for (const p of all) {
  if (!p.parentBoardName && p.name !== 'PCB') {
    try { await eda.dmt_Pcb.deletePcb(p.uuid); cleaned.push(p.name); }
    catch (e) { /* ignore */ }
  }
}
return {
  cleaned,
  remainingFree: all.filter((p) => !p.parentBoardName && p.name !== 'PCB').map((p) => p.name),
  allPcbs: ((await eda.dmt_Pcb.getAllPcbsInfo()) || []).map((p) => ({ name: p.name, parent: p.parentBoardName ?? '(free)' })),
};
