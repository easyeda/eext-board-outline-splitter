const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const all = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
for (const name of ['PCB10086_1', 'PCB10086_2', 'PCB10086_3', 'PCB10086_4', 'PCB10086_5']) {
  const p = all.find((x) => x.name === name && !x.parentBoardName);
  if (!p) { out[name] = 'MISSING'; continue; }
  await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(p.uuid));
  await sleep(400);
  const comp = ((await eda.pcb_PrimitiveComponent.getAll()) || []).length;
  const poly = (await eda.pcb_PrimitivePolyline.getAll(undefined, 1)) || [];
  let noNetPoly = 0;
  for (const pp of poly) { try { if (!pp.getState_Net()) noNetPoly++; } catch {} }
  const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
  await eda.pcb_SelectControl.clearSelected();
  await eda.pcb_SelectControl.doSelectPrimitives(list.map((x) => x.getState_PrimitiveId()));
  const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
  let outline = 0;
  for (const s of sel) { try { if (s.getState_RegionName() === 'Board Outline') outline++; } catch {} }
  await eda.pcb_SelectControl.clearSelected();
  out[name] = { Component: comp, topNoNetPolyline: noNetPoly, regionOutlines: outline };
}
const src = all.find((x) => x.parentBoardName);
if (src) await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(src.uuid));
return out;
