/**
 * 类型定义（不依赖 EDA API，纯数据结构）
 */

/** 精度容差（mil）。PCB 单位为 1mil，0.01mil 足以区分板框端点又容忍浮点误差 */
export const EPS = 0.01;

/** 板框层 ID = EPCB_LayerId.BOARD_OUTLINE = 11 */
export const BOARD_OUTLINE_LAYER = 11;

/** 2D 点（mil 坐标） */
export interface Point {
  x: number;
  y: number;
}

/** 轴对齐包围盒 */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 单多边形命令流（TPCB_PolygonSourceArray）。
 * 取自板框/挖孔 Region 的 `getState_ComplexPolygon().getSource()`，
 * 由 'L'|'ARC'|'CARC'|'C'|'R'|'CIRCLE' 命令标记与数字坐标交替组成。
 * 解析规则见 polygon-parse.ts。
 */
export type PolygonSource = Array<string | number>;

/** 一个闭合环（板框外环或挖孔），由 Region 命令流解析，或多条线段端点相接拟合而来 */
export interface Loop {
  /** 有序顶点（首尾不重复） */
  points: Point[];
  bbox: BBox;
  /** 构成该环的板框层图元 ID 集合（Region 板框=[单个 regionId]；线条板框=[多条线段 id]），
   *  克隆后按质心匹配本环，把这些 id 加入 forceKeep 精确保留本板轮廓 */
  sourceIds: string[];
}

/** 一个独立板框：一个外环 + 0~N 个挖孔 */
export interface BoardOutline {
  /** 1-based 板序号，用于命名后缀 _1/_2/... */
  index: number;
  outer: Loop;
  holes: Loop[];
  /** 外环几何中心（用于在克隆 PCB 上按几何匹配回对应板） */
  center: Point;
}

/** 嵌套检测结果 */
export interface NestingWarning {
  /** true=疑似多板嵌套，必须中止 */
  abort: boolean;
  reason?: string;
}

/** 单板复制结果 */
export interface BoardCopyResult {
  index: number;
  /** 生成的游离 PCB 名 = 源PCB名 + _index */
  name: string;
  status: 'created' | 'updated' | 'failed';
  /** 保留的图元数 */
  primitiveCount?: number;
  error?: string;
}

/** 拆分选项 */
export interface SplitOptions {
  /** 是否自动覆盖同名游离 PCB。
   *  true=遇到同名先删除再重建；false=预检发现任一同名即整体中止报错（不拆分任何板）。
   *  设计规则同步为默认行为，不再可选。 */
  overwriteExisting: boolean;
}

/** 进度消息（iframe UI 消费） */
export interface ProgressMsg {
  phase: 'detect' | 'nesting' | 'split' | 'done' | 'error';
  message: string;
  /** 当前板序号（split 阶段） */
  boardIndex?: number;
  /** 总进度 0..100 */
  pct?: number;
  /** done 阶段携带的结果 */
  results?: BoardCopyResult[];
  /** nesting 阶段携带的告警 */
  warning?: NestingWarning;
}

export type ProgressFn = (msg: ProgressMsg) => void;
