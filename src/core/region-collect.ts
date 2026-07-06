/**
 * 图元归属判定（纯函数，不依赖 EDA API）
 *
 * 给定一个板框的几何（外环 + 挖孔）、克隆 PCB 上全部图元 id、每个图元的代表点、
 * 以及必须保留的本板轮廓 id，计算 keep / delete 两个集合。
 *
 * 代表点由 splitter 层按图元类型采集（器件/焊盘/过孔用坐标，线/弧用中点，
 * 区域/填充/覆铜/标注/图像用包围盒中心），其 eda 依赖不进入本纯函数。
 */

import type { Point } from './types.js';
import { pointInBoard } from './geometry.js';

export interface OwnershipInput {
  /** 板框外环顶点 */
  outer: Point[];
  /** 板框挖孔顶点列表 */
  holes: Point[][];
  /** 克隆 PCB 上全部图元 id */
  allIds: string[];
  /** 图元 id → 代表点 */
  repPoints: Map<string, Point>;
  /** 必须保留的图元 id（本板在克隆上的轮廓图元） */
  forceKeepIds: Set<string>;
}

export interface OwnershipResult {
  keep: Set<string>;
  deleteIds: string[];
}

/** 判定保留/删除集合 */
export function decideKeep(input: OwnershipInput): OwnershipResult {
  const { outer, holes, allIds, repPoints, forceKeepIds } = input;
  const keep = new Set<string>(forceKeepIds);

  for (const id of allIds) {
    if (keep.has(id)) continue;
    const rep = repPoints.get(id);
    // 代表点缺失（极少数图元取不到几何）时，保守保留，避免误删
    if (!rep) {
      keep.add(id);
      continue;
    }
    if (pointInBoard(rep, outer, holes)) {
      keep.add(id);
    }
  }

  const deleteIds = allIds.filter((id) => !keep.has(id));
  return { keep, deleteIds };
}
