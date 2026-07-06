/**
 * iframe 入口：渲染紧凑 UI 并驱动整条流水线。
 * iframe 内 eda 与主进程为同一对象，可直接执行检测/克隆/删除/保存。
 */

import { detectBoards, splitAll } from '../src/core/splitter.js';
import { getCurrentPcbInfo, clearSelected, doSelectPrimitives } from '../src/core/eda-helpers.js';
import { isCircleLike } from '../src/core/geometry.js';
import type { BoardOutline, BoardCopyResult, NestingWarning, ProgressMsg } from '../src/core/types.js';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

let boards: BoardOutline[] = [];
let srcInfo: { uuid: string; name: string } | undefined;
let warningAbort = false;
let busy = false;

function setRunEnabled(on: boolean): void {
  ($('runBtn') as HTMLButtonElement).disabled = !on;
}

function showWarn(text: string, kind: 'warn' | 'err' | 'ok' = 'warn'): void {
  const box = $('warnBox');
  box.className = kind === 'warn' ? 'warn' : kind === 'err' ? 'warn err' : 'warn ok';
  box.textContent = text;
  box.classList.remove('hidden');
}
function hideWarn(): void {
  $('warnBox').classList.add('hidden');
}

/** 大面积用科学计数法（×10ⁿ 上标），精确且紧凑 */
function fmtArea(a: number): string {
  if (a < 10000) return String(a);
  const exp = Math.floor(Math.log10(a));
  const mantissa = a / Math.pow(10, exp);
  return `${mantissa.toFixed(2)}×10<sup>${exp}</sup>`;
}
/** mil → mm（1 mil = 0.0254 mm 精确；保留 2 位小数）。PCB 内部坐标即 mil，故显示层换算 */
const MIL2MM = 0.0254;
const mm = (m: number): number => Math.round(m * MIL2MM * 100) / 100;

/** 单板签名：质心 + 外接框尺寸 + 挖孔数（mil 取整）。用于判断"检测后 PCB 是否被改动" */
function boardSignature(bd: BoardOutline): string {
  const c = bd.center;
  const bb = bd.outer.bbox;
  return `${Math.round(c.x)},${Math.round(c.y)}|${Math.round(bb.maxX - bb.minX)}x${Math.round(bb.maxY - bb.minY)}|h${bd.holes.length}`;
}
/** 全部板框签名（按签名排序后拼接，忽略板序号顺序，只对几何/数量变化敏感） */
function boardsSignature(bs: BoardOutline[]): string {
  return bs.map(boardSignature).sort().join(';;');
}

function renderBoards(resultMap?: Map<number, BoardCopyResult>): void {
  const list = boards
    .map((bd) => {
      const pts = bd.outer.points;
      const bb = bd.outer.bbox;
      const w = Math.round(bb.maxX - bb.minX);
      const h = Math.round(bb.maxY - bb.minY);
      // 形状感知尺寸：矩形给 W×H、圆给 ⌀直径、多边形给面积；每种同时给 mil 与 mm
      let size: string;
      if (isCircleLike(pts, bb)) size = `⌀${w} mil · ⌀${mm(w)} mm`;
      else size = `${w} × ${h} mil · ${mm(w)} × ${mm(h)} mm`;
      const hole = bd.holes.length ? ` · ${bd.holes.length} 挖孔` : '';
      // 拆分后：状态徽标 + 图元数排在右侧
      const r = resultMap?.get(bd.index);
      let right = '';
      let metaExtra = '';
      if (r) {
        const pillText = r.status === 'created' ? '新建' : r.status === 'updated' ? '更新' : '失败';
        const pill = `<span class="pill ${r.status}">${pillText}</span>`;
        if (r.status === 'failed') {
          right = pill;
          metaExtra = r.error ? ` · ${r.error}` : '';
        }
        else {
          right = `${pill}<span class="cnt">${r.primitiveCount ?? 0} 图元</span>`;
        }
      }
      return `<div class="item"><div class="idx">${bd.index}</div><div class="info"><div class="row"><span class="name">${srcInfo?.name}_${bd.index}</span><span class="right">${right}</span></div><div class="meta">${size}${hole}${metaExtra}</div></div></div>`;
    })
    .join('');
  $('boardList').innerHTML = list;
  attachHoverHighlight();
  $('detectTitle').textContent = `检测到 ${boards.length} 个板框`;
}

async function detectAndRender(): Promise<void> {
  $('detectTitle').textContent = '检测板框中…';
  $('boardList').innerHTML = '';
  hideWarn();
  setRunEnabled(false);

  srcInfo = await getCurrentPcbInfo();
  if (!srcInfo) {
    $('srcName').textContent = '—';
    showWarn('未检测到已打开的 PCB，请先打开一个 PCB 文档。', 'err');
    return;
  }
  $('srcName').textContent = srcInfo.name;

  let result: { boards: BoardOutline[]; warning: { abort: boolean; reason?: string }; warnings: string[] };
  try {
    result = await detectBoards();
  }
  catch (e) {
    showWarn('检测板框失败：' + String(e), 'err');
    $('refreshBtn').classList.remove('hidden');
    return;
  }

  boards = result.boards;
  warningAbort = result.warning.abort;
  renderBoards();
  ($('refreshBtn') as HTMLButtonElement).onclick = () => detectAndRender();
  $('refreshBtn').classList.remove('hidden');

  if (warningAbort) {
    showWarn(result.warning.reason ?? '检测到板框嵌套，已中止。', 'err');
    return;
  }
  if (boards.length === 0) {
    showWarn('未识别到闭合板框。请确认板框绘制在板框层（Line/Arc），且为闭合轮廓。', 'err');
    return;
  }
  // 非阻断告警（如个别异常板框被跳过）以黄色提示，否则清空
  if (result.warnings.length > 0) {
    showWarn(result.warnings.join('；'), 'warn');
  }
  else {
    hideWarn();
  }
  setRunEnabled(true);
}

