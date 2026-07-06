const out = {};
const src = await eda.dmt_Pcb.getCurrentPcbInfo();
const cloneUuid = await eda.dmt_Pcb.copyPcb(src.uuid);
await eda.dmt_Pcb.modifyPcbName(cloneUuid, '__probe2__');
const tabId = await eda.dmt_EditorControl.openDocument(cloneUuid);
await eda.dmt_EditorControl.activateDocument(tabId);

const lines = (await eda.pcb_PrimitiveLine.getAll()) || [];
const comps = (await eda.pcb_PrimitiveComponent.getAll()) || [];

out.repProbe = {
  compX: comps[0] ? (() => { try { return comps[0].getState_X(); } catch (e) { return 'err:' + String(e); } })() : null,
  compY: comps[0] ? (() => { try { return comps[0].getState_Y(); } catch (e) { return 'err:' + String(e); } })() : null,
  lineStart: lines[0] ? (() => { try { return { sx: lines[0].getState_StartX(), sy: lines[0].getState_StartY(), ex: lines[0].getState_EndX(), ey: lines[0].getState_EndY() }; } catch (e) { return 'err:' + String(e); } })() : null,
  lineBBox: lines[0] ? (() => { try { return eda.pcb_Primitive.getPrimitivesBBox([lines[0].getState_PrimitiveId()]); } catch (e) { return 'err:' + String(e); } })() : null,
};

try {
  const toDel = lines.slice(0, 2).map((l) => l.getState_PrimitiveId());
  out.delLineResult = await eda.pcb_PrimitiveLine.delete(toDel);
  out.linesAfter = ((await eda.pcb_PrimitiveLine.getAll()) || []).length;
}
catch (e) { out.delErr = String(e); }

try { out.saveResult = await eda.pcb_Document.save(); }
catch (e) { out.saveErr = String(e); }

await eda.dmt_Pcb.deletePcb(cloneUuid);
try { const t = await eda.dmt_EditorControl.openDocument(src.uuid); await eda.dmt_EditorControl.activateDocument(t); } catch { /* ignore */ }
return out;
