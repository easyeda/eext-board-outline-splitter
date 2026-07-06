/**
 * 拆分编排器：检测板框 → 逐板克隆源 PCB → 删除非本板图元 → 同步规则 → 保存。
 *
 * 核心策略（无跨文档复制图元 API）：
 *  对每个板框 copyPcb 整克隆源 PCB → 改名 → 在克隆上只保留该板范围内的图元、删除其余。
 *  板框轮廓本身是 layer-11 Region（Board Outline/Cutout），不被 collectAllByType 采集，
 *  故天然保留；另按质心匹配克隆上的轮廓 Region id 作 forceKeep 双保险。
 *
 * Source-clone fallback (v1.3.17): copyPcb usually clones the source directly; only if copyPcb fails
 * do we attach a temp schematic+board to make it work (detached in finally, net-zero).
 */

import type { BoardOutline, NestingWarning, SplitOptions, BoardCopyResult, ProgressFn, Loop, Point } from './types.js';
import { bboxCenter } from './geometry.js';
import { parsePolygonSource } from './polygon-parse.js';
import { classifyBoards } from './nesting.js';
import { decideKeep } from './region-collect.js';
import {
  collectBoardOutlineRegions,
  collectAllByType,
  buildRepPoints,
  deleteNonKeep,
  countKept,
  copyPcbFree,
  modifyPcbName,
  deletePcb,
  findFreePcbByName,
  waitForFreePcbGone,
  getCurrentPcbInfo,
  getAllPcbsInfo,
  openAndActivate,
  activateAndConfirm,
  deleteOtherBoardOutlines,
  deleteOtherLineOutlines,
  collectLineBoards,
  savePcb,
  getCurrentRules,
  overwriteRules,
  attachTempBoard,
  detachTempBoard,
  type PrimitivesByType,
  type PrimKey,
  type RawBoardRegion,
} from './eda-helpers.js';

/** Parse a raw board-outline Region into a loop (points + authoritative bbox + sourceIds). */
function toLoop(r: RawBoardRegion): Loop {
  return { points: parsePolygonSource(r.source), bbox: r.bbox, sourceIds: [r.id] };
}

/** Detect board outlines and nesting of the currently-focused PCB (detection phase; runs on source PCB). */
export async function detectBoards(): Promise<{ boards: BoardOutline[]; warning: NestingWarning; warnings: string[] }> {
  const { regions, lineSegs, warnings } = await collectBoardOutlineRegions();
  const outlines: Loop[] = [];
  const cutouts: Loop[] = [];
  for (const r of regions) {
    const loop = toLoop(r);
    if (loop.points.length < 3) {
      warnings.push(`板框/挖孔 ${r.id} 解析后顶点不足（${loop.points.length}），已跳过`);
      continue;
    }
    (r.kind === 'outline' ? outlines : cutouts).push(loop);
  }
  // 顶层线条拟合板框（与 Region 板框合并）
  const { loops: lineLoops, warnings: lineWarns } = await collectLineBoards(lineSegs);
  warnings.push(...lineWarns);
  outlines.push(...lineLoops);
  const { boards, warning } = classifyBoards(outlines, cutouts);
  return { boards, warning, warnings };
}

