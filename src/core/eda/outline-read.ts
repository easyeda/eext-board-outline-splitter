/**
 * 板框轮廓读取（识别阶段，运行于源 PCB）：
 *  - collectBoardOutlineRegions：板框层(layer 11)的 Board Outline/Cutout Region，
 *    以及板框层上非 Region 的 Polyline/Arc 线条（经 doSelect 可靠读取，避免 getAll 视图下
 *    Region 伪装成 Polyline 无法区分）。
 *  - collectLineBoards：顶层(layer 1)无网络线条 + 上述板框层线条，端点相接拟合闭合环。
 *
 * 区分走线：顶层走线是 Line 类型(有 net)��Polyline/Arc 无 net 的是绘图/板框线。
 * 单条闭合 Polyline（首尾重合）直接成环；多条线段端点相接走 outline-fit 拟合。
 */

import type { Point, BBox, Loop, PolygonSource } from '../types.js';
import { BOARD_OUTLINE_LAYER } from '../types.js';
import { bboxOf, discretizeArc } from '../geometry.js';
import { parsePolygonSource } from '../polygon-parse.js';
import { recognizeLoops, type FitSegment } from '../outline-fit.js';
import { clearSelected, doSelectPrimitives, getAllSelectedPrimitives, getBBox } from './selection.js';

/** 取原始命令流的首尾点（绕开 parsePolygonSource 的 dedupeClose，保留真实闭合信息） */
function rawEnds(src: PolygonSource | undefined | null): { first: Point; last: Point } | null {
  if (!Array.isArray(src)) return null;
  const nums: number[] = [];
  for (const t of src) if (typeof t === 'number') nums.push(t);
  if (nums.length < 4) return null;
  return { first: { x: nums[0], y: nums[1] }, last: { x: nums[nums.length - 2], y: nums[nums.length - 1] } };
}

/** 把单条线条图元按闭合性分流：单条闭合/整体形状 → 直接成环；否则 → 进多段拟合段池。
 *  顶层(layer 1)与板框层(layer 11)线条共用此逻辑。 */
function classifyLineGraphic(id: string, src: PolygonSource | undefined, points: Point[], loops: Loop[], segs: FitSegment[]): void {
  if (points.length < 2) return;
  // ⚠ 闭合判定用原始 src 首尾(rawEnds)：parsePolygonSource 的 dedupeClose 会去掉严格重合的末点，
  //   使 pts 首尾不再重合而误判开放（实测闭合折线 gap 可达 265mil）。单条自闭合容差 15mil。
  const ends = rawEnds(src);
  const endsMeet = ends ? Math.hypot(ends.first.x - ends.last.x, ends.first.y - ends.last.y) < 15 : false;
  const isWholeShape = Array.isArray(src) && (src[0] === 'CIRCLE' || src[0] === 'R');
  if (endsMeet || isWholeShape) {
    if (points.length >= 3) loops.push({ points, bbox: bboxOf(points), sourceIds: [id] });
  }
  else {
    segs.push({ id, points });
  }
}

/** 板框层的板框/挖孔 Region 原始数据 */
export interface RawBoardRegion {
  id: string;
  /** Board Outline=板框外轮廓；Board Cutout=挖孔 */
  kind: 'outline' | 'cutout';
  /** getState_ComplexPolygon().getSource() 命令流 */
  source: Array<string | number>;
  /** 真实板框范围（layer-11 的 getPrimitivesBBox 返回板轮廓外接矩形） */
  bbox: BBox;
}

/** 板框层(layer 11)上非 Region 的线条图元（Polyline/Arc）原始数据，交给线条拟合 */
export interface RawLineSeg {
  id: string;
  /** Polyline 命令流（用于 rawEnds 闭合判定）；Arc 为 undefined */
  src?: PolygonSource;
  /** 解析后的点序列（≥2） */
  points: Point[];
}

/**
 * 采集板框层全部 Board Outline / Board Cutout Region。
 *
 * 链路（2026-07-01 桥接实测确定，运行时 API 0.2.53）：
 *  1. `pcb_PrimitivePolyline.getAll(undefined, 11)` 是枚举 layer-11 图元 id 的唯一可靠入口
 *     （pcb_PrimitiveRegion.getAll 取不到板框 Region；模块名虽叫 Polyline，但能列出该层全部���元 id）。
 *  2. 枚举得到的对象是 Polyline 视图，无法读几何（无 getState_ComplexPolygon，数据陈旧）；
 *     必须 `doSelectPrimitives(ids)` → `getAllSelectedPrimitives()` 拿真实 Region 对象。
 *  3. 真实对象 `getState_RegionName()` 区分 Board Outline / Board Cutout，
 *     `getState_ComplexPolygon().getSource()` 取命令流几何。
 */
