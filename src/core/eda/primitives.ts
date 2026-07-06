/**
 * 克隆 PCB 全量图元采集与归属删除：
 *  按类型枚举（collectAllByType）、计算代表点（buildRepPoints）、按 keep 集合删除/统计。
 * 运行于克隆 PCB（拆分阶段）。
 */

import type { Point } from '../types.js';
import { bboxCenter } from '../geometry.js';
import { getBBox } from './selection.js';

/** 按 EDA 图元类型分组的图元对象集合（克隆 PCB 上采集） */
export interface PrimitivesByType {
  lines: any[];
  arcs: any[];
  components: any[];
  pads: any[];
  vias: any[];
  regions: any[];
  fills: any[];
  pours: any[];
  dimensions: any[];
  images: any[];
}

const EMPTY_BY_TYPE = (): PrimitivesByType => ({
  lines: [],
  arcs: [],
  components: [],
  pads: [],
  vias: [],
  regions: [],
  fills: [],
  pours: [],
  dimensions: [],
  images: [],
});

/** 每种图元类型对应的 getAll / delete 入口 */
const PRIM_ACCESS = {
  lines: { getAll: () => eda.pcb_PrimitiveLine.getAll(), del: (ids: string[]) => eda.pcb_PrimitiveLine.delete(ids) },
  arcs: { getAll: () => eda.pcb_PrimitiveArc.getAll(), del: (ids: string[]) => eda.pcb_PrimitiveArc.delete(ids) },
  components: { getAll: () => eda.pcb_PrimitiveComponent.getAll(), del: (ids: string[]) => eda.pcb_PrimitiveComponent.delete(ids) },
  pads: { getAll: () => eda.pcb_PrimitivePad.getAll(), del: (ids: string[]) => eda.pcb_PrimitivePad.delete(ids) },
  vias: { getAll: () => eda.pcb_PrimitiveVia.getAll(), del: (ids: string[]) => eda.pcb_PrimitiveVia.delete(ids) },
  regions: { getAll: () => eda.pcb_PrimitiveRegion.getAll(), del: (ids: string[]) => eda.pcb_PrimitiveRegion.delete(ids) },
  fills: { getAll: () => eda.pcb_PrimitiveFill.getAll(), del: (ids: string[]) => eda.pcb_PrimitiveFill.delete(ids) },
  pours: { getAll: () => eda.pcb_PrimitivePour.getAll(), del: (ids: string[]) => eda.pcb_PrimitivePour.delete(ids) },
  dimensions: { getAll: () => eda.pcb_PrimitiveDimension.getAll(), del: (ids: string[]) => eda.pcb_PrimitiveDimension.delete(ids) },
  images: { getAll: () => eda.pcb_PrimitiveImage.getAll(), del: (ids: string[]) => eda.pcb_PrimitiveImage.delete(ids) },
} as const;

export type PrimKey = keyof PrimitivesByType;

/** 采集当前聚焦 PCB（应为克隆）的全部图元，按类型分组 */
export async function collectAllByType(): Promise<PrimitivesByType> {
  const out = EMPTY_BY_TYPE();
  await Promise.all(
    (Object.keys(PRIM_ACCESS) as PrimKey[]).map(async (k) => {
      try {
        out[k] = (await PRIM_ACCESS[k].getAll()) ?? [];
      }
      catch (e) {
        console.warn(`getAll ${k} failed:`, e);
        out[k] = [];
      }
    }),
  );
  return out;
}

/** 计算每个图元的代表点（用于归属判定） */
export async function buildRepPoints(byType: PrimitivesByType): Promise<Map<string, Point>> {
  const m = new Map<string, Point>();

  const mid2 = (a: number, b: number) => (a + b) / 2;
  const put = (id: string, p: Point) => m.set(id, p);

  // 用坐标做代表点的类型
  for (const c of byType.components) {
    try { put(c.getState_PrimitiveId(), { x: c.getState_X(), y: c.getState_Y() }); } catch { /* ignore */ }
  }
  for (const p of byType.pads) {
    try { put(p.getState_PrimitiveId(), { x: p.getState_X(), y: p.getState_Y() }); } catch { /* ignore */ }
  }
  for (const v of byType.vias) {
    try { put(v.getState_PrimitiveId(), { x: v.getState_X(), y: v.getState_Y() }); } catch { /* ignore */ }
  }
  // 用起止中点做代表点的类型
  for (const ln of byType.lines) {
    try {
      put(ln.getState_PrimitiveId(), {
        x: mid2(ln.getState_StartX(), ln.getState_EndX()),
        y: mid2(ln.getState_StartY(), ln.getState_EndY()),
      });
    }
    catch { /* ignore */ }
  }
  for (const ar of byType.arcs) {
    try {
      put(ar.getState_PrimitiveId(), {
        x: mid2(ar.getState_StartX(), ar.getState_EndX()),
        y: mid2(ar.getState_StartY(), ar.getState_EndY()),
      });
    }
    catch { /* ignore */ }
  }
  // 用包围盒中心做代表点的类型（形状复杂，需 API 取 bbox）
  const complex: any[] = [...byType.regions, ...byType.fills, ...byType.pours, ...byType.dimensions, ...byType.images];
  await Promise.all(
    complex.map(async (prim) => {
      try {
        const id = prim.getState_PrimitiveId();
        const bbox = await getBBox([id]);
        if (bbox) put(id, bboxCenter(bbox));
      }
      catch (e) {
        console.warn('buildRepPoints complex failed:', e);
      }
    }),
  );

  return m;
}

/** 删除 keep 集合之外的图元（按类型调用各自 delete） */
export async function deleteNonKeep(byType: PrimitivesByType, keep: Set<string>): Promise<number> {
  let deleted = 0;
  for (const k of Object.keys(PRIM_ACCESS) as PrimKey[]) {
    const ids = byType[k].map((p: any) => p.getState_PrimitiveId?.()).filter((id: any): id is string => typeof id === 'string');
    const toDelete = ids.filter((id: string) => !keep.has(id));
    if (toDelete.length === 0) continue;
    try {
      await PRIM_ACCESS[k].del(toDelete);
      deleted += toDelete.length;
    }
    catch (e) {
      console.warn(`delete ${k} failed:`, e);
    }
  }
  return deleted;
}

/** 统计 keep 图元数 */
export function countKept(byType: PrimitivesByType, keep: Set<string>): number {
  let n = 0;
  for (const k of Object.keys(byType) as PrimKey[]) {
    for (const p of byType[k]) {
      const id = p.getState_PrimitiveId?.();
      if (typeof id === 'string' && keep.has(id)) n++;
    }
  }
  return n;
}