/** 执行全部板框的拆分 */
export async function splitAll(
  boards: BoardOutline[],
  srcInfo: { uuid: string; name: string },
  options: SplitOptions,
  progress: ProgressFn,
): Promise<BoardCopyResult[]> {
  const results: BoardCopyResult[] = [];
  if (boards.length === 0) {
    progress({ phase: 'done', message: '未识别到任何板框', results: [] });
    return results;
  }

  // 同名冲突预检：未勾选「自动覆盖」时，任一目标名已存在即整体中止（不拆分任何板，避免半成品）
  if (!options.overwriteExisting) {
    const conflicts: string[] = [];
    for (const b of boards) {
      const name = `${srcInfo.name}_${b.index}`;
      if (await findFreePcbByName(name)) conflicts.push(name);
    }
    if (conflicts.length > 0) {
      throw new Error(`已存在同名 PCB：${conflicts.join('、')}。请勾选「自动覆盖同名 PCB」后重试，或先手动删除这些 PCB。`);
    }
  }

  // 源 PCB 聚焦时取规则，始终同步到各克隆（不再可选）
  const srcRules = await getCurrentRules();

  // copyPcb usually clones the source directly (incl. standalone PCBs). Only when it returns
  // undefined (rare bad-state source) do we attach a temp schematic+board as a fallback.
  await activateAndConfirm(srcInfo.uuid);
  const probeClone = await copyPcbFree(srcInfo.uuid);
  let tempBoard: { schematicUuid: string; boardName: string } | undefined;
  if (probeClone) {
    await deletePcb(probeClone); // direct copyPcb works; discard the probe clone
  }
  else {
    tempBoard = await attachTempBoard(srcInfo.uuid);
    if (!tempBoard) {
      throw new Error('copyPcb failed on source and temp-board fallback also failed. Try saving the source PCB, or create a board for it in EDA.');
    }
  }
  try {
    await splitEachBoard(boards, srcInfo, srcRules, progress, results);
  }
  finally {
    if (tempBoard) await detachTempBoard(tempBoard);
  }

  // 回到源 PCB
  await openAndActivate(srcInfo.uuid);
  progress({ phase: 'done', message: '拆分完成', results });
  return results;
}

/** 逐板克隆→改名→删非本板图元→同步规则→保存（运行于源 PCB 已就绪、必要时已挂临时主板的上下文） */
async function splitEachBoard(
  boards: BoardOutline[],
  srcInfo: { uuid: string; name: string },
  srcRules: { [k: string]: any } | undefined,
  progress: ProgressFn,
  results: BoardCopyResult[],
): Promise<void> {
  for (let i = 0; i < boards.length; i++) {
    const board = boards[i];
    const targetName = `${srcInfo.name}_${board.index}`;
    progress({
      phase: 'split',
      boardIndex: board.index,
      message: `正在处理 ${targetName}…`,
      pct: Math.round((i / boards.length) * 100),
    });

    try {
      // ① 同名游离 PCB 已存在 → 先删除（实现"清空画布并重新更新"）
      const existing = await findFreePcbByName(targetName);
      const status: 'created' | 'updated' = existing ? 'updated' : 'created';
      if (existing) {
        await deletePcb(existing.uuid);
        // 轮询确认删除干净，避免 copyPcb/modifyPcbName 时同名残留触发"已存在"提示
        await waitForFreePcbGone(targetName);
      }

      // ② 整克隆源 PCB：先确保源 PCB 聚焦就绪（copyPcb 在源未就绪时可能返回 undefined → "克隆失败"）
      await activateAndConfirm(srcInfo.uuid);
      let cloneUuid = await copyPcbFree(srcInfo.uuid);
      if (!cloneUuid) {
        // 重试一次：重新聚焦源 + 短延迟
        await activateAndConfirm(srcInfo.uuid);
        await new Promise<void>((r) => setTimeout(r, 300));
        cloneUuid = await copyPcbFree(srcInfo.uuid);
      }
      if (!cloneUuid) {
        results.push({ index: board.index, name: targetName, status: 'failed', error: '克隆 PCB 失败（源未就绪，已重试）' });
        continue;
      }

      // ③ 激活克隆并轮询确认焦点确已切换（必须在改名前：modifyPcbName 在克隆未聚焦时返回 true 却不改名，桥接实测确认）
      const focused = await activateAndConfirm(cloneUuid);
      if (!focused) {
        results.push({ index: board.index, name: targetName, status: 'failed', error: '克隆焦点未切换，已跳过以保护源 PCB' });
        continue;
      }

      // ④ 改名（activate 之后才生效）。copyPcb 复用刚删空的目标名时克隆已叫目标名 → 跳过，防自我重名。
      const cloneName = (await getAllPcbsInfo()).find((p) => p.uuid === cloneUuid)?.name;
      if (!cloneName || cloneName !== targetName) {
        await modifyPcbName(cloneUuid, targetName);
      }
      // 验证改名成功（modifyPcbName 遇重名会静默失败、EDA 自动去重命名，需检测并报错）
      const focusInfo = await getCurrentPcbInfo();
      if (focusInfo && focusInfo.name !== targetName) {
        results.push({ index: board.index, name: targetName, status: 'failed', error: `改名未生效（实际=${focusInfo.name}），存在同名残留` });
        continue;
      }

      // ④ 在克隆上重识别板框 Region，按质心匹配本板外环与各挖孔，拿到克隆上的轮廓 Region id（强制保留）
      const forceKeepIds = await matchCloneOutlineIds(board);

      // ⑤ 采集克隆全部图元 + 代表点，逐一判定保留/删除
      const byType = await collectAllByType();
      const repPoints = await buildRepPoints(byType);
      const allIds = allIdsOf(byType);
      const { keep } = decideKeep({
        outer: board.outer.points,
        holes: board.holes.map((h) => h.points),
        allIds,
        repPoints,
        forceKeepIds,
      });

      // ⑥ 删除非保留图元
      await deleteNonKeep(byType, keep);

      // ⑥.5 删除非本板的板框/挖孔 Region（板框不被 collectAllByType 采集，需单独删，只留本板轮廓）
      await deleteOtherBoardOutlines(forceKeepIds);

      // 6.6 Delete top-layer line board outlines NOT belonging to this board (Polyline not collected by collectAllByType; delete separately).
      await deleteOtherLineOutlines(forceKeepIds);

      // ⑦ 设计规则同步（始终；取规则失败则跳过并告警）
      if (srcRules) {
        await overwriteRules(srcRules);
      }
      else {
        console.warn('取源 PCB 设计规则失败，跳过规则同步');
      }

      // ⑧ 保存
      await savePcb(cloneUuid);

      const kept = countKept(byType, keep);
      results.push({ index: board.index, name: targetName, status, primitiveCount: kept });
      progress({
        phase: 'split',
        boardIndex: board.index,
        message: `${targetName} 完成：保留 ${kept} 个图元（${status === 'updated' ? '已更新' : '已新建'}）`,
        pct: Math.round(((i + 1) / boards.length) * 100),
      });
    }
    catch (e) {
      console.error('split board failed:', e);
      results.push({ index: board.index, name: targetName, status: 'failed', error: String(e) });
    }
  }
}

