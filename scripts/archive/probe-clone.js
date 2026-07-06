const out = {};
const src = await eda.dmt_Pcb.getCurrentPcbInfo();
out.src = { uuid: src.uuid, name: src.name };

let cloneUuid;
try { cloneUuid = await eda.dmt_Pcb.copyPcb(src.uuid); out.cloneUuid = cloneUuid; }
catch (e) { out.cloneErr = String(e); return out; }

try { await eda.dmt_Pcb.modifyPcbName(cloneUuid, '__splitter_probe__'); out.renamed = true; }
catch (e) { out.renameErr = String(e); }

try {
  const tabId = await eda.dmt_EditorControl.openDocument(cloneUuid);
  await eda.dmt_EditorControl.activateDocument(tabId);
  out.activated = true;
}
catch (e) { out.activateErr = String(e); }

const types = { Line:'pcb_PrimitiveLine', Arc:'pcb_PrimitiveArc', Component:'pcb_PrimitiveComponent', Pad:'pcb_PrimitivePad', Via:'pcb_PrimitiveVia', Region:'pcb_PrimitiveRegion', Fill:'pcb_PrimitiveFill', Pour:'pcb_PrimitivePour', Dimension:'pcb_PrimitiveDimension', String:'pcb_PrimitiveString', Image:'pcb_PrimitiveImage' };
out.cloneCounts = {};
for (const [t, m] of Object.entries(types)) {
  try { out.cloneCounts[t] = ((await eda[m].getAll()) || []).length; }
  catch (e) { out.cloneCounts[t] = 'err:' + String(e).slice(0, 40); }
}

// 回退：删除探测克隆
try { await eda.dmt_Pcb.deletePcb(cloneUuid); out.deleted = true; }
catch (e) { out.deleteErr = String(e); }

// 恢复源 PCB 焦点
try { const tabId = await eda.dmt_EditorControl.openDocument(src.uuid); await eda.dmt_EditorControl.activateDocument(tabId); } catch {}

return out;
