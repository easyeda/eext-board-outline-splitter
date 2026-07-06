/**
 * EDA 低层封装：选中操作与包围盒查询。
 * 对 eda.pcb_SelectControl / eda.pcb_Primitive 的薄封装，统一错误处理（仅 console.warn）。
 */

import type { BBox } from '../types.js';

/** 清空选中 */
export async function clearSelected(): Promise<void> {
  try { await eda.pcb_SelectControl.clearSelected(); } catch (e) { console.warn('clearSelected failed:', e); }
}
export async function doSelectPrimitives(ids: string[]): Promise<boolean> {
  try { return await eda.pcb_SelectControl.doSelectPrimitives(ids); } catch (e) { console.warn('doSelectPrimitives failed:', e); return false; }
}
export async function getAllSelectedPrimitives(): Promise<any[]> {
  try {
    const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
    return Array.isArray(sel) ? sel : sel ? [sel] : [];
  } catch (e) { console.warn('getAllSelectedPrimitives failed:', e); return []; }
}

/** 图元 id 列表的包围盒（pcb_Primitive.getPrimitivesBBox）。
 *  画布未就绪（如 copyPcb 刚激活）时可能返回空对象，此时视为无效 →
 *  代表点缺失 → decideKeep 保守保留，避免误删。 */
export async function getBBox(ids: Array<string>): Promise<BBox | undefined> {
  try {
    const bb = await eda.pcb_Primitive.getPrimitivesBBox(ids);
    if (bb && typeof bb.minX === 'number' && typeof bb.maxX === 'number') return bb;
    return undefined;
  }
  catch (e) {
    console.warn('getPrimitivesBBox failed:', e);
    return undefined;
  }
}
