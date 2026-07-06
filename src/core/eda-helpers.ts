/**
 * EDA 访问层（barrel）：实际实现按关注点拆分到 ./eda/* 子模块
 * （selection / pcb / rules / primitives / outline-read / outline-write）。
 *
 * 此文件仅做统一 re-export，保持 `from './eda-helpers.js'` 的既有导入路径不变
 * （splitter.ts / iframe/app.ts 无需改动任何 import）。
 */
export * from './eda/index.js';
