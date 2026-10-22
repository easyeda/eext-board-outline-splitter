/**
 * 设计规则读写：取当前聚焦 PCB 的规则、覆写规则（对 eda.pcb_Drc 的薄封装）。
 * 规则同步为拆分时的默认（必选）行为：源 PCB 取规则 → 各克隆覆写。
 */

type RuleConfig = { [key: string]: any };

/** 与 4.1.84 PCB 模块的 REQUIRED_DEFAULT_RULER_TYPES 一致。 */
const REQUIRED_DEFAULT_RULE_TYPES = [
  ['Spacing', 'Safe Spacing'],
  ['Spacing', 'Other Spacing'],
  ['Physics', 'Track'],
  ['Physics', 'Net Length Range'],
  ['Physics', 'Net Length Tolerance'],
  ['Physics', 'Differential Pair'],
  ['Physics', 'Via Size'],
  ['Plane', 'Plane Zone'],
  ['Plane', 'Copper Zone'],
  ['Expansion', 'Solder Mask Expansion'],
  ['Expansion', 'Paste Mask Expansion'],
] as const;

/** 按数字比较版本；无法识别版本时也执行新版校验，避免错误写入。 */
export function requiresUniqueDefaultRules(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:$|[.+-])/i.exec(version.trim());
  if (!match) return true;
  const actual = match.slice(1, 4).map(Number);
  const minimum = [4, 1, 84];
  for (let i = 0; i < minimum.length; i++) {
    if (actual[i] !== minimum[i]) return actual[i] > minimum[i];
  }
  return true;
}

function getRuleCompatibility(): { version: string; strict: boolean } {
  try {
    const version = eda.sys_Environment.getEditorCurrentVersion();
    return { version, strict: requiresUniqueDefaultRules(version) };
  }
  catch (e) {
    console.warn('[BoardOutlineSplitter] 读取 EDA 版本失败，使用新版规则校验：', e);
    return { version: 'unknown', strict: true };
  }
}

/** 读取接口可返回 { config, name }；所有版本的写入接口都只接受配置本体。 */
function normalizeRuleConfig(current: RuleConfig | undefined): RuleConfig | undefined {
  const config = current && Object.prototype.hasOwnProperty.call(current, 'config') ? current.config : current;
  return config && typeof config === 'object' && !Array.isArray(config) ? config : undefined;
}

export function validateUniqueDefaultRules(config: RuleConfig): string[] {
  const errors: string[] = [];
  for (const [group, type] of REQUIRED_DEFAULT_RULE_TYPES) {
    const rules = config[group]?.[type];
    const count = rules && typeof rules === 'object'
      ? Object.values(rules).filter((rule: any) => rule?.isSetDefault === true).length
      : 0;
    if (count === 0) errors.push(`${group} / ${type}：缺少默认规则`);
    else if (count > 1) errors.push(`${group} / ${type}：有 ${count} 个默认规则`);
  }
  return errors;
}

function assertCompatibleRules(config: RuleConfig, compatibility: { version: string; strict: boolean }): void {
  if (!compatibility.strict) return;
  const errors = validateUniqueDefaultRules(config);
  if (errors.length) throw new Error(`EDA ${compatibility.version} 设计规则不符合要求：${errors.join('；')}`);
}

/** 在源 PCB 上预检；不补造默认规则、不修改源配置。 */
export async function getCurrentRules(): Promise<{ [k: string]: any } | undefined> {
  try {
    const compatibility = getRuleCompatibility();
    const current = await eda.pcb_Drc.getCurrentRuleConfiguration();
    const config = normalizeRuleConfig(current);
    if (!config) throw new Error('未读取到有效的设计规则配置');
    assertCompatibleRules(config, compatibility);
    console.warn(`[BoardOutlineSplitter] EDA ${compatibility.version}：${compatibility.strict ? '4.1.84+ 默认规则校验已通过' : '使用旧版兼容规则同步'}`);
    return config;
  }
  catch (e) {
    console.error('[BoardOutlineSplitter] 读取或校验源设计规则失败：', e);
    throw e;
  }
}

/** 覆写当前聚焦 PCB 的设计规则 */
export async function overwriteRules(config: { [k: string]: any }): Promise<boolean> {
  try {
    const normalized = normalizeRuleConfig(config);
    if (!normalized) throw new Error('未提供有效的设计规则配置');
    assertCompatibleRules(normalized, getRuleCompatibility());
    return await eda.pcb_Drc.overwriteCurrentRuleConfiguration(normalized);
  }
  catch (e) {
    console.error('[BoardOutlineSplitter] 同步设计规则失败：', e);
    throw e;
  }
}
