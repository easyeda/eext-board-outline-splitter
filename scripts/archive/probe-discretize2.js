const out = {};
const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
const p = Array.isArray(sel) ? sel[0] : sel;
if (p) {
  out.selId = p.getState_PrimitiveId();
  const cp = p.getState_ComplexPolygon();
  try { const d = cp.discretize(); out.discIsArray = Array.isArray(d); out.discLen = Array.isArray(d) ? d.length : null; if (Array.isArray(d)) { out.discSample = d.slice(0, 20); if (d[0] != null) { out.elem0kind = Array.isArray(d[0]) ? 'arr' : typeof d[0]; out.elem0 = Array.isArray(d[0]) ? d[0].slice(0,4) : (typeof d[0]==='object' ? Object.keys(d[0]).slice(0,6) : d[0]); } } else out.discSample = String(d).slice(0,300); }
  catch(e) { out.discErr = String(e); }
}
// 用 id 取真实 Region 对象
try { const r = await eda.pcb_PrimitiveRegion.get('e102'); out.regionGetType = r ? r.getState_PrimitiveType?.() : null; if (r) { const cp2 = r.getState_ComplexPolygon?.(); out.regionGetSource = cp2 ? cp2.getSource?.() : null; } }
catch(e) { out.regionGetErr = String(e); }
// 各类型在 layer-11 的枚举计数
const mods = { Line:'pcb_PrimitiveLine', Arc:'pcb_PrimitiveArc', Polyline:'pcb_PrimitivePolyline', Region:'pcb_PrimitiveRegion', Fill:'pcb_PrimitiveFill', Pour:'pcb_PrimitivePour' };
out.layer11enum = {};
for (const [t,m] of Object.entries(mods)) { try { const a = await eda[m].getAll(undefined, 11); out.layer11enum[t] = Array.isArray(a) ? a.length : ('notarr:' + (a==null?String(a):typeof a)); } catch(e) { out.layer11enum[t] = 'err:'+String(e); } }
return out;
