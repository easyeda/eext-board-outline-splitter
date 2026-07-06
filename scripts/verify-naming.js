/* 验证命名冲突根因：
   1) 列全部 PCB（名 / 是否游离 / 所属项目）—— 找残留与非游离占用
   2) 找出 xxx_N 命名系列
   3) 实测 copyPcb 对当前聚焦 PCB 的自动命名（建克隆→读名→立即删除→确认删干净，净零副作用） */
const out = {};

// 1) 当前聚焦 PCB
try {
  const info = await eda.dmt_Pcb.getCurrentPcbInfo();
  out.focused = info ? { uuid: info.uuid, name: info.name } : null;
} catch (e) { out.focusedErr = String(e); }

// 2) 全部 PCB
let all = [];
try { all = (await eda.dmt_Pcb.getAllPcbsInfo()) ?? []; } catch (e) { out.allErr = String(e); }
out.allPcbs = all.map(p => ({ name: p.name, free: !p.parentBoardName, parent: p.parentBoardName ?? null }));
out.count = all.length;

// 3) xxx_N 命名系列（同 base 下 ≥2 个才报）
const byBase = {};
for (const p of all) {
  const m = String(p.name).match(/^(.*)_(\d+)$/);
  if (m) (byBase[m[1]] ??= []).push({ suffix: Number(m[2]), name: p.name, free: !p.parentBoardName });
}
out.series = {};
for (const [base, arr] of Object.entries(byBase)) {
  if (arr.length >= 2) out.series[base] = arr.sort((a, b) => a.suffix - b.suffix).map(a => `${a.name}(${a.free ? 'free' : 'in-project'})`);
}

// 4) 实测 copyPcb 自动命名（仅当聚焦 PCB 名以 _N 结尾）
if (out.focused && /_\d+$/.test(out.focused.name)) {
  try {
    const r = await eda.dmt_Pcb.copyPcb(out.focused.uuid);
    if (typeof r === 'string') {
      const all2 = (await eda.dmt_Pcb.getAllPcbsInfo()) ?? [];
      const clone = all2.find(p => p.uuid === r);
      out.copyPcbTest = {
        source: out.focused.name,
        cloneAutoName: clone?.name ?? '?',
        cloneFree: clone ? !clone.parentBoardName : null,
      };
      // 立即删除测试克隆（净零）
      try {
        await eda.dmt_Pcb.deletePcb(r);
        let gone = false;
        for (let i = 0; i < 20; i++) {
          const all3 = (await eda.dmt_Pcb.getAllPcbsInfo()) ?? [];
          if (!all3.find(p => p.uuid === r)) { gone = true; break; }
          await new Promise(res => setTimeout(res, 200));
        }
        out.copyPcbTest.cleanedUp = gone;
      } catch (e) { out.copyPcbTest.cleanupErr = String(e); }
    }
    else {
      out.copyPcbTest = { source: out.focused.name, result: 'undefined（克隆失败/源未就绪）', resultType: typeof r };
    }
  } catch (e) { out.copyPcbTestErr = String(e); }
}
else {
  out.copyPcbTest = { skipped: '聚焦 PCB 名不以 _N 结尾：' + (out.focused?.name ?? 'null') };
}

return out;
