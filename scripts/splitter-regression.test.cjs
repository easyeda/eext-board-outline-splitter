const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const quietConsole = { warn() {}, error() {} };
function load(relativePath, eda) {
  const code = esbuild.buildSync({ entryPoints: [path.join(root, relativePath)], bundle: true, write: false, format: 'cjs', platform: 'node' }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, eda, console: quietConsole, setTimeout });
  return module.exports;
}
const primitive = id => ({ getState_PrimitiveId: () => id });
const emptyTypes = () => Object.fromEntries(['lines', 'arcs', 'components', 'pads', 'vias', 'regions', 'fills', 'pours', 'dimensions', 'images'].map(key => [key, []]));
const environment = version => ({ getEditorCurrentVersion: () => version });
function completeRules() {
  const groups = {
    Spacing: ['Safe Spacing', 'Other Spacing'],
    Physics: ['Track', 'Net Length Range', 'Net Length Tolerance', 'Differential Pair', 'Via Size'],
    Plane: ['Plane Zone', 'Copper Zone'],
    Expansion: ['Solder Mask Expansion', 'Paste Mask Expansion'],
  };
  return Object.fromEntries(Object.entries(groups).map(([group, types]) => [group,
    Object.fromEntries(types.map(type => [type, { default: { isSetDefault: true, value: 6 } }])),
  ]));
}

test('component deletion cascades to pads; only remaining standalone pads are deleted', async () => {
  const components = new Map([['outside', primitive('outside')]]);
  const pads = new Map(['outside-pad', 'loose-pad', 'kept-pad'].map(id => [id, primitive(id)]));
  const padRequests = [];
  const eda = {
    pcb_PrimitiveComponent: {
      getAll: async () => [...components.values()],
      delete: async ids => { ids.forEach(id => components.delete(id)); pads.delete('outside-pad'); return true; },
    },
    pcb_PrimitivePad: {
      getAll: async () => [...pads.values()],
      delete: async ids => {
        padRequests.push(...ids);
        assert.ok(ids.every(id => pads.has(id)), 'must never submit a missing pad');
        ids.forEach(id => pads.delete(id));
        return true;
      },
    },
  };
  const byType = { ...emptyTypes(), components: [...components.values()], pads: [...pads.values()] };
  const { deleteNonKeep } = load('src/core/eda/primitives.ts', eda);
  assert.equal(await deleteNonKeep(byType, new Set(['kept-pad'])), 2);
  assert.deepEqual(padRequests, ['loose-pad']);
  assert.deepEqual([...pads.keys()], ['kept-pad']);
});

for (const mode of ['false', 'silent-no-op', 'throw', 'read-failure']) {
  test(`primitive deletion reports ${mode} as failure`, async () => {
    const item = primitive('pad');
    const eda = { pcb_PrimitivePad: {
      getAll: async () => { if (mode === 'read-failure') throw new Error('read failed'); return [item]; },
      delete: async () => { if (mode === 'throw') throw new Error('delete failed'); return mode !== 'false'; },
    } };
    const { deleteNonKeep } = load('src/core/eda/primitives.ts', eda);
    await assert.rejects(deleteNonKeep({ ...emptyTypes(), pads: [item] }, new Set()), /删除 pads 图元失败/);
  });
}

test('rule synchronization unwraps config and preserves false results', async () => {
  const config = { clearance: { value: 6 } };
  const writes = [];
  const eda = { sys_Environment: environment('4.1.78'), pcb_Drc: {
    getCurrentRuleConfiguration: async () => ({ config, name: 'source' }),
    overwriteCurrentRuleConfiguration: async value => { writes.push(value); return false; },
  } };
  const rules = load('src/core/eda/rules.ts', eda);
  assert.equal(await rules.getCurrentRules(), config);
  assert.equal(await rules.overwriteRules(await rules.getCurrentRules()), false);
  assert.equal(writes[0], config);
});

test('rule reader also supports direct config responses', async () => {
  const config = { clearance: 6 };
  const rules = load('src/core/eda/rules.ts', { sys_Environment: environment('4.1.78'), pcb_Drc: { getCurrentRuleConfiguration: async () => config } });
  assert.equal(await rules.getCurrentRules(), config);
});

test('version comparison supports 4.1.84+, numeric patch versions and future major versions', () => {
  const rules = load('src/core/eda/rules.ts', {});
  for (const version of ['3.2.176', '4.0.999', '4.1.71', '4.1.78', '4.1.83', 'v4.1.78']) {
    assert.equal(rules.requiresUniqueDefaultRules(version), false, version);
  }
  for (const version of ['4.1.84', '4.1.85', '4.1.100', '4.2.0', '4.10.0', '5.0.0', '10.0.0', 'V4.1.84', '4.1.84.ede77931', '4.1.84-beta.1', '', 'unknown']) {
    assert.equal(rules.requiresUniqueDefaultRules(version), true, version);
  }
});

test('4.1.84+ normalizes read and write envelopes without changing source rules', async () => {
  for (const version of ['4.1.84', '4.1.100', '4.2.0', '5.0.0']) {
    const config = completeRules();
    const original = JSON.stringify(config);
    const writes = [];
    const rules = load('src/core/eda/rules.ts', {
      sys_Environment: environment(version),
      pcb_Drc: {
        getCurrentRuleConfiguration: async () => ({ config, name: 'source' }),
        overwriteCurrentRuleConfiguration: async value => { writes.push(value); return true; },
      },
    });
    assert.equal(await rules.getCurrentRules(), config);
    assert.equal(await rules.overwriteRules({ config, name: 'source' }), true);
    assert.equal(writes[0], config);
    assert.equal(JSON.stringify(config), original);
  }
});

