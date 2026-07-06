/**
 * 扩展主进程入口。
 * 仅负责注册菜单回调：打开 iframe UI。整条流水线由 iframe 内脚本驱动（iframe 与主进程共享同一 eda 对象）。
 */

// eslint-disable-next-line unused-imports/no-unused-vars
export function activate(_status?: string, _arg?: string): void {
  // 无启动副作用：所有工作在 iframe 内按需进行
}

/** 菜单入口：打开拆分工具 iframe */
export async function splitBoardOutlinesToPcbs(): Promise<void> {
  try {
    await eda.sys_IFrame.openIFrame('/iframe/index.html', 420, 500, 'board-outline-splitter');
  }
  catch (e) {
    console.error('openIFrame failed:', e);
  }
}
