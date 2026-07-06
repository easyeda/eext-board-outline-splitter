/**
 * 板框命令流解析（纯函数）：把板框/挖孔 Region 的
 * `getState_ComplexPolygon().getSource()` 命令流（TPCB_PolygonSourceArray）
 * 离散为有序顶点环，供 pointInPolygon 归属判定与嵌套检测使用。
 *
 * 命令格式（@jlceda/pro-api-types 注释）：
 *   整体命令（数组首元素即命令标记）：
 *     ['R', x, y, w, h, rot, round]   矩形（左上角 x,y；宽 w；高 h；旋转；圆角）
 *     ['CIRCLE', cx, cy, r]           圆
 *   路径模式（首对数字为整体起点，后续以段命令衔接，每段起点 = 前段终点）：
 *     x1 y1 'L' x2 y2 x3 y3 ...                 直线点列
 *     x1 y1 'ARC' arcAngle endX endY            圆弧（arcAngle 负=顺时针，角度制）
 *     x1 y1 'CARC' arcAngle endX endY           中心圆弧
 *     x1 y1 'C' x y x y x y x y ...             三阶贝塞尔（2 控制点 + 终点 / 段）
 *
 * ⚠ 实测确定（2026-07-01，运行时 API 0.2.53）：
 *   - R 的 height 沿 -y 方向（画布 y 向下为负）：角点 (x,y)(x+w,y)(x+w,y-h)(x,y-h)。
 *   - CIRCLE 离散 72 点，与 getPrimitivesBBox 外接矩形吻合。
 *   - L 直线点列按"前段终点为起点"衔接。
 * ⚠ ARC 已实测（2026-07-02，PCB2 -90° 圆角板框）：
 *   - 参数顺序 = (arcAngle, endX, endY)；圆心侧取 +sgn 方向（见 discretizeArc），与 geometry.ts 一致。
 * ⚠ 待实测（当前测试板无此几何）：
 *   - R 的 rot≠0 旋转方向；
 *   - R 的 round≠0 圆角（当前按直角近似，对图元归属影响可忽略）。
 *   遇到含弧/旋转板框时用桥接 getSource 实测后定稿，翻转仅一处。
 */

import type { Point, PolygonSource } from './types.js';

/** 解析命令流为有序顶点环（首尾不重复） */
export function parsePolygonSource(src: PolygonSource | undefined | null): Point[] {
  if (!Array.isArray(src) || src.length === 0) return [];
  const head = src[0];
  if (head === 'R') return rectPoints(src);
  if (head === 'CIRCLE') return circlePoints(src);
  return pathPoints(src);
}

/** 取命令流第 i 项为数字，非数字返回 NaN */
const asNum = (v: unknown): number => (typeof v === 'number' ? v : NaN);

/** ['R', x, y, w, h, rot, round] → 4 角（rot=0 不旋转；round 按直角近似） */
function rectPoints(src: PolygonSource): Point[] {
  const x = asNum(src[1]), y = asNum(src[2]), w = asNum(src[3]), h = asNum(src[4]);
  const rot = asNum(src[5]);
  if ([x, y, w, h].some(Number.isNaN)) return [];
  let pts: Point[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y - h },
    { x, y: y - h },
  ];
  if (!Number.isNaN(rot) && Math.abs(rot) > 1e-6) {
    // 绕中心旋转；方向待实测（当前按标准逆时针）
    const cx = x + w / 2, cy = y - h / 2;
    const rad = rot * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    pts = pts.map((p) => ({
      x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
      y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
    }));
  }
  return pts;
}