export async function collectBoardOutlineRegions(): Promise<{ regions: RawBoardRegion[]; lineSegs: RawLineSeg[]; warnings: string[] }> {
  const warnings: string[] = [];
  const lineSegs: RawLineSeg[] = [];
  let ids: string[] = [];
  try {
    const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, BOARD_OUTLINE_LAYER)) ?? [];
    ids = list.map((p: any) => {
      try { return p.getState_PrimitiveId(); } catch { return null; }
    }).filter((x: any): x is string => typeof x === 'string');
  }
  catch (e) {
    warnings.push(`枚举板框层图元失败: ${String(e)}`);
    return { regions: [], lineSegs: [], warnings };
  }
  if (ids.length === 0) return { regions: [], lineSegs: [], warnings };

  const regions: RawBoardRegion[] = [];
  try {
    await clearSelected();
    await doSelectPrimitives(ids);
    const arr = await getAllSelectedPrimitives();
    for (const p of arr) {
      try {
        const id = p.getState_PrimitiveId();
        const ptype = p.getState_PrimitiveType();
        // 板框层上的非 Region 线条（Polyline/Arc）：作为"线条板框"候选，交给 collectLineBoards 拟合
        if (ptype !== 'Region') {
          if (ptype === 'Polyline' || ptype === 'Arc') {
            const poly = typeof p.getState_Polygon === 'function' ? p.getState_Polygon() : undefined;
            const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : undefined;
            if (Array.isArray(src) && src.length > 0) {
              const pts = parsePolygonSource(src);
              if (pts.length >= 2) lineSegs.push({ id, src, points: pts });
            }
            else if (typeof p.getState_StartX === 'function') {
              const start = { x: p.getState_StartX(), y: p.getState_StartY() };
              const end = { x: p.getState_EndX(), y: p.getState_EndY() };
              const pts = discretizeArc(start, end, p.getState_ArcAngle());
              if (pts.length >= 2) lineSegs.push({ id, points: pts });
            }
          }
          continue;
        }
        const name = typeof p.getState_RegionName === 'function' ? p.getState_RegionName() : undefined;
        const kind: 'outline' | 'cutout' | null =
          name === 'Board Outline' ? 'outline' : name === 'Board Cutout' ? 'cutout' : null;
        if (!kind) { warnings.push(`跳过未识别的板框层 Region（regionName=${String(name)}）`); continue; }
        const cp = typeof p.getState_ComplexPolygon === 'function' ? p.getState_ComplexPolygon() : undefined;
        const source = cp && typeof cp.getSource === 'function' ? cp.getSource() : [];
        const bbox = await getBBox([id]);
        if (!bbox) { warnings.push(`读取板框包围盒失败: ${id}`); continue; }
        regions.push({ id, kind, source, bbox });
      }
      catch (e) { warnings.push(`读取板框图元失败: ${String(e)}`); }
    }
  }
  catch (e) { warnings.push(`选中并读取板框失败: ${String(e)}`); }
  finally {
    try { await clearSelected(); } catch { /* ignore */ }
  }
  return { regions, lineSegs, warnings };
}

/**
 * 采集线条板框：顶层(layer 1)无网络的 Polyline/Arc，以及板框层(layer 11)非 Region 的 Polyline/Arc
 * （后者由 collectBoardOutlineRegions 经 doSelect 可靠读取后通过 extraSegs 传入）。端点相接围成闭合环。
 *
 * 区分走线：顶层走线是 Line 类型(有 net)；Polyline/Arc 无 net 的是绘图/板框线。
 * 单条闭合 Polyline（首尾重合）直接成环；多条线段端点相接走 outline-fit 拟合。
 * Board Cutout 不适用线条模型（挖孔请用 Board Cutout Region）。
 */
export async function collectLineBoards(extraSegs: RawLineSeg[] = []): Promise<{ loops: Loop[]; warnings: string[] }> {
  const warnings: string[] = [];
  const loops: Loop[] = [];
  const segs: FitSegment[] = [];

  // 顶层 Polyline（getAll() 不带 layer，再自己过滤——getAll(undefined,1) 的 getState_Polygon 会返回陈旧数据）
  let polys: any[] = [];
  try {
    polys = (await eda.pcb_PrimitivePolyline.getAll()) ?? [];
  }
  catch (e) {
    warnings.push(`枚举顶层 Polyline 失败: ${String(e)}`);
  }
  for (const p of polys) {
    try {
      if (p.getState_Layer() !== 1) continue; // 只要顶层
      const net = typeof p.getState_Net === 'function' ? p.getState_Net() : undefined;
      if (net) continue; // 有网络=走线，跳过
      const id = p.getState_PrimitiveId();
      const poly = p.getState_Polygon();
      const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon;
      const pts = parsePolygonSource(src);
      classifyLineGraphic(id, src, pts, loops, segs);
    }
    catch (e) {
      warnings.push(`读取顶层 Polyline 失败: ${String(e)}`);
    }
  }

  // 顶层 Arc（离散为多点段参与拟合；同样用 getAll() 再过滤）
  let arcs: any[] = [];
  try {
    arcs = (await eda.pcb_PrimitiveArc.getAll()) ?? [];
  }
  catch (e) {
    warnings.push(`枚举顶层 Arc 失败: ${String(e)}`);
  }
  for (const a of arcs) {
    try {
      if (a.getState_Layer() !== 1) continue;
      const net = typeof a.getState_Net === 'function' ? a.getState_Net() : undefined;
      if (net) continue;
      const id = a.getState_PrimitiveId();
      const start = { x: a.getState_StartX(), y: a.getState_StartY() };
      const end = { x: a.getState_EndX(), y: a.getState_EndY() };
      const ang = a.getState_ArcAngle();
      const pts = discretizeArc(start, end, ang);
      if (pts.length >= 2) segs.push({ id, points: pts });
    }
    catch (e) {
      warnings.push(`读取顶层 Arc 失败: ${String(e)}`);
    }
  }

  // 板框层(layer 11)非 Region 线条：由 collectBoardOutlineRegions 经 doSelect 可靠读取后传入
  // （getAll() 视图下 Region 会伪装成 Polyline 无法区分，故必须走 doSelect 真实对象在此传入）
  for (const seg of extraSegs) {
    if (seg.src) classifyLineGraphic(seg.id, seg.src, seg.points, loops, segs);
    else if (seg.points.length >= 2) segs.push({ id: seg.id, points: seg.points });
  }

  // 多段组合拟合闭合环
  const { loops: fitLoops, warnings: fitWarns } = recognizeLoops(segs);
  warnings.push(...fitWarns);
  loops.push(...fitLoops);
  return { loops, warnings };
}
