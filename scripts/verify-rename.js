/* 决定性验证：copyPcb 后、activate 前，直接 modifyPcbName(cloneUuid, target) 能否改名？
   复刻 splitter 当前的调用顺序（copyPcb → 读名 → modifyPcbName → 之后才 activate）。
   建克隆→改名→读名→删除，净零副作用。 */
const out = {};
const info = await eda.dmt_Pcb.getCurrentPcbInfo();
out.focused = info ? { uuid: info.uuid, name: info.name } : null;
if (!info) return out;

// copyPcb
let r;
try { r = await eda.dmt_Pcb.copyPcb(info.uuid); } catch (e) { out.copyPcbErr = String(e); return out; }
if (typeof r !== 'string') { out.copyPcb = 'undefined（克隆失败/源未就绪）'; return out; }
const cloneUuid = r;
let all = (await eda.dmt_Pcb.getAllPcbsInfo()) ?? [];
let clone = all.find(p => p.uuid === cloneUuid);
out.cloneAutoName = clone?.name ?? '?';

// modifyPcbName(cloneUuid, target) —— activate 之前调用（与 splitter 当前顺序一致）
const target = 'ZZ_RENAME_TEST_42';
let ret;
try { ret = await eda.dmt_Pcb.modifyPcbName(cloneUuid, target); } catch (e) { out.modifyPcbErr = String(e); }
out.modifyPcbReturned = ret;
all = (await eda.dmt_Pcb.getAllPcbsInfo()) ?? [];
clone = all.find(p => p.uuid === cloneUuid);
out.cloneNameAfterRename = clone?.name ?? '(clone not found)';
out.renameWorked_beforeActivate = clone?.name === target;

// 再试 activate 之后改名（对照）
try {
  const tabId = await eda.dmt_EditorControl.openDocument(cloneUuid);
  if (tabId) {
    await eda.dmt_EditorControl.activateDocument(tabId);
    for (let i = 0; i < 10; i++) {
      const ci = await eda.dmt_Pcb.getCurrentPcbInfo();
      if (ci && ci.uuid === cloneUuid) break;
      await new Promise(res => setTimeout(res, 200));
    }
  }
  const target2 = 'ZZ_RENAME_TEST_43';
  let ret2;
  try { ret2 = await eda.dmt_Pcb.modifyPcbName(cloneUuid, target2); } catch (e) { out.modifyPcbErr2 = String(e); }
  out.modifyPcbReturned_afterActivate = ret2;
  all = (await eda.dmt_Pcb.getAllPcbsInfo()) ?? [];
  clone = all.find(p => p.uuid === cloneUuid);
  out.cloneNameAfterRename2 = clone?.name ?? '(clone not found)';
  out.renameWorked_afterActivate = clone?.name === target2;
} catch (e) { out.activateErr = String(e); }

// 清理：回到源 + 删测试克隆
try { await eda.dmt_EditorControl.openDocument(info.uuid); } catch { /* ignore */ }
try {
  await eda.dmt_Pcb.deletePcb(cloneUuid);
  let gone = false;
  for (let i = 0; i < 20; i++) {
    const a = (await eda.dmt_Pcb.getAllPcbsInfo()) ?? [];
    if (!a.find(p => p.uuid === cloneUuid)) { gone = true; break; }
    await new Promise(res => setTimeout(res, 200));
  }
  out.cleanedUp = gone;
} catch (e) { out.cleanupErr = String(e); }

return out;
