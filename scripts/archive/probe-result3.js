const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const all = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];

for (const name of ['PCB10086_1', 'PCB10086_2', 'PCB10086_3']) {
  const p = all.find((x) => x.name === name && !x.parentBoardName);
  if (!p) { out[name] = 'MISSING'; continue; }
  await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(p.uuid));
  await sleep(500);
  const counts = {};
  for (const [k, m] of Object.entries({ Component: 'pcb_PrimitiveComponent', Pad: 'pcb_PrimitivePad', Line: 'pcb_PrimitiveLine', Fill: 'pcb_PrimitiveFill', Pour: 'pcb_PrimitivePour' })) {
    try { counts[k] = ((await eda[m].getAll()) || []).length; } catch (e) { counts[k] = 'err'; }
  }
  // 器件中心坐标（看归属）
  const comps = (await eda.pcb_PrimitiveComponent.getAll()) || [];
  const compCenters = comps.map((c) => { try { return { x: Math.round(c.getState_X()), y: Math.round(c.getState_Y()) }; } catch { return null; } }).filter(Boolean);
  // 板框 outline 数
  const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
  await eda.pcb_SelectControl.clearSelected();
  await eda.pcb_SelectControl.doSelectPrimitives(list.map((x) => x.getState_PrimitiveId()));
  const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
  let outlineCount = 0;
  for (const s of sel) { try { if (s.getState_RegionName() === 'Board Outline') outlineCount++; } catch {} }
  await eda.pcb_SelectControl.clearSelected();
  out[name] = { counts, compCenters, boardOutlines: outlineCount };
}
const src = all.find((x) => x.parentBoardName);
if (src) await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(src.uuid));
return out;
