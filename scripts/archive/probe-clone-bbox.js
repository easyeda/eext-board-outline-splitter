const src = await eda.dmt_Pcb.getCurrentPcbInfo();
const cloneUuid = await eda.dmt_Pcb.copyPcb(src.uuid);
await eda.dmt_Pcb.modifyPcbName(cloneUuid, '__probe3__');
await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(cloneUuid));

const out = { immediate: {}, afterSleep: {} };
const testFill = async () => {
  const f = (await eda.pcb_PrimitiveFill.getAll()) || [];
  if (!f.length) return 'none';
  try { return await eda.pcb_Primitive.getPrimitivesBBox([f[0].getState_PrimitiveId()]); }
  catch (e) { return 'err:' + String(e).slice(0, 50); }
};
out.immediate.fill = await testFill();
await new Promise((r) => setTimeout(r, 1200));
out.afterSleep.fill = await testFill();

await eda.dmt_Pcb.deletePcb(cloneUuid);
try { await eda.dmt_EditorControl.activateDocument(await eda.dmt_EditorControl.openDocument(src.uuid)); } catch { /* ignore */ }
return out;
