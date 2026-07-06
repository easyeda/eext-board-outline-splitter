const out = {};
const all = (await eda.dmt_Pcb.getAllPcbsInfo()) || [];
out.allPcbs = all.map((p) => ({ name: p.name, parent: p.parentBoardName ?? '(free)' }));

const COUNT_TYPES = { Line: 'pcb_PrimitiveLine', Component: 'pcb_PrimitiveComponent', Pad: 'pcb_PrimitivePad', Fill: 'pcb_PrimitiveFill', Pour: 'pcb_PrimitivePour', String: 'pcb_PrimitiveString', Image: 'pcb_PrimitiveImage' };

for (const name of ['PCB_1', 'PCB_2']) {
  const p = all.find((x) => x.name === name && !x.parentBoardName);
  if (!p) { out[name] = 'MISSING'; continue; }
  await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(p.uuid));
  await new Promise((r) => setTimeout(r, 400));
  const counts = {};
  for (const [k, m] of Object.entries(COUNT_TYPES)) { try { counts[k] = ((await eda[m].getAll()) || []).length; } catch (e) { counts[k] = 'err'; } }
  // 板框轮廓是否保留
  const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
  await eda.pcb_SelectControl.clearSelected();
  await eda.pcb_SelectControl.doSelectPrimitives(list.map((x) => x.getState_PrimitiveId()));
  const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
  let outlineCount = 0;
  for (const s of sel) { try { if (s.getState_RegionName() === 'Board Outline') outlineCount++; } catch {} }
  await eda.pcb_SelectControl.clearSelected();
  out[name] = { counts, boardOutlines: outlineCount };
}
const src = all.find((x) => x.name === 'PCB' && x.parentBoardName);
if (src) await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(src.uuid));
return out;
