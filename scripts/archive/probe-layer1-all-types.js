const out = {};
for (const [t, m] of Object.entries({ Line: 'pcb_PrimitiveLine', Arc: 'pcb_PrimitiveArc', Polyline: 'pcb_PrimitivePolyline', Region: 'pcb_PrimitiveRegion', Fill: 'pcb_PrimitiveFill' })) {
  try {
    const a = (await eda[m].getAll(undefined, 1)) || [];
    const nets = {};
    for (const p of a) { try { const n = p.getState_Net?.() ?? '(none)'; nets[n] = (nets[n] || 0) + 1; } catch {} }
    out[t] = { count: a.length, nets };
  }
  catch (e) { out[t] = 'err:' + String(e).slice(0, 80); }
}
return out;
