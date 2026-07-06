/**
 * 纯几何计算（不依赖 EDA API，可离线单测）
 * 复用自原型 draft 的 geometry，修正了弧离散化方向、补齐线段相交与多边形包含判定。
 */

import type { Point, BBox } from './types.js';
import { EPS } from './types.js';

/** 点集包围盒 */
export function bboxOf(points: Point[]): BBox {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** 包围盒中心 */
export function bboxCenter(b: BBox): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** 外盒是否严格包含内盒（相切不算） */
export function bboxContainsBox(outer: BBox, inner: BBox, eps: number = EPS): boolean {
  return (
    inner.minX > outer.minX + eps &&
    inner.maxX < outer.maxX - eps &&
    inner.minY > outer.minY + eps &&
    inner.maxY < outer.maxY - eps
  );
}

/** 两包围盒是否相交（用于板框相交预筛） */
export function bboxIntersects(a: BBox, b: BBox, eps: number = EPS): boolean {
  return a.minX < b.maxX + eps && a.maxX > b.minX - eps && a.minY < b.maxY + eps && a.maxY > b.minY - eps;
}

/** 点 p 是否在线段 ab 上 */
export function isPointOnSegment(p: Point, a: Point, b: Point, eps: number = EPS): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > eps * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  if (dot < -eps) return false;
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= len2 + eps;
}

/**
 * 点是否在多边形内（射线法，边界视为在内）。
 * @param ring 顶点环（首尾不重复）
 */
export function pointInPolygon(p: Point, ring: Point[]): boolean {
  const n = ring.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    if (isPointOnSegment(p, pj, pi)) return true; // 边界上
    if ((pi.y > p.y) !== (pj.y > p.y)) {
      const xCross = (pj.x - pi.x) * (p.y - pi.y) / (pj.y - pi.y) + pi.x;
      if (p.x < xCross) inside = !inside;
    }
  }
  return inside;
}

/** 点是否在"外环减挖孔"区域内（在 outer 内，且不在任一 hole 内） */
export function pointInBoard(p: Point, outer: Point[], holes: Point[][]): boolean {
  if (!pointInPolygon(p, outer)) return false;
  for (const h of holes) {
    if (pointInPolygon(p, h)) return false;
  }
  return true;
}

/** 多边形包含：inner 的所有顶点都在 outer 内（边界视为在内） */
export function polygonContainsPolygon(outer: Point[], inner: Point[]): boolean {
  for (const p of inner) {
    if (!pointInPolygon(p, outer)) return false;
  }
  return true;
}

/** 两线段是否相交（不含共线重叠的精细情形，足以做板框相交粗判） */
export function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < EPS) return false; // 平行/共线
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS; // 严格相交（排除共享端点）
}

/** 两环的边是否相交（任一边对相交即 true） */
export function ringsIntersect(a: Point[], b: Point[]): boolean {
  const edges = (r: Point[]) => {
    const es: Array<[Point, Point]> = [];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) es.push([r[j], r[i]]);
    return es;
  };
  const ea = edges(a);
  const eb = edges(b);
  for (const [p1, p2] of ea) {
    for (const [p3, p4] of eb) {
      if (segmentsIntersect(p1, p2, p3, p4)) return true;
    }
  }
  return false;
}

/**
 * 将板框圆弧离散为折线点（含起终点）。
 * @param start 起点
 * @param end 终点
 * @param angleDeg 扫角（度，带符号）
 *
 * 注意：sign 约定按"正=逆时针"处理；若实测发现圆角凸向错误，把 sign 取反即可。
 */
export function discretizeArc(start: Point, end: Point, angleDeg: number, segmentsPerCircle = 36): Point[] {
  const chordDx = end.x - start.x;
  const chordDy = end.y - start.y;
  const chord = Math.hypot(chordDx, chordDy);
  if (chord < EPS) return [start];
  const absAng = (Math.abs(angleDeg) * Math.PI) / 180;
  if (absAng < EPS) return [start, end];

  const radius = chord / (2 * Math.sin(absAng / 2));
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  // 弦的法向单位（弦向量逆时针旋转 90°）
  const perpX = -chordDy / chord;
  const perpY = chordDx / chord;
  const centerDist = radius * Math.cos(absAng / 2);
  const sign = angleDeg > 0 ? 1 : -1;
  const cx = mx + sign * perpX * centerDist;
  const cy = my + sign * perpY * centerDist;

  const sa = Math.atan2(start.y - cy, start.x - cx);
  const n = Math.max(2, Math.ceil((absAng / (2 * Math.PI)) * segmentsPerCircle));
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = sa + sign * absAng * t;
    pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }
  return pts;
}

/** 是否为轴对齐矩形（恰好 4 顶点、每条边水平或垂直）。用于尺寸标注：矩形显示真实 W×H */
export function isAxisAlignedRect(points: Point[]): boolean {
  if (points.length !== 4) return false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = points[j], b = points[i];
    // 每条边必须水平（y 相等）或垂直（x 相等）
    if (Math.abs(a.x - b.x) > EPS && Math.abs(a.y - b.y) > EPS) return false;
  }
  return true;
}

/** 是否近似圆（bbox 近正方 + 所有点到 bbox 中心距离近似恒定）。用于尺寸标注：圆显示 ⌀直径 */
export function isCircleLike(points: Point[], bbox: BBox): boolean {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  if (points.length < 8) return false; // 圆离散点较多
  if (Math.abs(w - h) > Math.max(w, h) * 0.05) return false; // bbox 近正方（5% 容差）
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const r = (w + h) / 4;
  for (const p of points) {
    if (Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) > r * 0.05) return false; // 距中心≈半径（5%）
  }
  return true;
}

/** 多边形面积（shoelace，绝对值）。用于多边形板框尺寸标注 */
export function polygonArea(points: Point[]): number {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return Math.abs(a / 2);
}