/** ['CIRCLE', cx, cy, r] → 离散 72 点 */
function circlePoints(src: PolygonSource): Point[] {
  const cx = asNum(src[1]), cy = asNum(src[2]), r = asNum(src[3]);
  if ([cx, cy, r].some(Number.isNaN) || r <= 0) return [];
  const N = 72;
  const pts: Point[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** 路径模式：x1 y1 起点 + L/ARC/CARC/C 段 */
function pathPoints(src: PolygonSource): Point[] {
  const pts: Point[] = [];
  let i = 0;
  const x0 = asNum(src[0]), y0 = asNum(src[1]);
  if (!Number.isNaN(x0) && !Number.isNaN(y0)) {
    pts.push({ x: x0, y: y0 });
    i = 2;
  }
  const last = (): Point => pts[pts.length - 1];
  const isNum = (v: unknown): v is number => typeof v === 'number';

  while (i < src.length) {
    const cmd = src[i];
    i++;
    if (cmd === 'L') {
      while (i + 1 < src.length && isNum(src[i]) && isNum(src[i + 1])) {
        pts.push({ x: src[i] as number, y: src[i + 1] as number });
        i += 2;
      }
    }
    else if (cmd === 'ARC' || cmd === 'CARC') {
      // 按类型注释文字：arcAngle, endX, endY（举例暗示相反，待实测）
      const ang = src[i], ex = src[i + 1], ey = src[i + 2];
      i += 3;
      pts.push(...discretizeArc(last(), { x: ex as number, y: ey as number }, ang as number));
    }
    else if (cmd === 'C') {
      // 三阶贝塞尔：每段 3 点对（c1, c2, end）
      while (i + 5 < src.length && [0, 1, 2, 3, 4, 5].every((k) => isNum(src[i + k]))) {
        const c1 = { x: src[i] as number, y: src[i + 1] as number };
        const c2 = { x: src[i + 2] as number, y: src[i + 3] as number };
        const end = { x: src[i + 4] as number, y: src[i + 5] as number };
        i += 6;
        pts.push(...discretizeBezier(last(), c1, c2, end));
      }
    }
    else {
      // 未知命令标记，停止解析
      break;
    }
  }
  return dedupeClose(pts);
}

/**
 * 圆弧离散：已知起点、终点、扫角（度，带符号）。
 * 圆心侧方向依赖坐标系手性，当前为合理默认；待含弧板框实测后定稿。
 * 返回不含起点的中间点序列（起点由调用方的前段终点提供），末点 ≈ end。
 */
function discretizeArc(start: Point, end: Point, sweepDeg: number): Point[] {
  if (!start || [start.x, start.y, end?.x, end?.y, sweepDeg].some((v) => typeof v !== 'number' || Number.isNaN(v))) return [];
  const sweep = (sweepDeg * Math.PI) / 180;
  if (Math.abs(sweep) < 1e-9) return [end];
  const dx = end.x - start.x, dy = end.y - start.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9) return [end];
  const half = sweep / 2;
  const sinHalf = Math.sin(half);
  if (Math.abs(sinHalf) < 1e-6) return [end]; // 接近 180° 半圆退化，跳过细分
  const r = Math.abs(chord / (2 * sinHalf));
  const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
  // 圆心侧：实测(2026-07-02，PCB2 含 -90° 圆角板框)取 +sgn 方向才正确（与 geometry.ts discretizeArc 一致）。
  // 此前用 -sgn 导致离散弧终点落在弦另一侧、与下一段端点错开 ~90mil，拟合板框无法闭合。
  const nx = -dy / chord, ny = dx / chord;
  const off = r * Math.cos(half);
  const sgn = sweep >= 0 ? 1 : -1;
  const cx = mx + nx * off * sgn;
  const cy = my + ny * off * sgn;
  const a0 = Math.atan2(start.y - cy, start.x - cx);
  const N = Math.max(4, Math.ceil(Math.abs(sweepDeg) / 10));
  const pts: Point[] = [];
  for (let k = 1; k <= N; k++) {
    const a = a0 + sweep * (k / N);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** 三阶贝塞尔离散（16 段） */
function discretizeBezier(p0: Point, c1: Point, c2: Point, p3: Point): Point[] {
  const N = 16;
  const pts: Point[] = [];
  for (let k = 1; k <= N; k++) {
    const t = k / N, mt = 1 - t;
    pts.push({
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p3.y,
    });
  }
  return pts;
}

/** 若首尾点重合则去掉末点（保持首尾不重复的环） */
function dedupeClose(pts: Point[]): Point[] {
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) pts.pop();
  }
  return pts;
}
