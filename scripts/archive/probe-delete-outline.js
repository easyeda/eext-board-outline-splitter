const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enumOutlines = async () => {
  const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
  await eda.pcb_SelectControl.clearSelected();
  await eda.pcb_SelectControl.doSelectPrimitives(list.map((p) => p.getState_PrimitiveId()));
  const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
  const ids = [];
  for (const p of sel) { try { if (p.getState_RegionName() === 'Board Outline') ids.push(p.getState_PrimitiveId()); } catch {} }
  await eda.pcb_SelectControl.clearSelected();
  return ids;
};

const src = await eda.dmt_Pcb.getCurrentPcbInfo();
const clone = await eda.dmt_Pcb.copyPcb(src.uuid);
await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(clone));
await sleep(700);

const beforeIds = await enumOutlines();
const before = beforeIds.length;

let delResult;
try { delResult = await eda.pcb_PrimitiveRegion.delete([beforeIds[0]]); }
catch (e) { delResult = 'err:' + String(e).slice(0, 60); }
await sleep(300);

const afterIds = await enumOutlines();
const after = afterIds.length;

await eda.dmt_Pcb.deletePcb(clone);
await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(src.uuid));
return { before, deleteReturn: delResult, after, deletedOne: after < before };
