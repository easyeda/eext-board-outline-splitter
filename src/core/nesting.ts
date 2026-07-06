/**
 * 嵌套检测与板框分类（纯函数，不依赖 EDA API）
 *
 * 输入：所有 Board Outline Region（候选板框外环）+ Board Cutout Region（挖孔候选），
 * 均已由 polygon-parse 离散为顶点环。
 *
 * 保守策略（与需求 #4 一致）：板框嵌套即告警中止；单板带挖孔正常放行。
 *  中止条件（任一命中）：
 *    1) 一个板框外环完全包含另一个板框外环 → 嵌套子板；
 *    2) 两个板框外环轮廓相交 → 板框边界相互穿插。
 *  挖孔（Board Cutout）归属"最小包含它的板框"，作为该板挖孔；
 *  不被任何板框包含的挖孔予以忽略并告警（不中止）。
 */

import type { Loop, BoardOutline, NestingWarning } from './types.js';
import { bboxCenter, bboxContainsBox, polygonContainsPolygon, ringsIntersect } from './geometry.js';

export function classifyBoards(outlines: Loop[], cutouts: Loop[]): { boards: BoardOutline[]; warning: NestingWarning } {
  if (outlines.length === 0) {
    return { boards: [], warning: { abort: false } };
  }

  const n = outlines.length;

  // 1. 板框外环两两：互含 / 相交 → 中止
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const A = outlines[a], B = outlines[b];
      const aInB = bboxContainsBox(B.bbox, A.bbox) && polygonContainsPolygon(B.points, A.points);
      const bInA = bboxContainsBox(A.bbox, B.bbox) && polygonContainsPolygon(A.points, B.points);
      if (aInB || bInA) {
        return { boards: [], warning: { abort: true, reason: '检测到一个板框完全位于另一个板框内部，疑似多板框嵌套，已中止。请改为并排排列多个板框。' } };
      }
      if (ringsIntersect(A.points, B.points)) {
        return { boards: [], warning: { abort: true, reason: '检测到两个板框轮廓相交，无法确定归属，已中止。' } };
      }
    }
  }

  // 2. 挖孔归属"最小包含它的板框"
  const holesOf = new Map<number, Loop[]>();
  const orphanCount = cutouts.length;
  let placed = 0;
  for (const c of cutouts) {
    let best: number | null = null;
    let bestArea = Infinity;
    for (let i = 0; i < n; i++) {
      const o = outlines[i];
      if (bboxContainsBox(o.bbox, c.bbox) && polygonContainsPolygon(o.points, c.points)) {
        const area = (o.bbox.maxX - o.bbox.minX) * (o.bbox.maxY - o.bbox.minY);
        if (area < bestArea) { bestArea = area; best = i; }
      }
    }
    if (best != null) {
      const arr = holesOf.get(best) ?? [];
      arr.push(c);
      holesOf.set(best, arr);
      placed++;
    }
  }

  // 3. 组装板框，按 左→右、上→下 排序定序号（_1/_2/...）
  const indexed = outlines.map((l, i) => ({ l, i, c: bboxCenter(l.bbox) }));
  indexed.sort((a, b) => a.c.x - b.c.x || b.c.y - a.c.y);

  const boards: BoardOutline[] = indexed.map((t, idx) => ({
    index: idx + 1,
    outer: t.l,
    holes: holesOf.get(t.i) ?? [],
    center: t.c,
  }));

  const warning: NestingWarning = { abort: false };
  if (placed < orphanCount) {
    warning.reason = `${orphanCount - placed} 个挖孔不在任何板框内，已忽略。`;
  }
  return { boards, warning };
}