test('4.1.84+ rejects missing, duplicate and non-boolean defaults before calling the write API', async () => {
  for (const mode of ['missing', 'duplicate', 'non-boolean', 'missing-category']) {
    const config = completeRules();
    const safeSpacing = config.Spacing['Safe Spacing'];
    if (mode === 'missing') safeSpacing.default.isSetDefault = false;
    if (mode === 'duplicate') safeSpacing.other = { isSetDefault: true };
    if (mode === 'non-boolean') safeSpacing.default.isSetDefault = 1;
    if (mode === 'missing-category') delete config.Spacing['Safe Spacing'];
    const original = JSON.stringify(config);
    let writes = 0;
    const rules = load('src/core/eda/rules.ts', {
      sys_Environment: environment('4.1.84'),
      pcb_Drc: {
        getCurrentRuleConfiguration: async () => ({ config, name: 'source' }),
        overwriteCurrentRuleConfiguration: async () => { writes++; return true; },
      },
    });
    await assert.rejects(rules.getCurrentRules(), /EDA 4\.1\.84.*Spacing \/ Safe Spacing/);
    await assert.rejects(rules.overwriteRules(config), /EDA 4\.1\.84.*Spacing \/ Safe Spacing/);
    assert.equal(writes, 0);
    assert.equal(JSON.stringify(config), original);
  }
});

test('4.1.84+ keeps false results and propagates API exceptions', async () => {
  for (const failure of ['false', 'throw']) {
    const rules = load('src/core/eda/rules.ts', {
      sys_Environment: environment('4.1.84'),
      pcb_Drc: { overwriteCurrentRuleConfiguration: async () => {
        if (failure === 'throw') throw new Error('backend rejected rules');
        return false;
      } },
    });
    if (failure === 'false') assert.equal(await rules.overwriteRules(completeRules()), false);
    else await assert.rejects(rules.overwriteRules(completeRules()), /backend rejected rules/);
  }
});

test('unknown runtime versions use strict validation', async () => {
  const rules = load('src/core/eda/rules.ts', { pcb_Drc: { getCurrentRuleConfiguration: async () => ({ config: {} }) } });
  await assert.rejects(rules.getCurrentRules(), /EDA unknown.*缺少默认规则/);
});

test('split results report rule and save failures instead of success', async () => {
  const helperNames = ['collectBoardOutlineRegions', 'collectAllByType', 'buildRepPoints', 'deleteNonKeep', 'countKept', 'copyPcbFree', 'modifyPcbName', 'deletePcb', 'findFreePcbByName', 'waitForFreePcbGone', 'getCurrentPcbInfo', 'getAllPcbsInfo', 'openAndActivate', 'activateAndConfirm', 'deleteOtherBoardOutlines', 'deleteOtherLineOutlines', 'collectLineBoards', 'savePcb', 'getCurrentRules', 'overwriteRules', 'attachTempBoard', 'detachTempBoard'];
  const built = await esbuild.build({
    entryPoints: [path.join(root, 'src/core/splitter.ts')], bundle: true, write: false, format: 'cjs', platform: 'node',
    plugins: [{ name: 'mock-helpers', setup(build) {
      build.onResolve({ filter: /^\.\/eda-helpers\.js$/ }, () => ({ path: 'helpers', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: helperNames.map(name => `export const ${name} = (...args) => scenario.${name}(...args);`).join('\n') }));
    } }],
  });
  for (const failure of ['source-rules', 'rules', 'save', 'none']) {
    let copies = 0;
    let saves = 0;
    const scenario = {
      getCurrentRules: async () => {
        if (failure === 'source-rules') throw new Error('source defaults invalid');
        return { clearance: 6 };
      },
      activateAndConfirm: async () => true,
      copyPcbFree: async () => ++copies === 1 ? 'probe' : 'clone',
      deletePcb: async () => true,
      findFreePcbByName: async () => undefined,
      getAllPcbsInfo: async () => [{ uuid: 'clone', name: 'source_1' }],
      getCurrentPcbInfo: async () => ({ uuid: 'clone', name: 'source_1' }),
      collectBoardOutlineRegions: async () => ({ regions: [], lineSegs: [] }),
      collectLineBoards: async () => ({ loops: [] }),
      collectAllByType: async () => emptyTypes(),
      buildRepPoints: async () => new Map(),
      deleteNonKeep: async () => 0,
      deleteOtherBoardOutlines: async () => 0,
      deleteOtherLineOutlines: async () => 0,
      overwriteRules: async () => failure !== 'rules',
      savePcb: async () => { saves++; return failure !== 'save'; },
      countKept: () => 0,
      openAndActivate: async () => true,
    };
    const module = { exports: {} };
    vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, scenario, console: quietConsole, setTimeout });
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const board = { index: 1, center: { x: 5, y: 5 }, holes: [], outer: { points, bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, sourceIds: [] } };
    const run = () => module.exports.splitAll([board], { uuid: 'source', name: 'source' }, { overwriteExisting: false }, () => {});
    if (failure === 'source-rules') {
      await assert.rejects(run(), /source defaults invalid/);
      assert.equal(copies, 0);
      continue;
    }
    const [result] = await run();
    assert.equal(result.status, failure === 'none' ? 'created' : 'failed');
    if (failure === 'rules') { assert.match(result.error, /同步设计规则失败/); assert.equal(saves, 0); }
    if (failure === 'save') assert.match(result.error, /保存拆分 PCB 失败/);
  }
});
