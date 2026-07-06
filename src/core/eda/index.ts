/**
 * EDA 访问层 barrel：按关注点拆分的子模块统一 re-export。
 *  - selection：选中操作与包围盒
 *  - pcb：PCB / 文档生命周期（克隆、改名、删除、激活、保存）
 *  - rules：设计规则读写
 *  - primitives：克隆全量图元采集与归属删除
 *  - outline-read：板框轮廓读取（识别阶段）
 *  - outline-write：克隆上非本板轮廓删除（拆分阶段）
 */
export * from './selection.js';
export * from './pcb.js';
export * from './rules.js';
export * from './primitives.js';
export * from './outline-read.js';
export * from './outline-write.js';
