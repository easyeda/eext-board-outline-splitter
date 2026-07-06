const out = {};
// EPCB_LayerId 在 execute 上下文非全局，确认枚举是否挂在 eda 上
out.layerEnumOnEda = typeof eda.EPCB_LayerId !== 'undefined' ? eda.EPCB_LayerId?.BOARD_OUTLINE : 'not-on-eda';
try { out.globalKeys = Object.keys(globalThis).filter(k => /Layer/i.test(k)); } catch(e) { out.globalKeys = ['err:'+String(e)]; }

const lineAll = (await eda.pcb_PrimitiveLine.getAll()) || [];
const arcAll = (await eda.pcb_PrimitiveArc.getAll()) || [];
out.counts = { line: lineAll.length, arc: arcAll.length };

const layerHist = {};
for (const l of lineAll) { try { const ly = l.getState_Layer(); const k = String(ly); layerHist[k] = (layerHist[k]||0)+1; } catch(e){ layerHist['__err']=(layerHist['__err']||0)+1; } }
out.lineLayerHist = layerHist;

const arcLayerHist = {};
for (const a of arcAll) { try { const ly = a.getState_Layer(); const k = String(ly); arcLayerHist[k] = (arcLayerHist[k]||0)+1; } catch(e){ arcLayerHist['__err']=(arcLayerHist['__err']||0)+1; } }
out.arcLayerHist = arcLayerHist;

out.lineSample = lineAll.slice(0,5).map(l => { try { return { layer: l.getState_Layer(), sx: l.getState_StartX(), sy: l.getState_StartY(), ex: l.getState_EndX(), ey: l.getState_EndY() }; } catch(e){ return {err:String(e)}; } });

const lineByNum11 = (await eda.pcb_PrimitiveLine.getAll(undefined, 11)) || [];
const lineByEnum = (await eda.pcb_PrimitiveLine.getAll(undefined, 12)) || [];
out.lineFilter = { num11: lineByNum11.length, num12: lineByEnum.length };

const regions = (await eda.pcb_PrimitiveRegion.getAll()) || [];
out.regionCount = regions.length;
if (regions.length) {
  const r0 = regions[0];
  let proto = r0;
  const names = new Set();
  while (proto && proto !== Object.prototype) { for (const n of Object.getOwnPropertyNames(proto)) names.add(n); proto = Object.getPrototypeOf(proto); }
  out.regionStateMethods = [...names].filter(n => { try { return typeof r0[n] === 'function' && n.startsWith('getState'); } catch { return false; } });
  out.regionSample = regions.slice(0, 10).map(r => { try { return { layer: (typeof r.getState_Layer==='function'?r.getState_Layer():null), type: (typeof r.getState_PrimitiveType==='function'?r.getState_PrimitiveType():null) }; } catch(e){ return {err:String(e)}; } });
}

const fills = (await eda.pcb_PrimitiveFill.getAll()) || [];
const pours = (await eda.pcb_PrimitivePour.getAll()) || [];
out.otherCounts = { fill: fills.length, pour: pours.length };
return out;
