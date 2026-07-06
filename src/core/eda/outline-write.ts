/**
 * 克隆 PCB 上非本板轮廓的删除（拆分阶段）：
 *  - deleteOtherBoardOutlines：板框层(layer 11)的 Board Outline/Cutout Region，
 *    以及用户用 Polyline/Arc 在板框层画的线条轮廓。
 *  - deleteOtherLineOutlines：顶层(layer 1)无网络的线条板框 Polyline。
 * 这些都不被 collectAllByType 采集，deleteNonKeep 删不到，需单独枚举删除。保留 keepIds 内的（本板轮廓）。
 */

import { BOARD_OUTLINE_LAYER } from '../types.js';
import { clearSelected, doSelectPrimitives, getAllSelectedPrimitives } from './selection.js';

/**
 * 删除非保留的板框层(layer 11)轮廓图元（运行于克隆 PCB）：Board Outline/Cutout Region，
 * 以及用户用 Polyline/Arc 在板框层画的线条轮廓。保留 keepIds 内的（本板轮廓）。
 */
export async function deleteOtherBoardOutlines(keepIds: Set<string>): Promise<number> {
  let deleted = 0;
  try {
    const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, BOARD_OUTLINE_LAYER)) ?? [];
    const ids = list.map((p: any) => { try { return p.getState_PrimitiveId(); } catch { return null; } }).filter((x: any): x is string => typeof x === 'string');
    if (ids.length === 0) return 0;
    await clearSelected();
    await doSelectPrimitives(ids);
    const arr = await getAllSelectedPrimitives();
    const regionDel: string[] = [];
    const polyDel: string[] = [];
    const arcDel: string[] = [];
    for (const p of arr) {
      try {
        const id = p.getState_PrimitiveId();
        if (keepIds.has(id)) continue;
        const ptype = p.getState_PrimitiveType();
        if (ptype === 'Region') {
          // 非保留的板框/挖孔 Region
          const name = typeof p.getState_RegionName === 'function' ? p.getState_RegionName() : undefined;
          if (name === 'Board Outline' || name === 'Board Cutout') regionDel.push(id);
        }
        else if (ptype === 'Polyline' || ptype === 'Arc') {
          // 非保留的板框层线条轮廓（用户用 Polyline/Arc 在板框层画的板框）
          (ptype === 'Arc' ? arcDel : polyDel).push(id);
        }
      }
      catch { /* ignore */ }
    }
    await clearSelected();
    if (regionDel.length > 0) {
      try { await eda.pcb_PrimitiveRegion.delete(regionDel); deleted += regionDel.length; }
      catch (e) { console.warn('deleteOtherBoardOutlines: region.delete failed:', e); }
    }
    if (polyDel.length > 0) {
      try { await eda.pcb_PrimitivePolyline.delete(polyDel); deleted += polyDel.length; }
      catch (e) { console.warn('deleteOtherBoardOutlines: polyline.delete failed:', e); }
    }
    if (arcDel.length > 0) {
      try { await eda.pcb_PrimitiveArc.delete(arcDel); deleted += arcDel.length; }
      catch (e) { console.warn('deleteOtherBoardOutlines: arc.delete failed:', e); }
    }
  }
  catch (e) {
    console.warn('deleteOtherBoardOutlines failed:', e);
  }
  return deleted;
}

/**
 * 删除非保留的顶层线条板框 Polyline（Polyline 不被 collectAllByType 采集，deleteNonKeep 删不到）。
 * 只删顶层(layer 1)无网络的 Polyline（有 net 的是走线/铜，不动）；保留 keepIds 内的（本板轮廓线）。
 */
export async function deleteOtherLineOutlines(keepIds: Set<string>): Promise<number> {
  let deleted = 0;
  try {
    const polys = (await eda.pcb_PrimitivePolyline.getAll(undefined, 1)) ?? [];
    const toDelete: string[] = [];
    for (const p of polys) {
      try {
        const net = typeof p.getState_Net === 'function' ? p.getState_Net() : undefined;
        if (net) continue;
        const id = p.getState_PrimitiveId();
        if (!keepIds.has(id)) toDelete.push(id);
      }
      catch { /* ignore */ }
    }
    if (toDelete.length > 0) {
      try { await eda.pcb_PrimitivePolyline.delete(toDelete); deleted = toDelete.length; }
      catch (e) { console.warn('deleteOtherLineOutlines: polyline.delete failed:', e); }
    }
  }
  catch (e) {
    console.warn('deleteOtherLineOutlines failed:', e);
  }
  return deleted;
}
