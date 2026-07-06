const out = {};
const polys = (await eda.pcb_PrimitivePolyline.getAll()) || [];
out.polylineCount = polys.length;
const lh = {};
for (const p of polys) { try { const k = String(p.getState_Layer()); lh[k] = (lh[k]||0)+1; } catch(e){ lh['__err'] = (lh['__err']||0)+1; } }
out.polylineLayerHist = lh;

const pol11 = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
out.polylineLayer11Count = pol11.length;

if (polys.length) {
  const p0 = polys[0];
  let proto = p0; const names = new Set();
  while (proto && proto !== Object.prototype) { for (const n of Object.getOwnPropertyNames(proto)) names.add(n); proto = Object.getPrototypeOf(proto); }
  out.polylineStateMethods = [...names].filter(n => { try { return typeof p0[n]==='function' && (n.startsWith('getState')||n.startsWith('get')); } catch { return false; } }).sort();
}

out.poly11sample = pol11.slice(0, 3).map(p => {
  const r = {};
  for (const m of ['getState_PrimitiveId','getState_Layer','getState_PrimitiveType','getState_Points','getState_ComplexPolygon','getState_PolylinePoints','getState_StartX','getState_StartY']) {
    try { if (typeof p[m] === 'function') { const v = p[m](); r[m] = (v && typeof v==='object') ? (Array.isArray(v) ? v.slice(0,30) : (v.getSource ? '[hasGetSource]' : String(v).slice(0,200))) : v; } } catch(e) { r[m] = 'err:'+String(e); }
  }
  return r;
});
return out;
