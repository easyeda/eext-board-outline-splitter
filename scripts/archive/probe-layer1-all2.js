const out = {};
for (const [t, m] of Object.entries({ Line: 'pcb_PrimitiveLine', Arc: 'pcb_PrimitiveArc', Polyline: 'pcb_PrimitivePolyline', Region: 'pcb_PrimitiveRegion', Fill: 'pcb_PrimitiveFill', Pour: 'pcb_PrimitivePour' })) {
  try {
    const a = ((await eda[m].getAll()) || []).filter((p) => { try { return p.getState_Layer?.() === 1; } catch { return false; } });
    out[t] = a.length;
    if (a.length > 0 && t !== 'Polyline') {
      out[t + '_detail'] = a.slice(0, 3).map((p) => {
        const r = { id: p.getState_PrimitiveId?.(), net: p.getState_Net?.() };
        try { r.name = p.getState_RegionName?.(); } catch {}
        try { const cp = p.getState_ComplexPolygon?.(); r.src = cp?.getSource?.(); } catch {}
        try { r.poly = p.getState_Polygon?.()?.polygon ?? p.getState_Polygon?.(); } catch {}
        return r;
      });
    }
  }
  catch (e) { out[t] = 'err:' + String(e).slice(0, 50); }
}
return out;
