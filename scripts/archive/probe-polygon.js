const pol11 = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
return pol11.map(p => {
  const poly = p.getState_Polygon();
  const info = {};
  if (poly != null) {
    info.protoName = Object.getPrototypeOf(poly)?.constructor?.name;
    info.ownKeys = Object.keys(poly).slice(0, 30);
    info.isArray = Array.isArray(poly);
    if (Array.isArray(poly)) info.asArray = poly.slice(0, 60);
    let proto = poly; const names = new Set();
    while (proto && proto !== Object.prototype) { for (const n of Object.getOwnPropertyNames(proto)) names.add(n); proto = Object.getPrototypeOf(proto); }
    info.polyMethods = [...names].filter(n => { try { return typeof poly[n]==='function' && (n.startsWith('getSource')||n.startsWith('get')||n.startsWith('to')); } catch { return false; } }).slice(0, 30);
    if (typeof poly.getSource === 'function') {
      try { const src = poly.getSource(); info.source = Array.isArray(src) ? src.slice(0, 80) : String(src).slice(0, 600); } catch(e) { info.sourceErr = String(e); }
    }
  }
  return { id: p.getState_PrimitiveId(), width: p.getState_LineWidth?.(), polyInfo: info };
});
