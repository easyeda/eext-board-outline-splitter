const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const countOutline = async () => {
  const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
  await eda.pcb_SelectControl.clearSelected();
  await eda.pcb_SelectControl.doSelectPrimitives(list.map((p) => p.getState_PrimitiveId()));
  const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
  let n = 0;
  for (const s of sel) { try { if (s.getState_RegionName() === 'Board Outline') n++; } catch {} }
  await eda.pcb_SelectControl.clearSelected();
  return n;
};

const src = await eda.dmt_Pcb.getCurrentPcbInfo();
const srcComp = ((await eda.pcb_PrimitiveComponent.getAll()) || []).length;
const srcOutline = await countOutline();

const clone = await eda.dmt_Pcb.copyPcb(src.uuid);
await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(clone));
await sleep(600);
const cloneComp = ((await eda.pcb_PrimitiveComponent.getAll()) || []).length;
const cloneOutline = await countOutline();
const cloneCenters = ((await eda.pcb_PrimitiveComponent.getAll()) || []).map((c) => { try { return { x: Math.round(c.getState_X()), y: Math.round(c.getState_Y()) }; } catch { return null; } }).filter(Boolean);

await eda.dmt_Pcb.deletePcb(clone);
await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(src.uuid));
return { srcComp, srcOutline, cloneComp, cloneOutline, cloneCenters };
