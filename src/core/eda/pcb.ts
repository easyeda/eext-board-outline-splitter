/**
 * PCB / 文档生命周期管理：信息查询、游离克隆、改名、删除、激活焦点、保存。
 * 对 eda.dmt_Pcb / eda.dmt_EditorControl / eda.pcb_Document 的薄封装，统一错误处理（仅 console.warn）。
 */

export async function getCurrentPcbInfo(): Promise<{ uuid: string; name: string } | undefined> {
  try {
    const info = await eda.dmt_Pcb.getCurrentPcbInfo();
    if (!info) return undefined;
    return { uuid: info.uuid, name: info.name };
  }
  catch (e) {
    console.warn('getCurrentPcbInfo failed:', e);
    return undefined;
  }
}

/** 全部 PCB 信息（含 name/uuid/parentBoardName） */
export async function getAllPcbsInfo(): Promise<Array<{ uuid: string; name: string; parentBoardName?: string }>> {
  try {
    const all = (await eda.dmt_Pcb.getAllPcbsInfo()) ?? [];
    return all.map((p: any) => ({ uuid: p.uuid, name: p.name, parentBoardName: p.parentBoardName }));
  }
  catch (e) {
    console.warn('getAllPcbsInfo failed:', e);
    return [];
  }
}

/** 游离克隆 PCB（parentBoardName 为空）并按名查找 */
export async function findFreePcbByName(name: string): Promise<{ uuid: string; name: string } | undefined> {
  const all = await getAllPcbsInfo();
  return all.find((p) => p.name === name && !p.parentBoardName);
}

/** 等待某游离 PCB 被删除干净（deletePcb 后轮询确认，避免后续 copyPcb/modifyPcbName 同名残留触发"已存在"） */
export async function waitForFreePcbGone(name: string, maxTries = 20): Promise<boolean> {
  for (let i = 0; i < maxTries; i++) {
    const existing = await findFreePcbByName(name);
    if (!existing) return true;
    await new Promise<void>((r) => setTimeout(r, 200));
  }
  return false;
}

export async function copyPcbFree(srcUuid: string): Promise<string | undefined> {
  try {
    // 省略 boardName → 游离 PCB。0.2.53 实测正常返回 uuid 字符串；
    // 但源 PCB 异常/未就绪时可能返回 undefined——必须视为失败（splitter 会跳过该板，
    // 绝不在源上继续操作），否则 openDocument(undefined) 会落回源 PCB 造成误删。
    const r = await eda.dmt_Pcb.copyPcb(srcUuid);
    return typeof r === 'string' ? r : undefined;
  }
  catch (e) {
    console.warn('copyPcb failed:', e);
    return undefined;
  }
}

export async function modifyPcbName(uuid: string, name: string): Promise<boolean> {
  try {
    return await eda.dmt_Pcb.modifyPcbName(uuid, name);
  }
  catch (e) {
    console.warn('modifyPcbName failed:', e);
    return false;
  }
}

export async function deletePcb(uuid: string): Promise<boolean> {
  try {
    return await eda.dmt_Pcb.deletePcb(uuid);
  }
  catch (e) {
    console.warn('deletePcb failed:', e);
    return false;
  }
}

/** 打开文档并激活焦点，返回是否成功 */
export async function openAndActivate(uuid: string): Promise<boolean> {
  try {
    const tabId = await eda.dmt_EditorControl.openDocument(uuid);
    if (!tabId) return false;
    await eda.dmt_EditorControl.activateDocument(tabId);
    return true;
  }
  catch (e) {
    console.warn('openAndActivate failed:', e);
    return false;
  }
}

/**
 * 激活目标 PCB 并轮询确认焦点确已切换（解决 activate 的时序竞态）。
 * copyPcb→activate 后焦点偶发未切换，若此时采集会读到旧 PCB 图元导致归属错位。
 * 必须确认 getCurrentPcbInfo().uuid === 目标 才返回 true。
 */
export async function activateAndConfirm(uuid: string, maxTries = 20): Promise<boolean> {
  try {
    const tabId = await eda.dmt_EditorControl.openDocument(uuid);
    if (!tabId) return false;
    for (let i = 0; i < maxTries; i++) {
      await eda.dmt_EditorControl.activateDocument(tabId);
      const info = await eda.dmt_Pcb.getCurrentPcbInfo();
      if (info && info.uuid === uuid) return true;
      await new Promise<void>((r) => setTimeout(r, 200));
    }
    return false;
  }
  catch (e) {
    console.warn('activateAndConfirm failed:', e);
    return false;
  }
}

export async function savePcb(_uuid: string): Promise<boolean> {
  try {
    // pcb_Document.save() 无参，保存当前聚焦 PCB（调用前已 openAndActivate 目标克隆）。
    // _uuid 仅作文档说明，标明意图保存哪个 PCB。
    return await eda.pcb_Document.save();
  }
  catch (e) {
    console.warn('save failed:', e);
    return false;
  }
}

/**
 * Temporarily attach a schematic+board to the source PCB so copyPcb works (createSchematic /
 * createBoard are @beta; verified on 0.2.53). Used only as a fallback when a direct copyPcb probe
 * fails. The returned handle MUST be passed to detachTempBoard afterwards, or the source keeps the board link.
 * On partial failure (schematic created but board not) it cleans up the schematic and returns undefined.
 */
export async function attachTempBoard(srcUuid: string): Promise<{ schematicUuid: string; boardName: string } | undefined> {
  try {
    const schematicUuid = await eda.dmt_Schematic.createSchematic();
    if (typeof schematicUuid !== 'string' || !schematicUuid) return undefined;
    const boardName = await eda.dmt_Board.createBoard(schematicUuid, srcUuid);
    if (typeof boardName !== 'string' || !boardName) {
      try { await eda.dmt_Schematic.deleteSchematic(schematicUuid); } catch { /* partial cleanup */ }
      return undefined;
    }
    return { schematicUuid, boardName };
  }
  catch (e) {
    console.warn('attachTempBoard failed:', e);
    return undefined;
  }
}

/**
 * Remove the temp board+schematic attached by attachTempBoard, restoring the source to standalone.
 * deleteBoard only detaches the container and does NOT delete the contained PCB; the two are tried separately.
 */
export async function detachTempBoard(temp: { schematicUuid: string; boardName: string }): Promise<void> {
  try { await eda.dmt_Board.deleteBoard(temp.boardName); }
  catch (e) { console.warn('deleteBoard(temp) failed:', e); }
  try { await eda.dmt_Schematic.deleteSchematic(temp.schematicUuid); }
  catch (e) { console.warn('deleteSchematic(temp) failed:', e); }
}
