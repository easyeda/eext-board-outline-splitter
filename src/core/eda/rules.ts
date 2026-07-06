/**
 * 设计规则读写：取当前聚焦 PCB 的规则、覆写规则（对 eda.pcb_Drc 的薄封装）。
 * 规则同步为拆分时的默认（必选）行为：源 PCB 取规则 → 各克隆覆写。
 */

/** 取当前聚焦 PCB 的设计规则 bundle（同步前在源 PCB 聚焦时调用） */
export async function getCurrentRules(): Promise<{ [k: string]: any } | undefined> {
  try {
    return await eda.pcb_Drc.getCurrentRuleConfiguration();
  }
  catch (e) {
    console.warn('getCurrentRuleConfiguration failed:', e);
    return undefined;
  }
}

/** 覆写当前聚焦 PCB 的设计规则 */
export async function overwriteRules(bundle: { [k: string]: any }): Promise<boolean> {
  try {
    return await eda.pcb_Drc.overwriteCurrentRuleConfiguration(bundle);
  }
  catch (e) {
    console.warn('overwriteCurrentRuleConfiguration failed:', e);
    return false;
  }
}