/**
 * 拆分前现场校验：防止"检测后用户改了 PCB（删/加/移板框、切换 PCB 标签），
 * 却仍按旧快照拆分"的 bug。iframe 的 eda 是实时对象，故重检测永远读到当前真实状态。
 * 返回 true=数据仍有效可继续拆分；false=已变化（已刷新列表+告警），本次中止需用户再确认。
 */
async function ensureFreshOrAbort(): Promise<boolean> {
  const cur = await getCurrentPcbInfo();
  if (!cur) {
    showWarn('未检测到已打开的 PCB，请先打开一个 PCB 文档。', 'err');
    return false;
  }
  // ① PCB 标签被切换：检测时的 PCB 已不是当前聚焦的 PCB
  if (cur.uuid !== srcInfo?.uuid) {
    srcInfo = cur;
    await detectAndRender();
    showWarn(`当前 PCB 已切换为「${cur.name}」，已重新检测，请确认板框后再点击拆分。`, 'warn');
    return false;
  }
  // ② 板框被改动（删/加/移/改尺寸）：重检测并比对签名
  const prevCount = boards.length;
  const prevSig = boardsSignature(boards);
  let fresh: { boards: BoardOutline[]; warning: NestingWarning; warnings: string[] };
  try {
    fresh = await detectBoards();
  }
  catch (e) {
    showWarn('重新检测板框失败：' + String(e), 'err');
    return false;
  }
  if (fresh.warning.abort) {
    boards = fresh.boards;
    warningAbort = true;
    renderBoards();
    setRunEnabled(false);
    showWarn(fresh.warning.reason ?? '检测到板框嵌套，已中止。', 'err');
    return false;
  }
  if (boardsSignature(fresh.boards) !== prevSig) {
    boards = fresh.boards;
    srcInfo = cur;
    warningAbort = false;
    renderBoards();
    setRunEnabled(boards.length > 0);
    showWarn(`板框已变化（原 ${prevCount} → 现 ${boards.length}），已刷新为最新，请确认后再次点击「开始拆分」。`, 'warn');
    return false;
  }
  // ③ 一致：以最新结果为准（防御性）
  boards = fresh.boards;
  srcInfo = cur;
  warningAbort = false;
  return true;
}

/** Hover a row -> highlight that board's outline on the canvas.
 *  doSelectPrimitives is additive, so clearSelected first to highlight only the hovered board. */
function highlightOutline(bd: BoardOutline): void {
  if (busy) return;
  const ids = bd.outer.sourceIds;
  if (!ids || ids.length === 0) return;
  clearSelected()
    .then(() => doSelectPrimitives(ids))
    .catch(() => { /* highlight failure is non-fatal */ });
}

/** Bind row mouseenter for outline highlight. Re-bound each render since rows are recreated. */
function attachHoverHighlight(): void {
  const items = $('boardList').querySelectorAll('.item');
  items.forEach((el, i) => {
    const bd = boards[i];
    if (!bd) return;
    el.addEventListener('mouseenter', () => highlightOutline(bd));
  });
}

// Clear the highlight when the mouse leaves the whole list (bound once at load).
$('boardList').addEventListener('mouseleave', () => { if (!busy) clearSelected().catch(() => {}); });

($('runBtn') as HTMLButtonElement).onclick = async () => {
  if (!srcInfo || warningAbort || boards.length === 0) return;
  setRunEnabled(false);
  busy = true;
  ($('refreshBtn') as HTMLButtonElement).disabled = true;
  ($('runBtn') as HTMLButtonElement).textContent = '校验中…';
  hideWarn();

  const ok = await ensureFreshOrAbort();
  if (!ok) {
    // 校验阶段中止：列表已刷新/已告警，恢复按钮供用户确认后再点
    ($('runBtn') as HTMLButtonElement).textContent = '开始拆分';
    ($('refreshBtn') as HTMLButtonElement).disabled = false;
    setRunEnabled(boards.length > 0 && !warningAbort);
    busy = false;
    return;
  }

  ($('runBtn') as HTMLButtonElement).textContent = '拆分中…';
  const options = { overwriteExisting: ($('overwriteExisting') as HTMLInputElement).checked };
  // 已移除底部进度/日志区，进度回调置空（拆分中仅靠按钮文案提示）
  const progress = (_m: ProgressMsg): void => {};

  try {
    const results = await splitAll(boards, srcInfo!, options, progress);
    renderBoards(new Map(results.map((r) => [r.index, r])));
    ($('runBtn') as HTMLButtonElement).textContent = '完成，可重新拆分';
  }
  catch (e) {
    showWarn('拆分失败：' + String(e), 'err');
    ($('runBtn') as HTMLButtonElement).textContent = '重试';
  }
  finally {
    busy = false;
    setRunEnabled(true);
    ($('refreshBtn') as HTMLButtonElement).disabled = false;
  }
};

// 启动
detectAndRender().catch((e) => {
  showWarn('初始化失败：' + String(e), 'err');
  console.error('init failed:', e);
});
