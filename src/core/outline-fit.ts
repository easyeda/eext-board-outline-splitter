/**
 * 线条拟合：把多条线段（直线 / 弧 / 折线，已离散为有序点序列）的端点按"严格相接"
 * 建无向图，找出所有闭合环（每个顶点度数 = 2 的连通分量），输出有序顶点环。
 *
 * 用途：识别顶层无网络线条（Polyline/Arc）围成的"拟合板框"——
 *       用户没用板框工具，而是手绘线条围出的闭合轮廓。
 *
 * "严格相接"用 1e-6 mil 容差（肉眼严格，规避浮点误差）。
 */

import type { Point, Loop } from './types.js';
import { bboxOf } from './geometry.js';

/** 一条参与拟合的线段：直线=首尾 2 点；弧/折线=离散多点序列 */
export interface FitSegment {
  /** 图元 id（Polyline / Arc / ...） */
  id: string;
  /** 有序点序列：首点 = points[0]，尾点 = points[len-1]，中间为形状点（弧离散点） */
  points: Point[];
}

/** 端点相接容差(mil)：手画多段线难精确到 0，放宽到 5mil（用户拍板） */
const CLOSE_TOL = 5;
const sameSnap = (a: Point, b: Point): boolean => Math.hypot(a.x - b.x, a.y - b.y) < CLOSE_TOL;

interface Edge {
  segId: string;
  from: number;
  to: number;
  /** 中间形状点（首尾之间），遍历时按方向拼入 */
  mid: Point[];
}

/**
 * 识别所有闭合环。
 * 单条闭合 Polyline（首尾重合）请调用方直接成环，不要作为 segment 传入（避免自环退化）。
 */
export function recognizeLoops(segments: FitSegment[]): { loops: Loop[]; warnings: string[] } {
  const warnings: string[] = [];
  const loops: Loop[] = [];
  if (segments.length === 0) return { loops, warnings };

  // 顶点吸附：距离 <CLOSE_TOL 视为同一顶点（线性聚类，顶点数少可接受）
  const vPts: Point[] = [];
  const getV = (p: Point): number => {
    for (let i = 0; i < vPts.length; i++) {
      if (Math.hypot(vPts[i].x - p.x, vPts[i].y - p.y) < CLOSE_TOL) return i;
    }
    vPts.push(p);
    return vPts.length - 1;
  };

  const adj = new Map<number, Edge[]>();
  const addAdj = (v: number, e: Edge): void => {
    const a = adj.get(v);
    if (a) a.push(e);
    else adj.set(v, [e]);
  };

  for (const seg of segments) {
    if (seg.points.length < 2) {
      warnings.push(`线段 ${seg.id} 点数不足，跳过`);
      continue;
    }
    const from = getV(seg.points[0]);
    const to = getV(seg.points[seg.points.length - 1]);
    const e: Edge = { segId: seg.id, from, to, mid: seg.points.slice(1, -1) };
    addAdj(from, e);
    addAdj(to, e);
  }

  // 连通分量；分量内所有顶点度数=2 才是闭合环
  const visited = new Set<number>();
  for (const start of vPts.keys()) {
    if (visited.has(start)) continue;
    const comp: number[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const v = queue.shift()!;
      comp.push(v);
      for (const e of adj.get(v) ?? []) {
        const nb = e.from === v ? e.to : e.from;
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
    const allDeg2 = comp.every((v) => (adj.get(v)?.length ?? 0) === 2);
    if (!allDeg2) continue; // 含开放端点，非闭合
    if (comp.length < 2) continue; // 至少 2 顶点（两段围成的环合法，如两条弧围成的透镜形；1 顶点自环排除）
    const traced = traceRing(start, adj, vPts);
    if (traced.points.length >= 3) {
      loops.push({
        points: traced.points,
        bbox: bboxOf(traced.points),
        sourceIds: traced.usedEdges.map((e) => e.segId),
      });
    }
  }
  return { loops, warnings };
}

/** 从 start 沿邻接走出有序闭合环（每顶点度数 2，路径唯一） */
function traceRing(start: number, adj: Map<number, Edge[]>, vPts: Point[]): { points: Point[]; usedEdges: Edge[] } {
  const usedEdges: Edge[] = [];
  const usedSet = new Set<Edge>();
  const pts: Point[] = [vPts[start]];
  let cur = start;
  for (let guard = 0; guard < 100000; guard++) {
    const edges = adj.get(cur) ?? [];
    const e = edges.find((x) => !usedSet.has(x));
    if (!e) break;
    usedSet.add(e);
    usedEdges.push(e);
    const forward = e.from === cur;
    const next = forward ? e.to : e.from;
    const mid = forward ? e.mid : [...e.mid].reverse();
    pts.push(...mid, vPts[next]);
    cur = next;
    if (cur === start) break;
  }
  if (pts.length > 1 && sameSnap(pts[0], pts[pts.length - 1])) pts.pop();
  return { points: pts, usedEdges };
}
