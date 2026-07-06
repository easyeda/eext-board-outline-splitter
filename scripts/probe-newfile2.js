const out = {};
const safe = async (label, fn) => {
  try { out[label] = await fn(); }
  catch (e) { out[label] = 'THREW: ' + (e && e.message ? e.message : String(e)); }
};

out.Board_keys = Object.keys(eda.dmt_Board || {});
out.Sch_keys = Object.keys(eda.dmt_Schematic || {});
out.Proj_keys = Object.keys(eda.dmt_Project || {});

await safe('boardsInfo', async () => eda.dmt_Board.getAllBoardsInfo && eda.dmt_Board.getAllBoardsInfo());
await safe('curBoard', async () => eda.dmt_Board.getCurrentBoardInfo && eda.dmt_Board.getCurrentBoardInfo());
await safe('schsInfo', async () => eda.dmt_Schematic.getAllSchematicInfo && eda.dmt_Schematic.getAllSchematicInfo());
await safe('curSch', async () => eda.dmt_Schematic.getCurrentSchematicInfo && eda.dmt_Schematic.getCurrentSchematicInfo());
await safe('curProj', async () => eda.dmt_Project.getCurrentProjectInfo && eda.dmt_Project.getCurrentProjectInfo());

await safe('allPcb', async () => eda.dmt_Pcb.getAllPcbsInfo());
const pcbs = (Array.isArray(out.allPcb) ? out.allPcb : []).filter(p => p && p.uuid && p.name && !p.name.includes('_'));
out.testNames = pcbs.map(p => p.name);
out.copyResults = {};
for (const p of pcbs) {
  const rec = {};
  try {
    const r = await eda.dmt_Pcb.copyPcb(p.uuid);
    rec.returned = r; rec.type = typeof r;
    if (typeof r === 'string' && r) {
      try { const d = await eda.dmt_Pcb.deletePcb(r); rec.deleted = d; }
      catch (e) { rec.deleteErr = (e && e.message) ? e.message : String(e); }
    }
  } catch (e) {
    rec.threw = (e && e.message) ? e.message : String(e);
  }
  out.copyResults[p.name] = rec;
}
return out;