/** 克隆上重识别板框（Region + 线条），按质心匹配本板外环与各挖孔，返回其轮廓图元 id 集合 */
async function matchCloneOutlineIds(board: BoardOutline): Promise<Set<string>> {
  const { regions, lineSegs } = await collectBoardOutlineRegions();
  const { loops: lineLoops } = await collectLineBoards(lineSegs);
  const loops = [...regions.map((r) => toLoop(r)), ...lineLoops];
  const ids = new Set<string>();

  const findLoopNear = (center: Point): Loop | undefined => {
    let best: Loop | undefined;
    let bestD = Infinity;
    for (const l of loops) {
      const c = bboxCenter(l.bbox);
      const d = Math.hypot(c.x - center.x, c.y - center.y);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  };

  const outerLoop = findLoopNear(board.center);
  if (outerLoop) for (const id of outerLoop.sourceIds) ids.add(id);
  for (const h of board.holes) {
    const hl = findLoopNear(bboxCenter(h.bbox));
    if (hl) for (const id of hl.sourceIds) ids.add(id);
  }
  return ids;
}

/** 汇总克隆上全部图元 id */
function allIdsOf(byType: PrimitivesByType): string[] {
  const ids: string[] = [];
  for (const k of Object.keys(byType) as PrimKey[]) {
    for (const p of byType[k]) {
      const id = p.getState_PrimitiveId?.();
      if (typeof id === 'string') ids.push(id);
    }
  }
  return ids;
}
